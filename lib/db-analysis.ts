import { documentTopics } from "@/lib/document-topics"
import { queryRows, transaction, type CandidateRow, type PageRow, type PublicationRow, type IssueRow } from "@/lib/db"

type AnalysisPage = {
  page: number
  text: string
  wordCount: number
  characterCount: number
  hasText: boolean
  extractionMethod: string
  extractionConfidence: number | null
  status?: string
  error?: string | null
}

type MetricCandidate = {
  page: number
  text: string
  metricName: string | null
  metricVariant?: string | null
  metricK?: number | null
  rawValue: string
  value: number | null
  unit: string | null
  metricGroup?: string | null
  metricDirection?: string | null
  sourceFragment: string
  extractionMethod: string
  confidence: number | null
  bbox: number[] | null
  coordinateSystem: string
}

type PdfAnalysis = {
  title: string | null
  pageCount: number
  pagesProcessed: number
  textPages: number
  scannedPages: number
  ocrPages: number
  totalWords: number
  totalCharacters: number
  metricCandidates: MetricCandidate[]
  pages: AnalysisPage[]
  extractorName: string
  extractorVersion: string
  wordCountMethod: string
  note: string
  sha256?: string | null
}

export async function saveAnalysis(documentId: string, filename: string, analysis: PdfAnalysis) {
  const key = (...values: unknown[]) => JSON.stringify(values)
  const topics = documentId.startsWith("private-") ? documentTopics({title:analysis.title,filename,
    pages:analysis.pages.map((page)=>page.text),metrics:analysis.metricCandidates.flatMap((entry)=>entry.metricName?[entry.metricName]:[])}) : null
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [documentId])
    await db.query(`
      INSERT INTO publications (id, title, filename, page_count, total_words, word_count_method, extractor_name, extractor_version, processing_status, analysis_note, sha256)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'done', $9, $10)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, page_count = excluded.page_count,
        total_words = excluded.total_words, word_count_method = excluded.word_count_method,
        extractor_name = excluded.extractor_name, extractor_version = excluded.extractor_version,
        processing_status = 'done', error_message = NULL, analysis_note = excluded.analysis_note,
        sha256 = COALESCE(excluded.sha256, publications.sha256), updated_at = CURRENT_TIMESTAMP
    `, [documentId, analysis.title, filename, analysis.pageCount, analysis.totalWords,
      analysis.wordCountMethod, analysis.extractorName, analysis.extractorVersion, analysis.note, analysis.sha256 ?? null])

    if (topics) await db.query("UPDATE publications SET automatic_tags=$2 WHERE id=$1",[documentId,topics])

    const previous = new Map<string, number[]>()
    for (const candidate of (await db.query<CandidateRow>("SELECT * FROM numeric_candidates WHERE publication_id = $1 ORDER BY id", [documentId])).rows) {
      const signature = key(candidate.page_number, candidate.raw_value, candidate.numeric_value, candidate.unit,
        candidate.context_text, candidate.source_fragment, candidate.bbox_x0, candidate.bbox_y0,
        candidate.bbox_x1, candidate.bbox_y1, candidate.coordinate_system, candidate.extraction_method,
        candidate.confidence, candidate.metric_name, candidate.metric_variant, candidate.metric_k,
        candidate.metric_group, candidate.metric_direction, candidate.is_classified)
      const ids = previous.get(signature) ?? []
      ids.push(candidate.id)
      previous.set(signature, ids)
    }

    for (const page of analysis.pages) {
      await db.query(`INSERT INTO pages (publication_id, page_number, text_content, word_count, character_count, has_text,
        extraction_method, extraction_confidence, processing_status, error_message)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT(publication_id, page_number) DO UPDATE SET text_content = excluded.text_content,
          word_count = excluded.word_count, character_count = excluded.character_count, has_text = excluded.has_text,
          extraction_method = excluded.extraction_method, extraction_confidence = excluded.extraction_confidence,
          processing_status = excluded.processing_status, error_message = excluded.error_message`,
        [documentId, page.page, page.text, page.wordCount, page.characterCount, Number(page.hasText),
          page.extractionMethod, page.extractionConfidence, page.status ?? "done", page.error ?? null])
    }

    const inserts: unknown[][] = []
    for (const candidate of analysis.metricCandidates) {
      const [x0, y0, x1, y1] = candidate.bbox?.length === 4 ? candidate.bbox : [null, null, null, null]
      const values = [candidate.page, candidate.rawValue, candidate.value, candidate.unit ?? null,
        candidate.text, candidate.sourceFragment, x0, y0, x1, y1, candidate.coordinateSystem ?? null,
        candidate.extractionMethod, candidate.confidence, candidate.metricName ?? null, candidate.metricVariant ?? null,
        candidate.metricK ?? null, candidate.metricGroup ?? null, candidate.metricDirection ?? null, Number(Boolean(candidate.metricName))]
      if (!previous.get(key(...values))?.shift()) inserts.push([documentId, ...values])
    }
    for (let offset = 0; offset < inserts.length; offset += 250) {
      const batch = inserts.slice(offset, offset + 250)
      const parameters = batch.map((row, index) =>
        "(" + row.map((_, column) => "$" + (index * row.length + column + 1)).join(",") + ")")
      await db.query(`INSERT INTO numeric_candidates
        (publication_id, page_number, raw_value, numeric_value, unit, context_text, source_fragment,
         bbox_x0, bbox_y0, bbox_x1, bbox_y1, coordinate_system, extraction_method, confidence,
         metric_name, metric_variant, metric_k, metric_group, metric_direction, is_classified)
        VALUES ${parameters.join(",")}`, batch.flat())
    }
    const stale = [...previous.values()].flat()
    if (stale.length) await db.query(`DELETE FROM numeric_candidates AS c WHERE c.id = ANY($1::integer[])
      AND NOT EXISTS (SELECT 1 FROM results WHERE candidate_id = c.id)`, [stale])
    await db.query(`DELETE FROM pages AS p WHERE p.publication_id = $1 AND NOT (p.page_number = ANY($2::integer[]))
      AND NOT EXISTS (SELECT 1 FROM numeric_candidates WHERE publication_id = p.publication_id AND page_number = p.page_number)`,
      [documentId, analysis.pages.map((page) => page.page)])
  })
  return documentId
}

