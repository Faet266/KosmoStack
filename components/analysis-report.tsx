"use client"

import { ExportMenu } from "@/components/export-menu"

import useSWR from "swr"
import { ArrowDownToLine, CheckCircle2, FileText, TriangleAlert } from "lucide-react"
import { downloadCsvFile, encodeCsv } from "@/lib/csv"

type AnalysisResult = {
  id: string
  title: string | null
  pageCount: number
  pagesProcessed: number
  textPages: number
  scannedPages: number
  ocrPages: number
  pageErrors: number
  classifiedCandidates: number
  totalWords: number
  totalCharacters: number
  metricCandidates: Array<{ page: number; text: string; metricName: string | null; metricK: number | null; rawValue: string; unit: string | null }>
  note: string
  createdAt: string
}

type ReportDocument = {
  id: string
  name: string
  size: number
  uploadedAt: string
  status: string
  reason: string | null
  analysis: AnalysisResult | null
}

type ReportResponse = { documents: ReportDocument[]; generatedAt: string }
type AnalysisReportProps = { onToast: (message: string) => void }

async function fetchReport(url: string): Promise<ReportResponse> {
  const response = await fetch(url, { cache: "no-store" })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? "Не удалось сформировать отчёт.")
  return payload as ReportResponse
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function reportStatus(document: ReportDocument) {
  if (document.status === "processing") return "В обработке"
  if (document.status === "error") return "Ошибка анализа"
  if (!document.analysis) return "Анализ не запускался"
  if (document.analysis.pagesProcessed < document.analysis.pageCount) return "Проверьте полноту"
  if (document.analysis.pageErrors > 0) return "Есть замечания по страницам"
  if (document.analysis.ocrPages > 0) return "Обработан с OCR"
  return "Все страницы обработаны"
}

function createReportCsv(documents: ReportDocument[]) {
  const headers = [
    "Тип записи", "Документ", "ID документа", "ID анализа", "Дата загрузки", "Дата анализа",
    "Страница", "Страниц всего", "Страниц обработано", "Страниц с текстом", "Сканированных страниц",
    "Слов", "Символов", "Найденный фрагмент", "Статус", "Примечание", "Метрика", "Глубина k", "Исходное значение", "Единица",
  ]
  const rows: unknown[][] = []

  for (const document of documents) {
    const analysis = document.analysis
    if (!analysis) {
      rows.push(["Документ", document.name, document.id, "", formatDate(document.uploadedAt), "", "", "", "", "", "", "", "", "", reportStatus(document), document.reason])
      continue
    }

    rows.push([
      "Сводка анализа", document.name, document.id, analysis.id, formatDate(document.uploadedAt), formatDate(analysis.createdAt),
      "", analysis.pageCount, analysis.pagesProcessed, analysis.textPages, analysis.scannedPages,
      analysis.totalWords, analysis.totalCharacters, "", reportStatus(document), analysis.note,
    ])
    for (const candidate of analysis.metricCandidates) {
      rows.push([
        "Кандидат метрики", document.name, document.id, analysis.id, formatDate(document.uploadedAt), formatDate(analysis.createdAt),
        candidate.page, analysis.pageCount, analysis.pagesProcessed, analysis.textPages, analysis.scannedPages,
        "", "", candidate.text, reportStatus(document), "Требуется сверка с исходной страницей.",
        candidate.metricName, candidate.metricK, candidate.rawValue, candidate.unit,
      ])
    }
  }

  return encodeCsv(headers, rows)
}

