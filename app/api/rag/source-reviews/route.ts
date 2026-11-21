import { listSourceTasks } from "@/lib/source-review"

export const runtime = "nodejs"

export async function GET() {
  return Response.json({ tasks: await listSourceTasks() }, { headers: { "Cache-Control": "no-store" } })
}
