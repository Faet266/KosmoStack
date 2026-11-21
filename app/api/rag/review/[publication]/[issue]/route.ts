import { addReviewRevision, getRagIssues, getReviewHistory, ragPublicationKey } from "@/lib/rag-store"

export const runtime = "nodejs"
type Context = { params: Promise<{ publication: string; issue: string }> }

async function findIssue(context: Context) {
  const { publication, issue } = await context.params
  return getRagIssues().find((row) => row.publicationId === publication && row.id === issue)
}

export async function GET(_request: Request, context: Context) {
  const issue = await findIssue(context)
  if (!issue) return Response.json({ error: "Замечание не найдено." }, { status: 404 })
  const history = await getReviewHistory(`${ragPublicationKey(issue.publicationId)}/${issue.id}`)
  return Response.json({ history }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request, context: Context) {
  const issue = await findIssue(context)
  if (!issue) return Response.json({ error: "Замечание не найдено." }, { status: 404 })
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Ожидается JSON." }, { status: 415 })
  }
  const input = await request.json().catch(() => null)
  if (!input || typeof input !== "object") return Response.json({ error: "Введите данные решения." }, { status: 400 })
  const history = await addReviewRevision(issue, input)
  return history ? Response.json({ history }, { status: 201 }) :
    Response.json({ error: "Укажите автора, причину и допустимую запись для новой привязки." }, { status: 400 })
}
