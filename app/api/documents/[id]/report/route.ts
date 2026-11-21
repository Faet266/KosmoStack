import { analysisExport } from "@/lib/official-export-data"
import { exportResponse } from "@/lib/official-export-response"

export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const data = await analysisExport(id, new URL(request.url).origin, "pdf")
    return data ? await exportResponse(data, "pdf") : Response.json({ error: "PDF не найден." }, { status: 404 })
  } catch (error) {
    if (error instanceof Error && error.message === "Сначала запустите анализ PDF.") {
      return Response.json({ error: error.message }, { status: 409 })
    }
    console.error("PDF analysis export failed", error)
    return Response.json({ error: "Не удалось сформировать PDF-отчёт." }, { status: 500 })
  }
}
