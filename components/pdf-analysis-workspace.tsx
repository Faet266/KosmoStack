"use client"

import { ExportMenu } from "@/components/export-menu"

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react"
import useSWR, { useSWRConfig } from "swr"
import { metricLabel, recordValue, type ResultRecord } from "@/lib/result-data"
import { ExternalLink, FileCheck2, FileText, FileUp, LoaderCircle, Play, ScanSearch } from "lucide-react"

type LocalDocument = {
  id: string
  name: string
  size: number
  uploadedAt: string
}

type PdfAnalysis = {
  corpus: { publicationId: string; resultCount: number } | null
  classifiedCandidates: number
  title: string | null
  pageCount: number
  pagesProcessed: number
  textPages: number
  scannedPages: number
  ocrPages: number
  totalWords: number
  totalCharacters: number
  metricCandidates: Array<{ page: number; text: string; metricName: string | null; metricK?: number | null; rawValue: string; value: number | null; unit: string | null; extractionMethod: string; confidence: number | null; id: number; isClassified: boolean; metricGroup: string | null }>
  extractorName: string
  extractorVersion: string
  wordCountMethod: string
  pages: Array<{ page: number; text: string; wordCount: number; characterCount: number; hasText: boolean; extractionMethod: string; extractionConfidence: number | null; status?: string; error?: string | null }>
  note: string
}

async function fetchDocuments(url: string): Promise<LocalDocument[]> {
  const response = await fetch(url, { cache: "no-store" })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? "Не удалось прочитать список PDF.")
  return payload.documents as LocalDocument[]
}

type AnalysisState = {
  analysis: PdfAnalysis | null
  status?: "pending" | "processing" | "done" | "error"
  reason?: string | null
  progress?: { total: number; completed: number; phase: "extract" | "ocr" | "save" }
}

async function fetchAnalysis(url: string): Promise<AnalysisState> {
  const response = await fetch(url, { cache: "no-store" })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить результат анализа.")
  return payload as AnalysisState
}

function candidateLabel(candidate: PdfAnalysis["metricCandidates"][number]) {
  return candidate.metricName ? candidate.metricName + (candidate.metricK == null ? "" : `@${candidate.metricK}`) : ""
}

