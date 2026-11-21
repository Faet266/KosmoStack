import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { getVerifiedHandoff, qualityRunDirectory } from "@/lib/quality-handoff"
import { getQualityReport } from "@/lib/quality-report"

export const runtime = "nodejs"

const files = {
  passport: { handoff: "passport.md", filename: "rag-dev-passport.md", type: "text/markdown; charset=utf-8" },
  coverage: { handoff: "coverage.md", filename: "rag-dev-coverage.md", type: "text/markdown; charset=utf-8" },
  validation: { handoff: "validation.json", filename: "rag-dev-validation.json", type: "application/json" },
  checker: { report: "checker.json", filename: "rag-dev-checker.json", type: "application/json" },
  evaluation: { report: "score.json", filename: "rag-dev-evaluation.json", type: "application/json" },
  pipeline: { report: "pipeline.json", filename: "rag-dev-pipeline.json", type: "application/json" },
}
type Context = { params: Promise<{ name: string }> }

export async function GET(_request: Request, { params }: Context) {
  const { name } = await params
  if (!Object.hasOwn(files, name)) return Response.json({ error: "Артефакт не найден." }, { status: 404 })
  const file = files[name as keyof typeof files]
  try {
    await getQualityReport()
    let bytes = "handoff" in file ? getVerifiedHandoff().files.get(file.handoff) : await readFile(resolve(qualityRunDirectory, file.report))
    if (!bytes) return Response.json({ error: "Артефакт недоступен." }, { status: 404 })
    if ("report" in file) {
      const report = JSON.parse(bytes.toString("utf8"))
      if (name === "checker") delete report.command
      if (name === "pipeline") for (const stage of report.stages) delete stage.run
      bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n")
    }
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="${file.filename}"` },
    })
  } catch (error) {
    console.error("Quality artifact unavailable", error)
    return Response.json({ error: "Артефакт активного снимка недоступен." }, { status: 503 })
  }
}
