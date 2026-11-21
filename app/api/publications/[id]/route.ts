import { getFullAnalysis } from "@/lib/db-analysis"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params
  try {
    const analysis = await getFullAnalysis(id)
    if (!analysis) return Response.json({ error: "Публикация не найдена." }, { status: 404 })
    return Response.json({ publication: analysis.publication, totalCandidates: analysis.totalCandidates, classifiedCandidates: analysis.classifiedCandidates, pageCount: analysis.publication.page_count }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return Response.json({ error: "Не удалось загрузить публикацию." }, { status: 500 })
  }
}
