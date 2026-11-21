import ragSchema from "@/tools/quality/data/rag/reference/schema.json"
import type { CsvExportTable, ParticipantData, ParticipantIssue, RagExportTables, ResultRecord, SourceBbox } from "@/lib/result-data"

export type StoredDocument = {
  id: string
  name: string
  file_size: number | string
  created_at: string
}

export type StoredAnalysisRun = {
  id: string
  document_id: string
  created_at: string
}

export type PublicationRow = {
  publication_id: string
  title: string
  year: number | null
  doi: string | null
  authors: string[] | null
  in_scope: boolean | null
  exclusion_reason: string | null
  source_document_id: string | null
}

export type ConfigurationRow = {
  config_id: string
  publication_id: string
  rag_variant: string | null
  retrieval_method: string | null
  retriever_model: string | null
  embedding_model: string | null
  embedding_version: string | null
  chunking_method: string | null
  chunk_size: number | null
  chunk_overlap: number | null
  chunk_unit: string | null
  index_type: string | null
  vector_store: string | null
  top_k: number | null
  reranker_model: string | null
  generator_model: string | null
  generator_version: string | null
  prompt_strategy: string | null
  context_strategy: string | null
  note: string | null
}

export type DatasetRow = {
  dataset_id: string
  publication_id: string
  dataset_name: string
  dataset_version: string | null
  language: string | null
  data_split: string | null
  scientific_domain: string | null
  note: string | null
}

export type TaskRow = { task_id: string; publication_id: string; task_type: string; note: string | null }
export type ExperimentRow = {
  experiment_id: string
  publication_id: string
  evaluation_protocol: string | null
  baseline_name: string | null
  hardware: string | null
  latency_ms: number | string | null
  tokens_per_query: number | string | null
  sample_size: number | null
  note: string | null
}

export type StructuredResultRow = {
  result_id: string
  publication_id: string
  experiment_id: string | null
  config_id: string | null
  dataset_id: string | null
  task_id: string | null
  metric_group: string | null
  metric_name: string | null
  metric_variant: string | null
  metric_direction: string | null
  metric_k: number | null
  metric_value: number | string | null
  metric_unit: string | null
  baseline_value: number | string | null
  aggregation: string | null
  sample_size: number | null
  raw_value: string | null
  raw_unit: string | null
  normalized_value: number | string | null
  normalized_unit: string | null
  result_origin: string | null
  cited_publication_id: string | null
  source_page: number
  source_section: string | null
  source_table: string | null
  source_figure: string | null
  source_fragment: string
  extraction_status: string
  extraction_method: string
  extractor_version: string
  extraction_confidence: number | string | null
  source_bbox: unknown
  source_coordinate_system: string | null
  source_document_id: string | null
  analysis_id: string | null
  duplicate_of: string | null
  review_status: string
  note: string | null
}

export type StructuredIssueRow = {
  issue_id: string
  publication_id: string
  record_ids: string[] | null
  check_name: string
  description: string
  source_page: number | null
  source_fragment: string | null
  analysis_id: string | null
}

export const resultColumns: string[] = ragSchema.tables.results

type ExportTableName = keyof typeof ragSchema.tables

function exportTable(name: ExportTableName, rows: object[]): CsvExportTable {
  const columns = ragSchema.tables[name] as string[]
  return {
    columns: [...columns],
    rows: rows.map((row) => {
      const values = row as Record<string, unknown>
      return columns.map((column) => {
        const value = column === "DOI" ? values.doi : values[column]
        return Array.isArray(value) ? value.join(";") : value === null || value === undefined ? "" : String(value)
      })
    }),
  }
}

function asNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asBbox(value: unknown): SourceBbox | null {
  if (!Array.isArray(value) || value.length !== 4) return null
  const coordinates = value.map(Number)
  return coordinates.every(Number.isFinite) ? coordinates as SourceBbox : null
}

function textValue(value: number | string | null | undefined) {
  return value === null || value === undefined ? "" : String(value)
}

function toCsvTable(columns: string[], rows: unknown[][]): CsvExportTable {
  return { columns, rows: rows.map((row) => row.map((value) => Array.isArray(value) ? value.join(";") : value === null || value === undefined ? "" : String(value))) }
}

