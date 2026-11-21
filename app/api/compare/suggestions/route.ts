import { suggestRagRecords } from "@/lib/rag-compare"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("record")
  if (!id) return Response.json({ error: "Выберите исходную запись." }, { status: 400 })
  try {
    const matches = await suggestRagRecords(id)
    return matches ? Response.json(matches) : Response.json({ error: "Запись не найдена." }, { status: 404 })
  } catch (error) {
    console.error("RAG comparison suggestions failed", error)
    return Response.json({ error: "Не удалось подобрать сопоставимые записи." }, { status: 500 })
  }
}
