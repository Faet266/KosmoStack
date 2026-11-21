import { ragControlCheck } from "@/lib/rag-control"

export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json(ragControlCheck(), { headers: { "Cache-Control": "no-store" } })
}
