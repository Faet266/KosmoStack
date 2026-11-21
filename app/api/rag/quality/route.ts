import { getQualityReport } from "@/lib/quality-report"

export const runtime = "nodejs"

export async function GET() {
  try {
    return Response.json(await getQualityReport(), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Scientific report unavailable", error)
    return Response.json({ error: "Не удалось сверить отчёт с активным снимком RAG." }, { status: 503 })
  }
}
