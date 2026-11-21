import { readPassport } from "@/lib/official-export-data"

export const runtime = "nodejs"
export async function GET() {
  try {
    return Response.json(readPassport(), { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Паспорт снимка недоступен." }, { status: 503 })
  }
}
