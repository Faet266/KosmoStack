import { buildRagParticipantData } from "@/lib/rag-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const limit = Number(params.get("limit") ?? "50")
  const offset = Number(params.get("offset") ?? "0")
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
    return Response.json({ error: "Укажите limit от 1 до 100 и неотрицательный offset." }, { status: 400 })
  }
  const query = params.get("q")?.trim().toLowerCase()
  const { records } = await buildRagParticipantData()
  const matches = records.filter((record) => {
    const fields = [record.id, record.paperTitle, record.doi, record.model, record.dataset, record.metricName, record.metricVariant]
    return (!query || fields.some((value) => value?.toLowerCase().includes(query))) &&
      (!params.has("publication") || record.publicationId === params.get("publication")) &&
      (!params.has("metric_k") || String(record.metricK ?? "") === params.get("metric_k"))
  })
  return Response.json({ results: matches.slice(offset, offset + limit), total: matches.length, limit, offset })
}
