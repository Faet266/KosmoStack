import { currentAccount } from "@/lib/current-account"
import { ownedArea, linkWorkspaceDocument } from "@/lib/personal-store"
import { createHash } from "node:crypto"
import { registerAnalysisDocument } from "@/lib/db-analysis"
import { listLocalDocuments, getLocalDocumentPaths, MAX_PDF_SIZE, saveLocalDocument } from "@/lib/local-documents"
import { startPdfAnalysis, stateForJob } from "@/lib/pdf-analysis"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return Response.json({ documents: await listLocalDocuments() }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Local PDF list failed", error)
    return Response.json({ error: "Не удалось загрузить список локальных PDF." }, { status: 503 })
  }
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    return Response.json({ error: "Загрузите PDF через форму." }, { status: 415 })
  }
  try {
  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "Выберите файл с расширением .pdf." }, { status: 400 })
  }
  if (file.size === 0 || file.size > MAX_PDF_SIZE) {
    return Response.json({ error: "PDF должен быть не пустым и не превышать 25 МБ." }, { status: 400 })
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sig = new TextDecoder().decode(bytes.slice(0, 5))
  if (sig !== "%PDF-") {
    return Response.json({ error: "Содержимое файла не похоже на PDF." }, { status: 400 })
  }

  const workspace = form.get("workspace")
  const owner = typeof workspace === "string" && workspace ? await currentAccount() : null
  const area = typeof workspace === "string" && owner ? await ownedArea(owner.id,workspace) : null
  if (workspace && !area) return Response.json({ error: "Область не найдена." }, { status: 404 })
  const tags = String(form.get("tags") ?? "").split(/[;,]/u).map((tag) => tag.trim().slice(0,42)).filter(Boolean).slice(0,16)
  const { document, existed } = await saveLocalDocument(file.name, bytes, area ? owner?.id : undefined)
  await registerAnalysisDocument(document.id, document.name, createHash("sha256").update(bytes).digest("hex"))
  if (area) await linkWorkspaceDocument(area.id,document.id,[...new Set(tags)])
  const job = startPdfAnalysis(document.id, document.name, getLocalDocumentPaths(document.id)!.pdfPath)
  return Response.json({ document, analysisState: stateForJob(job) }, {
    status: existed ? 200 : 201,
    headers: { "Cache-Control": "no-store" },
  })
  } catch (error) {
    console.error("Local PDF upload failed", error)
    return Response.json({ error: "Не удалось сохранить PDF или зарегистрировать его в PostgreSQL. Повторная загрузка не создаст дубль." }, { status: 500 })
  }
}
