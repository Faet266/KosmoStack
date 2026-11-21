import { queryRows } from "@/lib/db"
import { ensureRagImported, getRagIssues, ragPublicationKey } from "@/lib/rag-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  await ensureRagImported()
  const issues = getRagIssues()
  const ids = issues.map((issue) => `${ragPublicationKey(issue.publicationId)}/${issue.id}`)
  const statuses = await queryRows<{ id: string; status: string }>("SELECT id, status FROM issues WHERE id = ANY($1::text[])", [ids])
  const byId = new Map(statuses.map((row) => [row.id, row.status]))
  return Response.json({ issues: issues.map((issue, i) => ({ ...issue, status: byId.get(ids[i]) ?? "open" })) })
}
