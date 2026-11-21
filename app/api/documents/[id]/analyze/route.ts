import { getLocalDocument, getLocalDocumentPaths } from "@/lib/local-documents"
import { readAnalysisState, startPdfAnalysis, stateForJob } from "@/lib/pdf-analysis"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
type Context = { params: Promise<{ id: string }> }
const noStore = { "Cache-Control": "no-store" }

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params
  try {
    const state = await readAnalysisState(id)
    return state ? Response.json(state, { headers: noStore }) :
      Response.json({ error: "PDF не найден." }, { status: 404, headers: noStore })
  } catch (error) {
    console.error("Analysis state unavailable", error)
    return Response.json({ error: "Не удалось прочитать состояние анализа." }, { status: 503, headers: noStore })
  }
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params
  const document = await getLocalDocument(id)
  if (!document) return Response.json({ error: "PDF не найден." }, { status: 404, headers: noStore })
  const job = startPdfAnalysis(id, document.name, getLocalDocumentPaths(id)!.pdfPath, new URL(request.url).searchParams.get("force") === "1")
  return Response.json(stateForJob(job), { status: 202, headers: { ...noStore, "Retry-After": "1" } })
}