export function AnalysisReport({ onToast }: AnalysisReportProps) {
  const { data, error, isLoading, mutate } = useSWR("/api/reports", fetchReport, { revalidateOnFocus: false })
  const documents = data?.documents ?? []
  const analyzedDocuments = documents.filter((document) => document.analysis)
  const processedPages = analyzedDocuments.reduce((sum, document) => sum + (document.analysis?.pagesProcessed ?? 0), 0)
  const textPages = analyzedDocuments.reduce((sum, document) => sum + (document.analysis?.textPages ?? 0), 0)
  const scannedPages = analyzedDocuments.reduce((sum, document) => sum + (document.analysis?.scannedPages ?? 0), 0)
  const candidateCount = analyzedDocuments.reduce((sum, document) => sum + (document.analysis?.metricCandidates.length ?? 0), 0)
  const textCoverage = processedPages > 0 ? Math.round((textPages / processedPages) * 100) : null

  const downloadReport = () => {
    if (!data) return
    downloadCsvFile(createReportCsv(data.documents), `kosmostack-analysis-report-${new Date().toISOString().slice(0, 10)}.csv`)
    onToast(`Сформирован CSV-отчёт по ${data.documents.length} документам и ${analyzedDocuments.length} анализам.`)
  }

  return <section className="analysis-report ws-stack" aria-labelledby="analysis-report-title">
    <header className="ws-panel ws-row">
      <div><h2 id="analysis-report-title">Протокол обработки PDF</h2><p>Страницы, OCR и кандидаты метрик по каждой загрузке.</p></div>
      <div className="ws-actions">
        <button type="button" className="ws-button" onClick={() => void mutate()} aria-label="Обновить протокол">Обновить</button>
        <ExportMenu kind="processing" label="Скачать сводный протокол" />
        <details className="ws-details"><summary>Подробные данные</summary>
          <p>Все числовые кандидаты · {candidateCount.toLocaleString("ru-RU")} записей</p>
          <button type="button" className="ws-button" onClick={downloadReport} disabled={!data?.documents.length}>
            <ArrowDownToLine aria-hidden="true" /> Все кандидаты · CSV
          </button>
        </details>
      </div>
    </header>

    {error ? <div className="pdf-inline-error" role="alert">{error.message}</div> : isLoading ? <div className="pdf-list-state" role="status">Формируем отчёт из сохранённых результатов…</div> : <>
      <section className="report-kpis" aria-label="Сводные показатели анализа">
        <article className="report-kpi"><span>Документов в хранилище</span><strong>{documents.length}</strong><small>Все загруженные PDF</small></article>
        <article className="report-kpi"><span>Документов проанализировано</span><strong>{analyzedDocuments.length}</strong><small>Последний завершённый анализ каждого PDF</small></article>
        <article className="report-kpi"><span>Страницы с текстом</span><strong>{textCoverage === null ? "—" : `${textCoverage}%`}</strong><small>{textPages} из {processedPages} обработанных страниц · {scannedPages} без текстового слоя</small></article>
        <article className="report-kpi"><span>Кандидатов метрик</span><strong>{candidateCount}</strong><small>Числа, извлечённые из PDF и OCR</small></article>
      </section>

      {documents.length === 0 ? <div className="pdf-analysis-empty">
        <FileText aria-hidden="true" />
        <strong>Документов пока нет</strong>
        <span>Загрузите PDF во вкладке «Загрузка и анализ PDF» — отчёт появится здесь автоматически.</span>
      </div> : <div className="report-table-wrap">
        <div className="panel-heading"><div><h2>Последние результаты по документам</h2><p>{data?.generatedAt ? `Обновлено ${formatDate(data.generatedAt)}` : ""}</p></div><span className="count-pill">{documents.length}</span></div>
        <table className="report-table auto-report-table">
          <thead><tr><th>Документ</th><th>Страницы</th><th>Текстовый слой</th><th>Кандидаты</th><th>Автоматический статус</th></tr></thead>
          <tbody>{documents.map((document) => {
            const analysis = document.analysis
            return <tr key={document.id}>
              <td><strong>{document.name}</strong><small>{analysis ? `Анализ ${formatDate(analysis.createdAt)}` : `Загружен ${formatDate(document.uploadedAt)}`}</small></td>
              <td>{analysis ? `${analysis.pagesProcessed} / ${analysis.pageCount}` : "—"}</td>
              <td>{analysis ? `${analysis.textPages} · ${analysis.scannedPages} скан.` : "—"}</td>
              <td>{analysis ? <details className="report-candidate-details">
                <summary>{analysis.metricCandidates.length} чисел · {analysis.classifiedCandidates} с метрикой</summary>
                {analysis.metricCandidates.length > 0 ? <ol>{analysis.metricCandidates.slice(0, 12).map((candidate, index) => <li key={`${candidate.page}-${index}`}><span>Стр. {candidate.page}</span><p>{candidate.text}</p></li>)}</ol> : <span className="report-candidate-empty">Совпадений не найдено</span>}
              {analysis.metricCandidates.length > 12 && <small>Остальные строки доступны в CSV.</small>}</details> : "—"}</td>
              <td><span className={analysis?.scannedPages ? "not-run" : analysis ? "review-badge review-verified" : "review-badge review-unreviewed"}>{analysis?.scannedPages ? <TriangleAlert aria-hidden="true" /> : analysis ? <CheckCircle2 aria-hidden="true" /> : null}{reportStatus(document)}</span>{document.reason && <small>{document.reason}</small>}</td>
            </tr>
          })}</tbody>
        </table>
      </div>}

      <div className="report-quality-note"><strong>Что означает показатель покрытия</strong><span>«Страницы с текстом» показывает наличие извлекаемого текстового слоя, а не точность распознавания или правильность найденных метрик. Сканированные страницы требуют OCR; автоматический прогон помечает их, не подменяя результат догадкой.</span></div>
    </>}
  </section>
}
