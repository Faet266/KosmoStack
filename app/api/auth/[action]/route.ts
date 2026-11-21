import { NextResponse, type NextRequest } from "next/server"
import { afterLogin, authFeedback, challengeCookie, sessionCookie } from "@/lib/auth-paths"
import { beginLogin, codeSeconds, finishLogin, sessionSeconds, signOut } from "@/lib/auth-store"

export const runtime = "nodejs"
type Context = { params: Promise<{ action: string }> }
const reply = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })

export async function POST(request: NextRequest, { params }: Context) {
  const { action } = await params
  const origin = request.headers.get("origin")
  const host = request.headers.get("host") ?? ""
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/iu.test(host)) {
    return reply({ error: "Локальный вход доступен через localhost." }, 403)
  }
  const expectedOrigin = request.nextUrl.protocol + "//" + host.toLowerCase()
  if ((origin && origin !== expectedOrigin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return reply({ error: "Запрос должен быть отправлен со страницы KosmoStack." }, 403)
  }
  const cookie = { httpOnly: true, secure: request.nextUrl.protocol === "https:",
    sameSite: "lax" as const, path: "/" }
  const nativeForm = request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded") ?? false
  let next = "/"
  const redirect = (location: string) => new NextResponse(null, { status: 303,
    headers: { Location: location, "Cache-Control": "no-store" } })
  const login = (error?: keyof typeof authFeedback) => {
    const params = new URLSearchParams()
    if (next !== "/") params.set("next", next)
    if (error) params.set("error", error)
    return redirect("/login" + (params.size ? "?" + params : ""))
  }
  const fail = (error: keyof typeof authFeedback, status: number) =>
    nativeForm ? login(error) : reply({ error: authFeedback[error] }, status)
  try {
    if (action === "logout") {
      signOut(request.cookies.get(sessionCookie)?.value)
      const result = reply({ ok: true })
      result.cookies.set(sessionCookie, "", { ...cookie, maxAge: 0 })
      result.cookies.set(challengeCookie, "", { ...cookie, maxAge: 0 })
      return result
    }
    const data = nativeForm ? Object.fromEntries(await request.formData()) : await request.json().catch(() => null)
    next = afterLogin(typeof data?.next === "string" ? data.next : null)
    if (action === "code") {
      const email = typeof data?.email === "string" ? data.email.trim().toLowerCase() : ""
      const fullName = typeof data?.fullName === "string" ? data.fullName.trim().replace(/\s+/gu, " ") : ""
      if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/iu.test(email) ||
        fullName.length > 120 || !/^\p{L}[\p{L}\p{M}'’-]*(?: \p{L}[\p{L}\p{M}'’-]*){1,5}$/u.test(fullName)) {
        return fail("details", 400)
      }
      const challenge = beginLogin(email, fullName, request.cookies.get(challengeCookie)?.value)
      if (!challenge) return fail("rate", 429)
      const result = nativeForm ? login() : reply({ code: challenge.code })
      result.cookies.set(challengeCookie, challenge.token, { ...cookie, maxAge: codeSeconds })
      return result
    }
    if (action === "verify") {
      const code = typeof data?.code === "string" ? data.code.trim() : ""
      if (!/^\d{6}$/u.test(code)) return fail("digits", 400)
      const session = finishLogin(request.cookies.get(challengeCookie)?.value, code)
      if (!session) return fail("expired", 400)
      const result = nativeForm ? redirect(next) : reply({ ok: true, next })
      result.cookies.set(challengeCookie, "", { ...cookie, maxAge: 0 })
      result.cookies.set(sessionCookie, session, { ...cookie, maxAge: sessionSeconds })
      return result
    }
    return reply({ error: "Действие не найдено." }, 404)
  } catch (error) {
    console.error("Authentication request failed", error)
    return fail("unavailable", 503)
  }
}
