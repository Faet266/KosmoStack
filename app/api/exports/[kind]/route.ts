import { currentAccount } from "@/lib/current-account"
import { areaPassport } from "@/lib/area-passport"
import { analysisExport, answerExport, comparisonExport, exportFormats, metricsExport, passportExport, processingExport, type ExportFormat } from "@/lib/official-export-data"
import { exportResponse } from "@/lib/official-export-response"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
type Context = { params: Promise<{ kind: string }> }
const error = (message: string, status: number) => Response.json({ error: message }, { status })
function selectedFormat(url: URL): ExportFormat | null {
  const format = url.searchParams.get("format") ?? "pdf"
  return exportFormats.find((item) => item === format) ?? null
}

export async function GET(request: Request, { params }: Context) {
  const { kind } = await params
  const url = new URL(request.url)
  const format = selectedFormat(url)
  if (!format) return error("Выберите XLSX, CSV, DOCX, ODT или PDF.", 400)
  try {
    const id = url.searchParams.get("id") ?? ""
    if (kind === "analysis" && !/^[a-z0-9][a-z0-9-]{2,79}$/iu.test(id)) return error("Укажите документ.", 400)
    const scope = kind === "passport" ? url.searchParams.get("area") : null
    const account = scope && await currentAccount()
    const document = scope ? (account ? await areaPassport(scope,account.id) : null) : kind === "analysis" ? await analysisExport(id, url.origin, format) :
      kind === "metrics" ? await metricsExport() : kind === "passport" ? passportExport() :
      kind === "processing" ? await processingExport() :
      kind === "comparison" ? await comparisonExport(url.searchParams.get("left") ?? "", url.searchParams.get("right") ?? "") : null
    return document ? await exportResponse(document, format) : error("Документ или записи не найдены.", 404)
  } catch (cause) {
    if (cause instanceof Error && cause.message === "Сначала запустите анализ PDF.") return error(cause.message, 409)
    console.error("Official export failed", cause)
    return error("Не удалось сформировать документ.", 500)
  }
}

export async function POST(request: Request, { params }: Context) {
  const { kind } = await params
  if (kind !== "assistant") return error("Раздел экспорта не найден.", 404)
  const url = new URL(request.url)
  const format = selectedFormat(url)
  if (!format) return error("Выберите XLSX, CSV, DOCX, ODT или PDF.", 400)
  const document = answerExport(await request.json().catch(() => null), url.origin)
  if (!document) return error("Для экспорта требуется готовый ответ.", 400)
  try {
    return await exportResponse(document, format)
  } catch (cause) {
    console.error("Assistant export failed", cause)
    return error("Не удалось выгрузить ответ.", 500)
  }
}
