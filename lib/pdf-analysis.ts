import { createHash } from "node:crypto"
import { createInterface } from "node:readline"
import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { getFullAnalysis, getPublication, markAnalysisStarted, registerAnalysisDocument, recordAnalysisError, saveAnalysis } from "@/lib/db-analysis"
import { getVerifiedHandoff } from "@/lib/quality-handoff"
import { getLocalDocument, getLocalDocumentPaths } from "@/lib/local-documents"

type AnalysisPage = {
  page: number
  text: string
  wordCount: number
  characterCount: number
  hasText: boolean
  extractionMethod: string
  extractionConfidence: number | null
}
type MetricCandidate = {
  page: number
  text: string
  metricName: string | null
  metricVariant?: string | null
  metricK?: number | null
  rawValue: string
  value: number | null
  unit: string | null
  metricGroup?: string | null
  metricDirection?: string | null
  baselineValue?: number | null
  aggregation?: string | null
  sampleSize?: number | null
  resultOrigin?: string | null
  section?: string | null
  table?: string | null
  figure?: string | null
  sourceFragment: string
  extractionMethod: string
  confidence: number | null
  bbox: number[] | null
  coordinateSystem: string
  duplicateOf?: string | null
}
type PdfAnalysis = {
  title: string | null
  pageCount: number
  pagesProcessed: number
  textPages: number
  scannedPages: number
  ocrPages: number
  totalWords: number
  totalCharacters: number
  metricCandidates: MetricCandidate[]
  pages: AnalysisPage[]
  extractorName: string
  extractorVersion: string
  wordCountMethod: string
  note: string
}
type Progress = { total: number; completed: number; phase: "extract" | "ocr" | "save" }
type JobResult = { analysis: ReturnType<typeof localToClientAnalysis> } | { error: string }
type Job = { progress: Progress; done: Promise<JobResult> }
const jobKey = Symbol.for("kosmostack.pdf-jobs")
const processState = globalThis as typeof globalThis & { [jobKey]?: Map<string, Job> }
const jobs = processState[jobKey] ??= new Map<string, Job>()
const queueKey=Symbol.for("kosmostack.private-pdf-queue")
const queueState=globalThis as typeof globalThis & {[queueKey]?:{active:number;waiting:Array<()=>void>}}
const privateQueue=queueState[queueKey] ??= {active:0,waiting:[]}

async function runQueued<T>(run:()=>Promise<T>):Promise<T> {
  if(privateQueue.active>=2) await new Promise<void>((resolve)=>privateQueue.waiting.push(resolve))
  else privateQueue.active++
  try { return await run() }
  finally {
    const next=privateQueue.waiting.shift()
    if (next) next()
    else privateQueue.active--
  }
}

export function startPdfAnalysis(id: string, filename: string, path: string, force = false) {
  const current = jobs.get(id)
  if (current) return current
  const schedule = id.startsWith("private-") ? runQueued : (run:()=>Promise<JobResult>)=>run()
  const job: Job = {
    progress: { total: 0, completed: 0, phase: "extract" },
    done: schedule(()=>localAnalysisJob(id, filename, path, force, (progress) => { job.progress = progress })).finally(() => jobs.delete(id)),
  }
  jobs.set(id, job)
  return job
}

function runningState(job: Job) {
  return { analysis: null, status: "processing" as const, progress: job.progress }
}

export async function readAnalysisState(id: string) {
  const active = jobs.get(id)
  if (active) return runningState(active)
  const publication = await getPublication(id)
  const document = await getLocalDocument(id)
  if (!publication && !document) return null
  if (publication?.processing_status === "processing" && document) {
    return runningState(startPdfAnalysis(id, document.name, getLocalDocumentPaths(id)!.pdfPath))
  }
  const stored = publication?.page_count ? await getFullAnalysis(id) : null
  return {
    analysis: stored?.pages.length ? localToClientAnalysis(stored) : null,
    status: publication?.error_message ? "error" : publication?.processing_status ?? "pending",
    reason: publication?.error_message ?? null,
  }
}

export const stateForJob = runningState

