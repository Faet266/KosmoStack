import { metricsExport } from "@/lib/official-export-data"
import { exportResponse } from "@/lib/official-export-response"

export const runtime = "nodejs"

export async function GET() {
  try {
    return await exportResponse(await metricsExport(), "pdf")
  } catch (error) {
    console.error("Metrics PDF export failed", error)
    return Response.json({ error: "Не удалось сформировать отчёт по метрикам." }, { status: 500 })
  }
}