function formatBytes(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

export function PdfAnalysisWorkspace({ onToast, onOpenCorpus, onEvidence }: {
  onToast: (message: string) => void
  onOpenCorpus: (id: string) => void
  onEvidence: (record: ResultRecord) => void
}) {
  const { mutate } = useSWRConfig()
  const fileInput = useRef<HTMLInputElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [metric, setMetric] = useState("")
  const [showUnclassified, setShowUnclassified] = useState(false)
  const [visibleCandidateCount, setVisibleCandidateCount] = useState(100)
  const [uploadError, setUploadError] = useState("")
  const [runError, setRunError] = useState("")
  const { data: documents = [], error: documentsError, isLoading: documentsLoading, mutate: refreshDocuments } = useSWR("/api/documents", fetchDocuments, {
    revalidateOnFocus: false,
  })
  const selectedDocument = documents.find((document) => document.id === selectedId) ?? documents[0] ?? null
  const analysisKey = selectedDocument ? `/api/documents/${encodeURIComponent(selectedDocument.id)}/analyze` : null
  const { data: state, error: analysisLoadError, isLoading: analysisLoading } = useSWR(analysisKey, fetchAnalysis, {
    refreshInterval: (value) => value?.status === "processing" ? 1200 : 0,
  })
  const analysis = state?.analysis
  const candidates = useMemo(() => analysis?.metricCandidates ?? [], [analysis])
  const metricChoices = useMemo(() => [...new Set(candidates.flatMap((entry) =>
    entry.metricName ? [candidateLabel(entry)] : []
  ))].sort((left, right) => left.localeCompare(right)), [candidates])
  const visibleCandidates = candidates.filter((entry) =>
    (showUnclassified || entry.isClassified) && (!metric || candidateLabel(entry) === metric)
  )
  const isAnalyzing = isStarting || state?.status === "processing"
  const progress = state?.progress
  const buttonLabel = state?.status === "processing" ?
    progress?.phase === "save" ? "Сохраняем результат…" :
      progress?.total ? `${progress.phase === "ocr" ? "OCR" : "Чтение"} · ${progress.completed} из ${progress.total}` : "Открываем PDF…" :
    isStarting ? "Запускаем анализ…" : state?.status === "error" || analysis ? "Повторить анализ" : "Запустить анализ"

  const saveFile = async (file: File) => {
    if (isUploading) return
    setUploadError("")
    setRunError("")
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadError("Выберите файл с расширением .pdf.")
      return
    }
    if (file.size === 0 || file.size > 25 * 1024 * 1024) {
      setUploadError("PDF должен быть не пустым и не превышать 25 МБ.")
      return
    }
    const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer())
    if (new TextDecoder().decode(signature) !== "%PDF-") {
      setUploadError("Содержимое файла не похоже на PDF.")
      return
    }

    setIsUploading(true)
    try {
      const form = new FormData()
      form.set("file", file)
      const response = await fetch("/api/documents", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60_000),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.document) throw new Error(payload?.error ?? "Не удалось сохранить PDF.")
      const saved = payload.document as LocalDocument
      await refreshDocuments((current) => [saved, ...(current ?? []).filter((row) => row.id !== saved.id)], false)
      await mutate(`/api/documents/${encodeURIComponent(saved.id)}/analyze`, payload.analysisState as AnalysisState, false)
      selectDocument(saved.id)
      onToast("PDF сохранён. Анализ запущен автоматически.")
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Не удалось сохранить PDF.")
    } finally {
      setIsUploading(false)
      if (fileInput.current) fileInput.current.value = ""
    }
  }

  const analyzeSelected = async () => {
    if (!analysisKey || isAnalyzing) return
    setIsStarting(true)
    setRunError("")
    try {
      const response = await fetch(analysis ? analysisKey + "?force=1" : analysisKey, { method: "POST", signal: AbortSignal.timeout(12_000) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Не удалось выполнить анализ PDF.")
      await mutate(analysisKey, payload as AnalysisState, false)
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Не удалось выполнить анализ PDF.")
    } finally {
      setIsStarting(false)
    }
  }

  const selectDocument = (id: string) => {
    setSelectedId(id)
    setRunError("")
    setMetric("")
    setShowUnclassified(false)
    setVisibleCandidateCount(100)
  }

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    if (file) void saveFile(file)
    event.currentTarget.value = ""
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void saveFile(file)
  }

  return <div className="pdf-analysis-workspace">
    <section className="pdf-import-card" aria-labelledby="pdf-import-title">
      <div className="pdf-import-heading">
        <div>
          <span className="pdf-kicker">ИМПОРТ И ОБРАБОТКА</span>
          <h2 id="pdf-import-title">PDF-документы</h2>
          <p>Разбор запускается сразу после загрузки. Прогресс и результат сохраняются для каждого файла.</p>
        </div>
        <span className="pdf-local-badge"><span className="status-dot status-verified" />Локальное хранилище</span>
      </div>

      <div className={`pdf-dropzone ${isDragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false) }} onDrop={onDrop}>
        <div className="pdf-dropzone-icon"><FileUp aria-hidden="true" /></div>
        <div className="pdf-dropzone-copy"><strong>Перетащите PDF сюда</strong><span>или выберите файл на устройстве · до 25 МБ</span></div>
        <input ref={fileInput} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={onFileChange} aria-label="Выбрать PDF-файл для загрузки" />
        <button type="button" className="secondary-button" onClick={() => fileInput.current?.click()} disabled={isUploading}>{isUploading ? <LoaderCircle className="pdf-spinner" aria-hidden="true" /> : <FileUp aria-hidden="true" />}{isUploading ? "Сохраняем…" : "Выбрать PDF"}</button>
      </div>
      {uploadError && <p className="pdf-inline-error" role="alert">{uploadError}</p>}

      <div className="pdf-documents-heading"><div><h3>Сохранённые PDF</h3></div><span className="count-pill">{documents.length}</span></div>
      {documentsError ? <p className="pdf-inline-error" role="alert">{documentsError.message}</p> : documentsLoading ? <div className="pdf-list-state" role="status">Загружаем список файлов…</div> : documents.length > 0 ? <div className="pdf-document-list">{documents.map((document) => <article className={`pdf-document-row ${selectedDocument?.id === document.id ? "is-selected" : ""}`} key={document.id}>
        <button type="button" className="pdf-document-select" aria-pressed={selectedDocument?.id === document.id} onClick={() => selectDocument(document.id)}>
          <span className="pdf-document-icon"><FileText aria-hidden="true" /></span>
          <span className="pdf-document-name"><strong>{document.name}</strong><small>{formatBytes(document.size)}{formatDate(document.uploadedAt) ? ` · ${formatDate(document.uploadedAt)}` : ""}</small></span>
          {selectedDocument?.id === document.id && <FileCheck2 className="pdf-selected-mark" aria-hidden="true" />}
        </button>
        <a className="pdf-open-link" href={`/api/documents/${encodeURIComponent(document.id)}/file`} target="_blank" rel="noreferrer" aria-label={`Открыть ${document.name} в новой вкладке`}><ExternalLink aria-hidden="true" /></a>
      </article>)}</div> : <div className="pdf-list-state">Пока нет сохранённых PDF.</div>}
    </section>

    <section className="pdf-result-card" aria-labelledby="pdf-result-title">
      <div className="pdf-result-heading"><div><span className="pdf-kicker">ЛОКАЛЬНЫЙ ИЗВЛЕКАТЕЛЬ · PDF.JS + OCR</span><h2 id="pdf-result-title">Анализ документа</h2><p>{selectedDocument ? `Документ: ${selectedDocument.name}` : "Загрузите PDF или выберите сохранённый документ."}</p></div>
        <button type="button" className="primary-button" onClick={() => void analyzeSelected()} disabled={!selectedDocument || isAnalyzing || isUploading}>{isAnalyzing ? <LoaderCircle className="pdf-spinner" aria-hidden="true" /> : <Play aria-hidden="true" />}{buttonLabel}</button>
      </div>
      {(runError || state?.reason) && <p className="pdf-inline-error" role="alert">{runError || state?.reason}</p>}
      {state?.status === "processing" && <p className="pdf-list-state" role="status">
        {progress?.total ? `Обработано ${progress.completed} из ${progress.total} страниц. ` : ""}
        Анализ продолжается в фоне. Результат появится здесь автоматически.
      </p>}
      {analysisLoadError && <p className="pdf-inline-error" role="alert">{analysisLoadError.message}</p>}
      {analysisLoading && selectedDocument && <div className="pdf-list-state" role="status">Загружаем сохранённый результат…</div>}
      {analysis && selectedDocument && <div className="pdf-analysis-output">
        <p className="pdf-list-state" role="status">{analysis.pages.some((page) => page.error) ? "Разбор завершён с замечаниями. Страницы с ошибками отмечены ниже." : "Разбор завершён. Результаты сохранены в PostgreSQL."}</p>
        {analysis.corpus && <CorpusMetrics key={analysis.corpus.publicationId} corpus={analysis.corpus}
          onOpenCorpus={onOpenCorpus} onEvidence={onEvidence} />}
        <div className="page-actions">
          <ExportMenu kind="analysis" params={{ id: selectedDocument.id }} label="Экспорт анализа" inline />
          <button type="button" className="ws-button" onClick={() => window.dispatchEvent(new CustomEvent("kosmostack-assistant", { detail: { id: selectedDocument.id } }))}>
            Спросить об этом PDF
          </button>
        </div>
        <div className="pdf-analysis-metrics" aria-label="Сводка анализа PDF">
          <article><span>Страниц</span><strong>{analysis.pageCount}</strong></article>
          <article><span>Слов извлечено</span><strong>{analysis.totalWords.toLocaleString("ru-RU")}</strong></article>
          <article><span>Страниц с текстом</span><strong>{analysis.textPages} / {analysis.pageCount}</strong></article>
          <article><span>Страниц OCR</span><strong>{analysis.ocrPages}</strong></article>
          <article><span>Числовых кандидатов</span><strong>{candidates.length}</strong></article>
          <article><span>С распознанной метрикой</span><strong>{analysis.classifiedCandidates}</strong></article>
        </div>
        {analysis.title && <p className="pdf-analysis-title"><span>Название из метаданных</span><strong>{analysis.title}</strong></p>}
        <p className="pdf-analysis-title"><span>Извлекатель · версия · подсчёт слов</span><strong>{analysis.extractorName} · {analysis.extractorVersion} · {analysis.wordCountMethod}</strong></p>
        <div className="pdf-analysis-note" role="note"><ScanSearch aria-hidden="true" /><span>{analysis.note}</span></div>
        <div className="pdf-candidates">
          <div className="pdf-candidates-heading"><h3>Кандидаты метрик</h3><span>{visibleCandidates.length}</span></div>
          <p>Автоматические кандидаты требуют сверки с PDF. Если единица или глубина k отсутствует в источнике, поле остаётся пустым.</p>
          <div className="catalog-toolbar">
            {metricChoices.length > 0 && <label><span>Метрика</span>
              <select value={metric} onChange={(event) => { setMetric(event.target.value); setVisibleCandidateCount(100) }}>
                <option value="">Все распознанные метрики</option>
                {metricChoices.map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>}
            <label><input type="checkbox" checked={showUnclassified} onChange={(event) => {
              setShowUnclassified(event.target.checked)
              setMetric("")
              setVisibleCandidateCount(100)
            }} /> Показать числа без метрики</label>
          </div>
          {visibleCandidates.length === 0 ? <p className="pdf-list-state">По выбранным условиям кандидатов нет.</p> :
            <div className="table-scroll"><table className="results-table">
              <thead><tr><th>Метрика</th><th>Как в источнике</th><th>Единица</th><th>Фрагмент и страница</th></tr></thead>
              <tbody>{visibleCandidates.slice(0, visibleCandidateCount).map((candidate) => <tr key={candidate.id}>
                <td>{candidateLabel(candidate) || "Не установлена"}{candidate.metricGroup && <small className="source-ref">{candidate.metricGroup}</small>}</td>
                <td>{candidate.rawValue || "Не распознано"}</td><td>{candidate.unit ?? "Не указана"}</td>
                <td><a href={`/api/documents/${encodeURIComponent(selectedDocument.id)}/file#page=${candidate.page}`} target="_blank" rel="noreferrer">
                  Стр. {candidate.page} · {candidate.extractionMethod === "ocr" ? "OCR" : "Текст PDF"}
                </a><span className="source-ref">{candidate.text}</span></td>
              </tr>)}</tbody>
            </table></div>}
          {visibleCandidateCount < visibleCandidates.length && <button type="button" className="secondary-button" onClick={() =>
            setVisibleCandidateCount((count) => count + 100)
          }>Показать ещё {Math.min(100, visibleCandidates.length - visibleCandidateCount)}</button>}
        </div>
        {analysis.pages.length > 0 && <details className="pdf-text-preview"><summary>Показать извлечённый текст всех страниц ({analysis.pages.length})</summary>{analysis.pages.map((page) => <article key={page.page}><span>Страница {page.page} · {page.wordCount.toLocaleString("ru-RU")} слов · {page.extractionMethod === "ocr" ? "OCR" : "текст PDF"}{page.extractionConfidence !== null ? ` · ${Math.round(page.extractionConfidence)}%` : ""}{page.hasText ? "" : " · текст не найден"}</span>{page.error && <p role="status">{page.error}</p>}<p>{page.text || "Текст страницы не извлечён."}</p></article>)}</details>}
      </div>}
      {!analysis && !isAnalyzing && !analysisLoading && !analysisLoadError && <div className="pdf-analysis-empty"><ScanSearch aria-hidden="true" /><strong>{selectedDocument ? "Анализ ещё не запускался" : "Результатов пока нет"}</strong><span>{selectedDocument ? "Запустите локальный разбор: будут сохранены страницы, OCR и числовые кандидаты с источником." : "Загрузите PDF, чтобы сохранить файл и запустить локальный анализ."}</span></div>}
    </section>
  </div>
}


