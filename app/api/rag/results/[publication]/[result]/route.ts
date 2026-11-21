import { getRagResult } from "@/lib/rag-store"

export const runtime = "nodejs"
type Context = { params: Promise<{ publication: string; result: string }> }

export async function GET(_request: Request, { params }: Context) {
  const { publication, result } = await params
  const entry = await getRagResult(`${publication}/${result}`)
  return entry ? Response.json(entry) : Response.json({ error: "Результат не найден." }, { status: 404 })
}