function runAnalysis(pdfPath: string, update?: (progress: Progress) => void) {
  return new Promise<PdfAnalysis>((resolve, reject) => {
    const scriptPath = join(process.cwd(), "scripts", "analyze-pdf.mjs")
    const child = spawn(process.execPath, [scriptPath, pdfPath], {
      cwd: process.cwd(),
      env: { ...process.env, PDF_ANALYSIS_PROGRESS: update ? "1" : "0" },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    let errorOutput = ""
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill("SIGKILL")
      reject(new Error("Анализ PDF превысил лимит времени. Выберите PDF меньшего размера или повторите попытку позже."))
    }, 280_000)

    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      output += chunk
      if (output.length > 24_000_000 && !settled) {
        settled = true
        child.kill("SIGKILL")
        clearTimeout(timeout)
        reject(new Error("Результат анализа превышает допустимый размер. Попробуйте PDF меньшего объёма."))
      }
    })
    const lines = createInterface({ input: child.stderr })
    lines.on("line", (line) => {
      if (line.startsWith("@@PDF_PROGRESS ")) {
        try { update?.(JSON.parse(line.slice(15)) as Progress) } catch {}
      } else {
        errorOutput = (errorOutput + "\n" + line).slice(-4_000)
      }
    })
    child.on("error", (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    child.on("close", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (code !== 0) {
        reject(new Error(errorOutput.trim() || "Локальный скрипт не смог прочитать PDF."))
        return
      }
      try {
        resolve(JSON.parse(output) as PdfAnalysis)
      } catch {
        reject(new Error("Скрипт вернул некорректный результат анализа."))
      }
    })
  })
}

async function localAnalysisJob(id: string, filename: string, path: string, force: boolean, update: (progress: Progress) => void): Promise<JobResult> {
  try {
    await registerAnalysisDocument(id, filename)
    const saved = force ? null : await getFullAnalysis(id)
    const digest = createHash("sha256").update(await readFile(path)).digest("hex")
    if (saved?.publication.sha256 === digest && !saved.publication.error_message &&
      saved.pages.length === saved.publication.page_count && saved.pages.length > 0 &&
      saved.pages.every((page) => page.status === "done" || page.status === "unreadable")) {
      return { analysis: localToClientAnalysis(saved) }
    }
    await markAnalysisStarted(id)
    const result = await runAnalysis(path, update)
    update({ total: result.pageCount, completed: result.pagesProcessed, phase: "save" })
    await saveAnalysis(id, filename, { ...result, sha256: digest })
    const stored = await getFullAnalysis(id)
    if (!stored) throw new Error("Не удалось прочитать сохранённый анализ.")
    return { analysis: localToClientAnalysis(stored) }
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Не удалось выполнить анализ PDF.").slice(0, 400)
    await recordAnalysisError(id, message).catch((cause) => console.error("Analysis error could not be recorded", cause))
    return { error: message }
  }
}

// ─── Converts the PostgreSQL result to the client shape ─────────────────────
type LocalFullAnalysis = NonNullable<Awaited<ReturnType<typeof getFullAnalysis>>>

function localToClientAnalysis(data: LocalFullAnalysis) {
  const pub = data.publication
  let corpus: { publicationId: string; resultCount: number } | null = null
  if (pub.sha256) {
    try {
      const { catalog } = getVerifiedHandoff()
      const document = catalog.documents.find((entry) => entry.sha256 === pub.sha256)
      if (document) corpus = {
        publicationId: document.publication_id,
        resultCount: catalog.tables.results.filter((row) => row.publication_id === document.publication_id).length,
      }
    } catch (error) {
      console.warn("Catalogue link unavailable for PDF", error instanceof Error ? error.message : error)
    }
  }
  return {
    corpus,
    id: pub.id,
    title: pub.title,
    pageCount: pub.page_count,
    pagesProcessed: data.pages.filter((p) => p.status !== "skipped").length,
    textPages: data.pages.filter((p) => p.hasText && p.extractionMethod !== "ocr").length,
    scannedPages: data.pages.filter((p) => p.extractionMethod === "ocr" || !p.hasText).length,
    ocrPages: data.pages.filter((p) => p.extractionMethod === "ocr").length,
    totalWords: pub.total_words,
    totalCharacters: data.pages.reduce((s, p) => s + p.characterCount, 0),
    extractorName: pub.extractor_name ?? "pdfjs+tesseract.js",
    extractorVersion: pub.extractor_version ?? "unknown",
    wordCountMethod: pub.word_count_method ?? "unicode-word-regex-v1",
    metricCandidates: data.allCandidates,
    totalCandidates: data.totalCandidates,
    classifiedCandidates: data.classifiedCandidates,
    pages: data.pages.map((p) => ({
      page: p.page,
      text: p.text,
      wordCount: p.wordCount,
      characterCount: p.characterCount,
      hasText: p.hasText,
      extractionMethod: p.extractionMethod,
      extractionConfidence: p.extractionConfidence,
      status: p.status,
      error: p.error,
      candidateCount: p.candidates.length,
      candidates: p.candidates,
    })),
    issues: data.issues,
    note: pub.analysis_note ?? `Извлечено ${data.totalCandidates} числовых кандидатов, из них ${data.classifiedCandidates} классифицированы. Страниц: ${pub.page_count}.`,
    createdAt: pub.updated_at,
    source: "postgresql" as const,
  }
}