function CorpusMetrics({ corpus, onOpenCorpus, onEvidence }: {
  corpus: NonNullable<PdfAnalysis["corpus"]>
  onOpenCorpus: (id: string) => void
  onEvidence: (record: ResultRecord) => void
}) {
  const [page, setPage] = useState(0)
  const size = 15
  const params = new URLSearchParams({
    publication: corpus.publicationId, limit: String(size), offset: String(page * size),
  })
  const { data, error, isLoading } = useSWR<{ results: ResultRecord[]; total: number }>(`/api/rag/results?${params}`, async (url: string) => {
    const response = await fetch(url)
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить метрики публикации.")
    return payload
  }, { revalidateOnFocus: false })

  return <section className="report-quality-note" aria-label="Научные метрики публикации">
    <strong>Научные метрики · {corpus.publicationId}</strong>
    <span>Совпадение PDF по SHA-256. В снимке RAG dev {corpus.resultCount} научных записей с источниками.</span>
    <div className="page-actions">
      <button type="button" className="secondary-button compact" onClick={() => onOpenCorpus(corpus.publicationId)}>Фильтры и сравнение в каталоге</button>
    </div>
    {error && <p role="alert">{error.message}</p>}
    {isLoading && <p role="status">Загружаем научные метрики…</p>}
    {data && data.results.length > 0 && <>
      <div className="table-scroll">
        <table className="results-table">
          <thead><tr><th>Метрика</th><th>Значение</th><th>Система и датасет</th><th>Источник</th></tr></thead>
          <tbody>{data.results.map((record) => <tr key={record.id}>
            <td>{metricLabel(record)}<small className="source-ref">{record.aggregation}</small></td>
            <td><button type="button" className="result-name-button result-value" onClick={() => onEvidence(record)}>{recordValue(record)}</button></td>
            <td>{record.configuration ?? record.model ?? "Не указана"}<small className="source-ref">{record.dataset}</small></td>
            <td><button type="button" className="text-button" onClick={() => onEvidence(record)}>Стр. {record.page} · {record.id}</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {data.total > size && <div className="page-actions">
        <button type="button" className="secondary-button compact" disabled={page === 0} onClick={() => setPage(page - 1)}>Назад</button>
        <span>Страница {page + 1} из {Math.ceil(data.total / size)}</span>
        <button type="button" className="secondary-button compact" disabled={(page + 1) * size >= data.total} onClick={() => setPage(page + 1)}>Далее</button>
      </div>}
    </>}
  </section>
}
