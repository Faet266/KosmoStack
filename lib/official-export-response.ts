import { execFile } from "node:child_process"
import { writeFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { encodeCsv } from "@/lib/csv"
import { reportWorkbook } from "@/lib/spreadsheet-export"
import { pythonExecutable } from "@/lib/python"
import type { ExportFormat, OfficialExport } from "@/lib/official-export-data"

const mime = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  csv: "text/csv; charset=utf-8",
  xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
const execute = promisify(execFile)

export async function exportResponse(data: OfficialExport, format: ExportFormat) {
  const date = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }).format(new Date())
  const headers = {
    "Content-Type": mime[format], "Content-Disposition": `attachment; filename="${data.code}.${format}"`,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  }
  if (format === "xlsx") return new Response(await reportWorkbook(data,date),{headers})
  if (format === "csv") {
    const width = Math.max(2,...data.sections.map(section=>section.table?.headers.length??0))
    const rows: unknown[][] = [["Сформировано",date],["Содержание",data.summary]]
    for (const section of data.sections) {
      rows.push([], [section.title])
      section.paragraphs?.forEach((text)=>rows.push([text]))
      if (section.table) rows.push(section.table.headers,...section.table.rows)
    }
    const pad = (row:readonly unknown[])=>Array.from({length:width},(_,i)=>row[i]??"")
    return new Response(encodeCsv(pad(["Отчёт",data.title]).map(String),rows.map(pad)),{headers})
  }
  const directory = await mkdtemp(join(tmpdir(), "kosmostack-official-export-"))
  try {
    const file = join(directory, "report.json")
    await writeFile(file, JSON.stringify({ ...data, date }), "utf8")
    const { stdout } = await execute(pythonExecutable(), ["-B", join(process.cwd(), "scripts", "official-export.py"), file, format],
      { timeout: 30_000, maxBuffer: 24_000_000, windowsHide: true, encoding: "buffer" })
    const signature = format === "pdf" ? "%PDF-" : "PK"
    if (stdout.subarray(0, signature.length).toString("ascii") !== signature) throw Error("Invalid document signature")
    return new Response(new Uint8Array(stdout), { headers })
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}
