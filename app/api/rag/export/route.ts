import JSZip from "jszip"
import { getVerifiedHandoff, keys, type Table } from "@/lib/quality-handoff"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const { catalog, csv } = getVerifiedHandoff()
  const archive = new JSZip()
  for (const name of Object.keys(keys) as Table[]) archive.file(`${name}.csv`, csv.get(name)!)
  const bytes = await archive.generateAsync({ type: "uint8array", compression: "DEFLATE" })
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="rag-${catalog.split}.zip"`,
      "Cache-Control": "no-store",
    },
  })
}
