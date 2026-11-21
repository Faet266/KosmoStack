import { queryRows, type PageRow } from "@/lib/db"
import { getCandidateSummary, getCandidatesByPage, getPages } from "@/lib/db-analysis"

export const runtime = "nodejs"
type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params
  const pageParam = new URL(request.url).searchParams.get("page")
  try {
    if (pageParam !== null) {
      const number = Number(pageParam)
      if (!/^[1-9][0-9]*$/.test(pageParam) || !Number.isInteger(number) || number > 2147483647) {
        return Response.json({ error: "Некорректный номер страницы." }, { status: 400 })
      }
      const [page] = await queryRows<PageRow>("SELECT * FROM pages WHERE publication_id = $1 AND page_number = $2", [id, number])
      if (!page) return Response.json({ error: "Страница не найдена." }, { status: 404 })
      return Response.json({ page, candidates: await getCandidatesByPage(id, number) })
    }

    const pages = await getPages(id)
    if (!pages.length) return Response.json({ error: "Страницы не найдены." }, { status: 404 })
    const counts = new Map((await getCandidateSummary(id)).map((row) => [row.page_number, row]))
    return Response.json({
      pages: pages.map((page) => ({
        pageNumber: page.page_number,
        wordCount: page.word_count,
        characterCount: page.character_count,
        hasText: Boolean(page.has_text),
        extractionMethod: page.extraction_method,
        extractionConfidence: page.extraction_confidence,
        status: page.processing_status,
        candidateCount: counts.get(page.page_number)?.count ?? 0,
        classifiedCount: counts.get(page.page_number)?.classified ?? 0,
      })),
      total: pages.length,
    })
  } catch (error) {
    console.error("Could not read publication pages", error)
    return Response.json({ error: "Не удалось загрузить страницы." }, { status: 500 })
  }
}