function exportRow(result: StructuredResultRow) {
  return {
    publication_id: result.publication_id,
    result_id: result.result_id,
    experiment_id: result.experiment_id ?? "",
    config_id: result.config_id ?? "",
    dataset_id: result.dataset_id ?? "",
    task_id: result.task_id ?? "",
    metric_group: result.metric_group ?? "",
    metric_name: result.metric_name ?? "",
    metric_variant: result.metric_variant ?? "",
    metric_direction: result.metric_direction ?? "",
    metric_k: textValue(result.metric_k),
    metric_value: textValue(result.metric_value),
    metric_unit: result.metric_unit ?? "",
    baseline_value: textValue(result.baseline_value),
    aggregation: result.aggregation ?? "",
    sample_size: textValue(result.sample_size),
    raw_value: result.raw_value ?? "",
    raw_unit: result.raw_unit ?? "",
    normalized_value: textValue(result.normalized_value),
    normalized_unit: result.normalized_unit ?? "",
    result_origin: result.result_origin ?? "",
    cited_publication_id: result.cited_publication_id ?? "",
    source_page: textValue(result.source_page),
    source_section: result.source_section ?? "",
    source_table: result.source_table ?? "",
    source_figure: result.source_figure ?? "",
    source_fragment: result.source_fragment ?? "",
    extraction_status: result.extraction_status,
    duplicate_of: result.duplicate_of ?? "",
    note: result.note ?? "",
  }
}

function structuredRecord(
  result: StructuredResultRow,
  publication: PublicationRow,
  config: ConfigurationRow | undefined,
  dataset: DatasetRow | undefined,
  task: TaskRow | undefined,
  experiment: ExperimentRow | undefined,
  issueIds: string[],
): ResultRecord {
  const model = [config?.retriever_model, config?.generator_model].filter(Boolean).join(" → ") || config?.rag_variant || null
  const metricValue = asNumber(result.metric_value)
  const rawValue = result.raw_value ?? (metricValue === null ? null : String(metricValue))
  const extractionStatus = result.extraction_status === "extracted" || result.extraction_status === "absent"
    ? result.extraction_status
    : "present_not_extractable"
  const reviewStatus = result.review_status === "verified" || result.review_status === "pending"
    ? result.review_status
    : "unreviewed"
  const origin = result.result_origin === "primary" || result.result_origin === "cited" ? result.result_origin : "unclassified"
  const sourceDocumentId = result.source_document_id ?? publication.source_document_id
  const sourcePdfUrl = sourceDocumentId ? `/api/documents/${encodeURIComponent(sourceDocumentId)}/file` : null
  const bbox = asBbox(result.source_bbox)
  const recordId = `${result.publication_id}/${result.result_id}`
  const sourceRow = exportRow(result)

  return {
    id: recordId,
    publicationId: result.publication_id,
    paperTitle: publication.title,
    year: publication.year,
    doi: publication.doi,
    model,
    dataset: dataset?.dataset_name ?? null,
    split: dataset?.data_split ?? null,
    task: task?.task_type ?? null,
    protocol: experiment?.evaluation_protocol ?? null,
    metricName: result.metric_name,
    metricVariant: result.metric_variant,
    metricK: result.metric_k,
    metricValue,
    metricUnit: result.metric_unit,
    rawValue,
    aggregation: result.aggregation,
    origin,
    extractionStatus,
    reviewStatus,
    extractionMethod: result.extraction_method,
    page: result.source_page,
    section: result.source_section,
    table: result.source_table,
    rowLabel: null,
    columnLabel: null,
    sourceFragment: result.source_fragment,
    normalizationRule: null,
    normalizedValue: result.normalized_value === null ? null : String(result.normalized_value),
    normalizedUnit: result.normalized_unit,
    topK: config?.top_k ?? null,
    sourcePdfUrl,
    sourcePageUrl: null,
    sourceImageUrl: null,
    sourceRef: result.analysis_id ? `analysis:${result.analysis_id}:page:${result.source_page}` : `document:${sourceDocumentId ?? "unknown"}:page:${result.source_page}`,
    sourceBbox: bbox,
    sourceImageSize: null,
    sourcePixelToPdfMatrix: null,
    sourceCoordinateSystem: result.source_coordinate_system,
    sourceHeaders: [],
    sourceRowFragmentIds: [],
    sourceRowBbox: null,
    sourceVerificationStatus: reviewStatus === "verified" ? "verified" : reviewStatus === "pending" ? "needs_review" : "unverified",
    sourceEvidenceStatus: result.extraction_status,
    sourceDocumentId,
    blockType: result.source_table ? "table" : result.source_figure ? "figure" : "pdf_text",
    duplicateOf: result.duplicate_of,
    issueIds,
    sourceRow,
  }
}

