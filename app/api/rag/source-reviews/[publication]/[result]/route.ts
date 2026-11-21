import { getSourceReviewHistory, getSourceTask, saveSourceReview } from "@/lib/source-review"

export const runtime = "nodejs"
type Context = { params: Promise<{ publication: string; result: string }> }
const noStore = { "Cache-Control": "no-store" }

async function findTask({ params }: Context) {
  const { publication, result } = await params
  return getSourceTask(`${publication}/${result}`)
}

export async function GET(_request: Request, context: Context) {
  const task = await findTask(context)
  if (!task) return Response.json({ error: "Задача сверки не найдена." }, { status: 404 })
  return Response.json({ history: await getSourceReviewHistory(task.id) }, { headers: noStore })
}

export async function POST(request: Request, context: Context) {
  const task = await findTask(context)
  if (!task) return Response.json({ error: "Задача сверки не найдена." }, { status: 404 })
  const input: unknown = await request.json().catch(() => null)
  const history = input && typeof input === "object" ? await saveSourceReview(task, input as Record<string, unknown>) : null
  return history ? Response.json({ history }, { status: 201, headers: noStore }) :
    Response.json({ error: "Укажите решение, автора и обоснование." }, { status: 400 })
}
