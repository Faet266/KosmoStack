import { currentAccount } from "@/lib/current-account"
import { bookmarks, removeBookmark, saveBookmark } from "@/lib/personal-store"

export async function GET() {
  const user = await currentAccount()
  return user ? Response.json({ bookmarks: await bookmarks(user.id) }, { headers: { "Cache-Control": "no-store" } }) : new Response(null, { status: 401 })
}

export async function POST(request: Request) {
  const user = await currentAccount()
  if (!user) return new Response(null, { status: 401 })
  const body = await request.json().catch(() => null)
  const href = typeof body?.href === "string" ? body.href : ""
  const title = typeof body?.title === "string" ? body.title.trim().slice(0,210) : ""
  if (href.length > 600 || !/^\/(?:\?|research\/|cabinet\/)/u.test(href) || /[\\\u0000-\u0020]/u.test(href) || (!title && !body?.remove)) return new Response(null, { status: 400 })
  if (body.remove) await removeBookmark(user.id,href)
  else await saveBookmark(user.id,href,title)
  return Response.json({ ok:true })
}
