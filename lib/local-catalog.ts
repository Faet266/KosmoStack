import { getCandidates, getIssues, getPublications } from "@/lib/db-analysis"
import type { CandidateRow, IssueRow, PublicationRow } from "@/lib/db"
import type { ParticipantData, ParticipantIssue, ResultRecord, SnapshotMetadata } from "@/lib/result-data"

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s|%/g, "")
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

function textValue(value: number | string | null | undefined) {
  return value === null || value === undefined ? "" : String(value)
}

function issueIdsOf(issue: IssueRow): string[] {
  return issue.record_ids ? issue.record_ids.split(";").map((id) => id.trim()).filter(Boolean) : []
}

function localIssueToParticipantIssue(issue: IssueRow, publicationId: string): ParticipantIssue {
  return {
    id: issue.id,
    publicationId: issue.publication_id ?? publicationId,
    recordIds: issueIdsOf(issue),
    checkName: issue.check_name ?? issue.issue_type,
    description: issue.description,
    sourcePage: issue.page_number,
    sourceFragment: issue.source_fragment,
  }
}

function candidateToRecord(candidate: CandidateRow, publication: PublicationRow, issues: IssueRow[]): ResultRecord {
  const bbox =
    candidate.bbox_x0 !== null && candidate.bbox_y0 !== null && candidate.bbox_x1 !== null && candidate.bbox_y1 !== null
      ? ([candidate.bbox_x0, candidate.bbox_y0, candidate.bbox_x1, candidate.bbox_y1] as [number, number, number, number])
      : null
  const extractionStatus = candidate.is_classified ? "extracted" : "present_not_extractable"
  const recordId = `${publication.id}/${candidate.id}`
  const value = candidate.numeric_value ?? toNumber(candidate.raw_value)
  return {
    id: recordId,
    publicationId: publication.id,
    paperTitle: publication.title ?? publication.filename,
    year: publication.year,
    doi: publication.doi,
    model: null,
    dataset: null,
    split: null,
    task: null,
    protocol: null,
    metricName: candidate.metric_name,
    metricVariant: candidate.metric_variant,
    metricK: candidate.metric_k,
    metricValue: value,
    metricUnit: candidate.unit ?? null,
    rawValue: candidate.raw_value,
    aggregation: candidate.metric_group ?? null,
    origin: "unclassified",
    extractionStatus,
    reviewStatus: "unreviewed",
    extractionMethod: candidate.extraction_method,
    page: candidate.page_number,
    section: null,
    table: null,
    rowLabel: null,
    columnLabel: null,
    sourceFragment: candidate.source_fragment,
    normalizationRule: null,
    normalizedValue: null,
    normalizedUnit: null,
    topK: candidate.metric_k ?? null,
    sourcePdfUrl: `/api/documents/${encodeURIComponent(publication.id)}/file`,
    sourcePageUrl: null,
    sourceImageUrl: null,
    sourceRef: `document:${publication.id}:page:${candidate.page_number}`,
    sourceBbox: bbox,
    sourceImageSize: null,
    sourcePixelToPdfMatrix: null,
    sourceCoordinateSystem: candidate.coordinate_system ?? null,
    sourceHeaders: [],
    sourceRowFragmentIds: [],
    sourceRowBbox: bbox,
    sourceVerificationStatus: "unverified",
    sourceEvidenceStatus: extractionStatus,
    sourceDocumentId: publication.id,
    blockType: null,
    duplicateOf: null,
    issueIds: issues.flatMap((issue) => issueIdsOf(issue)),
    sourceRow: {
      publication_id: publication.id,
      result_id: recordId,
      experiment_id: "",
      config_id: "",
      dataset_id: "",
      task_id: "",
      metric_group: candidate.metric_group ?? "",
      metric_name: candidate.metric_name ?? "",
      metric_variant: candidate.metric_variant ?? "",
      metric_direction: candidate.metric_direction ?? "",
      metric_k: textValue(candidate.metric_k),
      metric_value: textValue(value),
      metric_unit: candidate.unit ?? "",
      baseline_value: "",
      aggregation: candidate.metric_group ?? "",
      sample_size: "",
      raw_value: candidate.raw_value,
      raw_unit: candidate.unit ?? "",
      normalized_value: "",
      normalized_unit: "",
      result_origin: "unclassified",
      cited_publication_id: "",
      source_page: textValue(candidate.page_number),
      source_section: "",
      source_table: "",
      source_figure: "",
      source_fragment: candidate.source_fragment,
      extraction_status: extractionStatus,
      duplicate_of: "",
      note: "",
    },
  }
}

export async function buildLocalParticipantData(): Promise<ParticipantData> {
  const publications = await getPublications()
  const records: ResultRecord[] = []
  const issues: ParticipantIssue[] = []
  let classifiedCount = 0
  let reviewPendingCount = 0

  for (const publication of publications) {
    const publicationIssues = await getIssues(publication.id) as IssueRow[]
    issues.push(...publicationIssues.map((issue) => localIssueToParticipantIssue(issue, publication.id)))
    for (const candidate of await getCandidates(publication.id)) {
      records.push(candidateToRecord(candidate, publication, publicationIssues))
      if (candidate.is_classified) classifiedCount += 1
      else reviewPendingCount += 1
    }
  }

  const metadata: SnapshotMetadata = {
    profileVersion: "local-sqlite-v1",
    schemaVersion: "rag-local-1.0",
    domain: "RAG",
    split: "local",
    publicationCount: publications.length,
    resultCount: records.length,
    uniqueResultCount: records.length,
    repeatCount: 0,
    issueCount: issues.length,
    sourceReviewCount: reviewPendingCount,
  }

  return {
    records,
    issues,
    metadata,
    resultColumns: [
      "publication_id",
      "result_id",
      "experiment_id",
      "config_id",
      "dataset_id",
      "task_id",
      "metric_group",
      "metric_name",
      "metric_variant",
      "metric_direction",
      "metric_k",
      "metric_value",
      "metric_unit",
      "baseline_value",
      "aggregation",
      "sample_size",
      "raw_value",
      "raw_unit",
      "normalized_value",
      "normalized_unit",
      "result_origin",
      "cited_publication_id",
      "source_page",
      "source_section",
      "source_table",
      "source_figure",
      "source_fragment",
      "extraction_status",
      "duplicate_of",
      "note",
    ],
    exportTables: null,
  }
}
