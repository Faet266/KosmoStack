import { readFile } from "node:fs/promises"
import { getLocalDocumentPaths } from "@/lib/local-documents"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params

  const localPaths = getLocalDocumentPaths(id)
  if (localPaths) {
    try {
      const pdf = await readFile(localPaths.pdfPath)
      return new Response(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(id)}.pdf`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      })
    } catch {
      return Response.json({ error: "Не удалось прочитать локальный PDF." }, { status: 404 })
    }
  }

  return Response.json({ error: "PDF не найден." }, { status: 404 })
}