export async function registerAnalysisDocument(id: string, filename: string, hash: string | null = null) {
  await queryRows(`INSERT INTO publications (id, filename, sha256, processing_status)
    VALUES ($1, $2, $3, 'pending') ON CONFLICT(id) DO UPDATE SET
    sha256 = COALESCE(publications.sha256, excluded.sha256)`, [id, filename, hash])
}

export async function markAnalysisStarted(id: string) {
  await queryRows(`UPDATE publications SET processing_status = 'processing', error_message = NULL,
    updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND corpus_id IS NULL`, [id])
}

export async function recordAnalysisError(id: string, message: string) {
  await queryRows(`UPDATE publications SET error_message = $2,
    processing_status = 'error',
    updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id, message])
}

export async function getPublication(id: string) {
  return (await queryRows<PublicationRow>("SELECT * FROM publications WHERE id = $1", [id]))[0] ?? null
}
export function getPublications(uploads = false) {
  return queryRows<PublicationRow>("SELECT * FROM publications WHERE id NOT LIKE 'private-%' AND (NOT $1::boolean OR corpus_id IS NULL) ORDER BY created_at DESC", [uploads])
}
export function getPages(id: string) {
  return queryRows<PageRow>("SELECT * FROM pages WHERE publication_id = $1 ORDER BY page_number", [id])
}
export function getCandidates(id: string) {
  return queryRows<CandidateRow>("SELECT * FROM numeric_candidates WHERE publication_id = $1 ORDER BY page_number, id", [id])
}
export function getCandidatesByPage(id: string, page: number) {
  return queryRows<CandidateRow>("SELECT * FROM numeric_candidates WHERE publication_id = $1 AND page_number = $2 ORDER BY id", [id, page])
}
export function getIssues(id: string) {
  return queryRows<IssueRow>("SELECT * FROM issues WHERE publication_id = $1 ORDER BY created_at", [id])
}
export function getCandidateSummary(id: string) {
  return queryRows<{ page_number: number; count: number; classified: number }>(
    `SELECT page_number, COUNT(*)::integer AS count, SUM(is_classified)::integer AS classified
     FROM numeric_candidates WHERE publication_id = $1 GROUP BY page_number ORDER BY page_number`, [id])
}

export async function getFullAnalysis(publicationId: string) {
  const data = await transaction(async (db) => {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    const args = [publicationId]
    const pub = (await db.query<PublicationRow>("SELECT * FROM publications WHERE id = $1", args)).rows[0]
    if (!pub) return null
    const pages = (await db.query<PageRow>("SELECT * FROM pages WHERE publication_id = $1 ORDER BY page_number", args)).rows
    const candidates = (await db.query<CandidateRow>("SELECT * FROM numeric_candidates WHERE publication_id = $1 ORDER BY page_number, id", args)).rows
    const issues = (await db.query<IssueRow>("SELECT * FROM issues WHERE publication_id = $1 ORDER BY created_at", args)).rows
    return { pub, pages, candidates, issues }
  })
  if (!data) return null
  const { pub, pages, candidates, issues } = data

  const candidatesByPage = new Map<number, CandidateRow[]>()
  for (const c of candidates) {
    if (!candidatesByPage.has(c.page_number)) candidatesByPage.set(c.page_number, [])
    candidatesByPage.get(c.page_number)!.push(c)
  }

  return {
    publication: pub,
    pages: pages.map((p) => ({
      page: p.page_number,
      text: p.text_content,
      wordCount: p.word_count,
      characterCount: p.character_count,
      hasText: Boolean(p.has_text),
      extractionMethod: p.extraction_method,
      extractionConfidence: p.extraction_confidence,
      status: p.processing_status,
      error: p.error_message,
      candidates: (candidatesByPage.get(p.page_number) ?? []).map(candidateToClient),
    })),
    allCandidates: candidates.map(candidateToClient),
    issues,
    totalCandidates: candidates.length,
    classifiedCandidates: candidates.filter((c) => c.is_classified).length,
  }
}

function candidateToClient(c: CandidateRow) {
  const bbox =
    c.bbox_x0 !== null && c.bbox_y0 !== null && c.bbox_x1 !== null && c.bbox_y1 !== null
      ? ([c.bbox_x0, c.bbox_y0, c.bbox_x1, c.bbox_y1] as [number, number, number, number])
      : null
  return {
    id: c.id,
    page: c.page_number,
    rawValue: c.raw_value,
    value: c.numeric_value,
    unit: c.unit,
    text: c.context_text,
    sourceFragment: c.source_fragment,
    bbox,
    coordinateSystem: c.coordinate_system,
    extractionMethod: c.extraction_method,
    confidence: c.confidence,
    metricName: c.metric_name,
    metricVariant: c.metric_variant,
    metricK: c.metric_k,
    metricGroup: c.metric_group,
    metricDirection: c.metric_direction,
    isClassified: Boolean(c.is_classified),
  }
}
