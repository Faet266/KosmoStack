import { NextResponse, type NextRequest } from "next/server"
import { sessionCookie } from "@/lib/auth-paths"
import { canReadDocument, privateDocument } from "@/lib/personal-store"
import { isSignedIn, authAccount } from "@/lib/auth-store"

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const login = path === "/login"
  if (["/api/auth/code", "/api/auth/verify", "/api/auth/logout"].includes(path)) return NextResponse.next()
  try {
    const token = request.cookies.get(sessionCookie)?.value
    const valid = isSignedIn(token)
    const document = path.match(/^\/api\/(?:documents|publications)\/([^/]+)/u)?.[1] ??
      (path === "/api/exports/analysis" ? request.nextUrl.searchParams.get("id") : null)
    const id = document ? decodeURIComponent(document).toLowerCase() : ""
    if (valid && privateDocument(id)) {
      const user = authAccount(token)
      if (!user || !await canReadDocument(user.id,id)) return NextResponse.json({ error: "PDF не найден." }, { status: 404 })
    }
    if (valid) return login ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next()
  } catch (error) {
    console.error("Session database unavailable", error)
    if (!login) return NextResponse.json({ error: "Хранилище сеансов временно недоступно." }, { status: 503 })
  }
  if (login) return NextResponse.next()
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Войдите в KosmoStack." }, { status: 401 })
  const url = new URL("/login", request.url)
  if (path !== "/" || request.nextUrl.search) url.searchParams.set("next", path + request.nextUrl.search)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|kosmostack-emblem\\.png$|favicon.ico$|icon\\.svg$|apple-icon\\.png$).*)"],
}
