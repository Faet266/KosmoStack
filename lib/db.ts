import { postgresPool, preparePostgres } from "./postgres.mjs"
import type { PoolClient, QueryResultRow } from "pg"

export async function getDb() {
  const pool = postgresPool()
  await preparePostgres(pool)
  return pool
}

export async function transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await (await getDb()).connect()
  try {
    await client.query("BEGIN")
    const value = await action(client)
    await client.query("COMMIT")
    return value
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function queryRows<T extends QueryResultRow>(sql: string, values: unknown[] = []) {
  return (await (await getDb()).query<T>(sql, values)).rows
}

export type PublicationRow = {
  id: string
  sha256: string | null
  analysis_note: string | null
  title: string | null
  authors: string | null
  year: number | null
  doi: string | null
  filename: string
  page_count: number
  total_words: number
  word_count_method: string | null
  extractor_name: string | null
  extractor_version: string | null
  processing_status: string
  error_message: string | null
  created_at: string
  updated_at: string
}

export type PageRow = {
  id: number
  publication_id: string
  page_number: number
  text_content: string
  word_count: number
  character_count: number
  has_text: number
  extraction_method: string
  extraction_confidence: number | null
  processing_status: string
  error_message: string | null
}

export type CandidateRow = {
  id: number
  publication_id: string
  page_number: number
  raw_value: string
  numeric_value: number | null
  unit: string | null
  context_text: string
  source_fragment: string
  bbox_x0: number | null
  bbox_y0: number | null
  bbox_x1: number | null
  bbox_y1: number | null
  coordinate_system: string | null
  extraction_method: string
  confidence: number | null
  metric_name: string | null
  metric_variant: string | null
  metric_k: number | null
  metric_group: string | null
  metric_direction: string | null
  is_classified: number
}

export type IssueRow = {
  id: string
  publication_id: string
  page_number: number | null
  issue_type: string
  check_name: string | null
  description: string
  severity: string
  status: string
  record_ids: string | null
  source_fragment: string | null
  created_at: string
}
