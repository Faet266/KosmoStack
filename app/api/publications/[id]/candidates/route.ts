import { getCandidates } from "@/lib/db-analysis"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: RouteContext) {
  const { id } = await params
  const url = new URL(req.url)
  const pageParam = url.searchParams.get("page")
  const classifiedOnly = url.searchParams.get("classified") === "true"
  const limitParam = url.searchParams.get("limit")
  const offsetParam = url.searchParams.get("offset")

  try {
    let candidates = await getCandidates(id)
    if (!candidates.length) return Response.json({ candidates: [], total: 0 }, { headers: { "Cache-Control": "no-store" } })

    if (pageParam) {
      const pageNum = Number.parseInt(pageParam, 10)
      if (Number.isFinite(pageNum) && pageNum >= 1) {
        candidates = candidates.filter((c) => c.page_number === pageNum)
      }
    }
    if (classifiedOnly) {
      candidates = candidates.filter((c) => c.is_classified)
    }

    const total = candidates.length

    // Pagination
    const offset = Number.parseInt(offsetParam ?? "0", 10) || 0
    const limit = Math.min(Number.parseInt(limitParam ?? "1000", 10) || 1000, 5000)
    const paginated = candidates.slice(offset, offset + limit)

    return Response.json(
      {
        candidates: paginated.map((c) => ({
          id: c.id,
          page: c.page_number,
          rawValue: c.raw_value,
          value: c.numeric_value,
          unit: c.unit,
          text: c.context_text,
          sourceFragment: c.source_fragment,
          bbox: c.bbox_x0 !== null ? [c.bbox_x0, c.bbox_y0, c.bbox_x1, c.bbox_y1] : null,
          coordinateSystem: c.coordinate_system,
          extractionMethod: c.extraction_method,
          confidence: c.confidence,
          metricName: c.metric_name,
          metricVariant: c.metric_variant,
          metricK: c.metric_k,
          metricGroup: c.metric_group,
          metricDirection: c.metric_direction,
          isClassified: Boolean(c.is_classified),
        })),
        total,
        offset,
        limit,
        hasMore: offset + limit < total,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return Response.json({ error: "Не удалось загрузить числовые кандидаты." }, { status: 500 })
  }
}
