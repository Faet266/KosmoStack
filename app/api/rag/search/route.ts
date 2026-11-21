import { ensureRagImported } from "@/lib/rag-store"
import { queryRows } from "@/lib/db"
import { ensureArchiveIndexed } from "@/lib/rag-index"

export const runtime = "nodejs"
const stopWords = new Set("что какой какая какие как где когда сколько ли и или в на по из для о с у а не the a an is are in of on to what where when how was were about and".split(" "))
type Match = {
  publication_id: string; corpus_id: string | null; title: string; page_number: number
  body: string; extraction_method: string; score: number; record_id: string | null; review_reasons: string[]
}

const searchSql = `
  WITH q AS (SELECT to_tsquery('simple', $1) AS terms),
  matches AS (
    SELECT p.publication_id, d.corpus_id, COALESCE(d.title, d.filename) AS title,
      p.page_number, f.body, p.extraction_method, ts_rank_cd(f.search_vector, q.terms) AS score, NULL::text AS record_id, ARRAY[]::text[] AS review_reasons
    FROM rag_passages f JOIN pages p ON p.id = f.page_id
    JOIN publications d ON d.id = p.publication_id CROSS JOIN q
    WHERE f.search_vector @@ q.terms AND ($2::text IS NULL OR d.id = $2 OR d.corpus_id = $2)
    UNION ALL
    SELECT r.publication_id, d.corpus_id, COALESCE(d.title, d.filename),
      r.source_page, r.source_fragment, COALESCE(r.extraction_method, 'pdf_text'), ts_rank_cd(r.search_vector, q.terms), v.local_id,
      array_remove(ARRAY[
        CASE WHEN COALESCE(v.data_json->>'metric_unit','')='' THEN 'unknown_scale' END,
        CASE WHEN c.card_json->>'binding_status'='visual_region' THEN 'visual_region' END,
        CASE WHEN c.card_json#>>'{source_validation,quote_status}'='needs_visual_review' THEN 'quote_review' END
      ], NULL)
    FROM results r JOIN publications d ON d.id = r.publication_id
    JOIN quality_records v ON v.domain=d.domain AND v.split=d.split AND v.table_name='results'
      AND v.publication_id=d.corpus_id AND r.id=d.id || '/' || v.local_id
    JOIN quality_cards c ON (c.domain,c.split,c.id)=(v.domain,v.split,v.id)
    CROSS JOIN q
    WHERE r.search_vector @@ q.terms AND r.source_page > 0 AND r.source_fragment <> ''
      AND ($2::text IS NULL OR d.id = $2 OR d.corpus_id = $2)
  ), ranked AS (
    SELECT DISTINCT ON (publication_id, page_number, body) * FROM matches
    ORDER BY publication_id, page_number, body, score DESC, record_id NULLS LAST
  )
  SELECT * FROM ranked ORDER BY score DESC, publication_id, page_number, body LIMIT 5
`

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const question = params.get("q")?.trim() ?? ""
  const document = params.get("document")
  if (question.length > 300 || !question || (document?.length ?? 0) > 150) {
    return Response.json({ error: "Введите запрос длиной до 300 символов." }, { status: 400 })
  }
  const terms = [...new Set(question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((term) => !stopWords.has(term)).slice(0, 12)
  if (terms.length === 0) return Response.json({ mode: "none", sources: [] })
  try {
    await ensureRagImported()
    await ensureArchiveIndexed().catch((error) => console.warn("Archive text indexing unavailable", error))
    let rows = await queryRows<Match>(searchSql, [terms.join(" & "), document])
    let mode = "all_terms"
    if (!rows.length && terms.length > 1) {
      mode = "some_terms"
      rows = await queryRows<Match>(searchSql, [terms.join(" | "), document])
    }
    const sources = rows.map((row, i) => {
      const url = row.corpus_id ? `/api/rag/sources/${encodeURIComponent(row.corpus_id)}/pdf` :
        `/api/documents/${encodeURIComponent(row.publication_id)}/file`
      return {
        citation: i + 1, title: row.title, page: row.page_number,
        excerpt: row.body, method: row.extraction_method,
        record: row.corpus_id && row.record_id ? {
          id: `${row.corpus_id}/${row.record_id}`,
          reviewReasons: row.review_reasons,
          url: `/api/rag/results/${encodeURIComponent(row.corpus_id)}/${encodeURIComponent(row.record_id)}`,
        } : null,
        url: `${url}#page=${row.page_number}`,
      }
    })
    const answer = mode === "all_terms" && sources.length ? sources[0].excerpt : null
    return Response.json({ mode: rows.length ? mode : "none", answer, sources }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("PostgreSQL retrieval failed", error)
    return Response.json({ error: "Не удалось выполнить поиск по базе." }, { status: 500 })
  }
}
