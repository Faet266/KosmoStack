import { ensureRagImported } from "@/lib/rag-store"
import { getPublications } from "@/lib/db-analysis"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const uploads = new URL(request.url).searchParams.get("scope") === "uploads"
    if (!uploads) await ensureRagImported()
    const publications = await getPublications(uploads)
    return Response.json({ publications }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return Response.json({ error: "Не удалось загрузить список публикаций." }, { status: 500 })
  }
}
