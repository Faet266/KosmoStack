import { compareRagRecords } from "@/lib/rag-compare"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const left = params.get("left")
  const right = params.get("right")
  if (!left || !right || left === right) {
    return Response.json({ error: "Выберите две разные записи." }, { status: 400 })
  }
  try {
    const result = await compareRagRecords(left, right)
    return result ? Response.json(result, { headers: { "Cache-Control": "no-store" } }) :
      Response.json({ error: "Одна из записей не найдена в корпусе RAG." }, { status: 404 })
  } catch (error) {
    console.error("RAG comparison failed", error)
    return Response.json({ error: "Не удалось выполнить сравнение. Проверьте доступность Python (RAG_PYTHON)." }, { status: 500 })
  }
}