export function buildStructuredParticipantData(input: {
  publications: PublicationRow[]
  configurations: ConfigurationRow[]
  datasets: DatasetRow[]
  tasks: TaskRow[]
  experiments: ExperimentRow[]
  results: StructuredResultRow[]
  issues: StructuredIssueRow[]
  runs: StoredAnalysisRun[]
}): ParticipantData {
  const publicationMap = new Map(input.publications.map((row) => [row.publication_id, row]))
  const configMap = new Map(input.configurations.map((row) => [row.config_id, row]))
  const datasetMap = new Map(input.datasets.map((row) => [row.dataset_id, row]))
  const taskMap = new Map(input.tasks.map((row) => [row.task_id, row]))
  const experimentMap = new Map(input.experiments.map((row) => [row.experiment_id, row]))
  const latestRunByDocument = new Map<string, string>()
  for (const run of input.runs) {
    if (!latestRunByDocument.has(run.document_id)) latestRunByDocument.set(run.document_id, run.id)
  }
  const activeResultRows = input.results.filter((row) => !row.analysis_id || latestRunByDocument.get(row.source_document_id ?? "") === row.analysis_id)
  const activeAnalysisIds = new Set(latestRunByDocument.values())
  const activeIssueRows = input.issues.filter((row) => !row.analysis_id || activeAnalysisIds.has(row.analysis_id))
  const participantIssues: ParticipantIssue[] = activeIssueRows.map((row) => ({
    id: row.issue_id,
    publicationId: row.publication_id,
    recordIds: row.record_ids ?? [],
    checkName: row.check_name,
    description: row.description,
    sourcePage: row.source_page,
    sourceFragment: row.source_fragment,
  }))
  const issueIdsByResult = new Map<string, string[]>()
  for (const issue of participantIssues) {
    for (const recordId of issue.recordIds) {
      const current = issueIdsByResult.get(recordId) ?? []
      current.push(issue.id)
      issueIdsByResult.set(recordId, current)
    }
  }

  const records = activeResultRows.flatMap((row) => {
    const publication = publicationMap.get(row.publication_id)
    if (!publication) return []
    const issueIds = issueIdsByResult.get(row.result_id) ?? issueIdsByResult.get(`${row.publication_id}/${row.result_id}`) ?? []
    return [structuredRecord(row, publication, row.config_id ? configMap.get(row.config_id) : undefined, row.dataset_id ? datasetMap.get(row.dataset_id) : undefined, row.task_id ? taskMap.get(row.task_id) : undefined, row.experiment_id ? experimentMap.get(row.experiment_id) : undefined, issueIds)]
  }).sort((a, b) => a.paperTitle.localeCompare(b.paperTitle) || (a.page ?? 0) - (b.page ?? 0) || a.id.localeCompare(b.id))

  const filteredIssues = participantIssues.filter((issue) => issue.recordIds.length === 0 || issue.recordIds.some((id) => records.some((record) => record.id.endsWith(`/${id}`) || record.id === id)))
  const exportResultRows = activeResultRows.map(exportRow)
  const repeatCount = records.filter((record) => record.duplicateOf).length
  return {
    records,
    issues: filteredIssues,
    resultColumns,
    exportTables: {
      publications: exportTable("publications", input.publications.map((row) => ({ ...row, DOI: row.doi }))),
      configurations: exportTable("configurations", input.configurations),
      datasets: exportTable("datasets", input.datasets),
      tasks: exportTable("tasks", input.tasks),
      experiments: exportTable("experiments", input.experiments),
      results: exportTable("results", exportResultRows),
      issues: exportTable("issues", activeIssueRows),
    },
    metadata: {
      profileVersion: "RAG · сохранённые структурированные записи",
      schemaVersion: "rag-viniti-adaptation-1.0",
      domain: "RAG",
      split: "Последний анализ",
      publicationCount: input.publications.length,
      resultCount: records.length,
      uniqueResultCount: records.length - repeatCount,
      repeatCount,
      issueCount: filteredIssues.length,
      sourceReviewCount: records.filter((record) => record.reviewStatus !== "verified").length,
    },
  }
}
