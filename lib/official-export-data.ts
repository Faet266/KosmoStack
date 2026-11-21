import { getFullAnalysis } from "@/lib/db-analysis"
import { getLocalDocument, listLocalDocuments } from "@/lib/local-documents"
import { getQualityReport } from "@/lib/quality-report"
import { getVerifiedHandoff, type Table } from "@/lib/quality-handoff"
import { metricMentions } from "@/lib/metric-mentions.mjs"
import { ragControlCheck } from "@/lib/rag-control"
import { compareRagRecords } from "@/lib/rag-compare"

type Cell = string | number | null | undefined
type Row = Cell[]
export type ExportSection = { title: string; paragraphs?: string[]; table?: { headers: string[]; rows: Row[]; widths?: number[] } }
export type OfficialExport = { title: string; code: string; summary: string; sections: ExportSection[] }
export const exportFormats = ["docx", "odt", "csv", "xlsx", "pdf"] as const
export type ExportFormat = typeof exportFormats[number]

const undefinedValue = "Не определено"
const names = { publications: "Публикации", configurations: "Конфигурации", datasets: "Датасеты",
  tasks: "Задачи", experiments: "Эксперименты", results: "Результаты", issues: "Замечания" } as const
const statuses: Record<string, string> = {
  needs_review: "Требуется проверка", not_assessable: "Оценка недоступна",
  pending: "Ожидает анализа", processing: "В обработке", done: "Завершено",
  error: "Ошибка", partial: "Частично обработано", unreadable: "Нечитаемый источник",
  skipped: "Пропущено", complete: "Завершено",
  comparable: "Сопоставимы", incompatible: "Несопоставимы", insufficient_data: "Недостаточно данных",
}
export const exportStatus = (status?: string) => status ? statuses[status] ?? status : undefinedValue
function table(title: string, headers: string[], rows: Row[], widths?: number[]): ExportSection {
  return { title, table: { headers, rows, widths } }
}
function facts(title: string, rows: Row[]) { return table(title, ["Показатель", "Значение"], rows, [35, 65]) }

export function readPassport() {
  const { files, catalog } = getVerifiedHandoff()
  const document = files.get("passport.md")?.toString("utf8")
  if (!document) throw Error("Паспорт снимка недоступен.")
  let table: Table | undefined
  const fields = []
  for (const line of document.split(/\r?\n/u)) {
    if (line.startsWith("## ")) {
      const name = /^## (\w+)\.csv$/u.exec(line)?.[1]
      table = name && Object.hasOwn(catalog.schema.tables, name) ? name as Table : undefined
    }
    if (!table || !line.startsWith("| `")) continue
    const [name, definition, type, cardinality, rule, example] = line.split(/(?<!\\)\|/u)
      .slice(1, -1).map((part) => part.trim().replaceAll("\\|", "|").replaceAll("`", ""))
    if (catalog.schema.tables[table].includes(name) && example !== undefined) fields.push({ table, name, definition, type, cardinality, rule, example })
  }
  const expected = Object.values(catalog.schema.tables).reduce((total, columns) => total + columns.length, 0)
  if (fields.length !== expected) throw Error("Поля паспорта не совпадают со схемой.")
  return { version: catalog.schema_version, fields }
}

export function passportExport(): OfficialExport {
  const data = readPassport()
  return {
    title: "Паспорт научных данных RAG", code: "rag-passport",
    summary: `Схема ${data.version}. Документ описывает ${data.fields.length} полей семи таблиц, их типы и правила заполнения.`,
    sections: Object.keys(names).map((key) => table(names[key as Table],
      ["Поле", "Определение", "Тип и единица", "Кардинальность", "Правило и пример"],
      data.fields.filter((field) => field.table === key).map((field) =>
        [field.name, field.definition, field.type, field.cardinality, [field.rule, field.example ? "Пример " + field.example : ""].filter(Boolean).join("\n")]),
      [17, 23, 18, 15, 27])),
  }
}

export async function metricsExport(): Promise<OfficialExport> {
  const report = await getQualityReport()
  const validation = report.localValidation
  const score = report.evaluation
  const control = ragControlCheck()
  return {
    title: "Отчёт по проверке научных метрик", code: "rag-quality",
    summary: `Корпус RAG ${report.split}. Статус оценки ${exportStatus(report.status).toLowerCase()}. Схема ${report.schemaVersion}.`,
    sections: [
      { ...table("Контрольная сверка по оригиналам PDF", ["Запись","Метрика","Эталон","Страница","Итог"],
        control.rows.map((row) => [row.key,row.metric,row.value+" "+row.unit,row.page,row.outcome === "verified" ? "Совпало" : "Требует разбора"]),[16,25,18,12,29]),
        paragraphs:[control.scope, "Совпало " + control.matched + " из " + control.total + "."] },
      facts("Состав корпуса", [...Object.entries(report.counts).map(([field, count]) => [names[field as Table], count]),
        ["Первичные записи", report.origins.primary], ["Цитируемые записи", report.origins.cited],
        ["Публикации с частичным покрытием", report.partialDocuments]]),
      facts("Проверка источников", [
        ["Ошибки структуры", validation.structuralErrors], ["Предупреждения", validation.warnings.length],
        ["Цитаты найдены", validation.foundQuotes], ["Требуется визуальная сверка", validation.visualChecks],
        ["Записи без шкалы", validation.unknownScale], ["Замечания рассмотрены", report.review.reviewed],
        ["Замечания подтверждены", report.review.confirmed], ["Задачи сверки с решением", `${report.sourceReview.reviewed} из ${report.sourceReview.total}`],
        ["Внешняя проверка", exportStatus(report.checker.status)], ["Код внешней проверки", report.checker.exitCode ?? undefinedValue],
      ]),
      facts("Оценка по эталону", [
        ["Статус", exportStatus(score.status)], ["TP", score.metrics?.tp ?? undefinedValue], ["FP", score.metrics?.fp ?? undefinedValue],
        ["FN", score.metrics?.fn ?? undefinedValue], ["Precision", score.metrics?.precision ?? undefinedValue],
        ["Recall", score.metrics?.recall ?? undefinedValue], ["F1", score.metrics?.f1 ?? undefinedValue],
        ["Пригодные строки выгрузки", score.totals.prediction_assessable], ["Пригодные строки эталона", score.totals.gold_assessable],
        ["Контрольная сумма снимка", report.datasetSha],
      ]),
      { title: "Предупреждения", paragraphs: validation.warnings },
    ],
  }
}

export async function analysisExport(id: string, base: string, format: ExportFormat): Promise<OfficialExport | null> {
  const document = await getLocalDocument(id)
  if (!document) return null
  const analysis = await getFullAnalysis(id)
  if (!analysis?.pages.length) throw new Error("Сначала запустите анализ PDF.")
  const url = new URL(`/api/documents/${encodeURIComponent(id)}/file`, base).href
  const known = analysis.allCandidates.flatMap((entry) => {
    if (entry.metricName) return [entry]
    const matching = metricMentions(entry.sourceFragment || entry.text).filter((item) =>
      item.rawValue === entry.rawValue.replace(/\s|%/gu, "").replace(/−/gu,"-"))
    return matching.length === 1 ? [{ ...entry, ...matching[0] }] : []
  })
  const metrics = [...new Map(known.map((item) => [[item.page,item.metricName,item.metricK,item.rawValue,item.unit,item.sourceFragment].join("|"),item])).values()]
  let corpus: ReturnType<typeof getVerifiedHandoff>["catalog"]["tables"]["results"][number]["data"][] = []
  if (analysis.publication.sha256) {
    try {
      const { catalog } = getVerifiedHandoff()
      const matched = catalog.documents.find((entry) => entry.sha256 === analysis.publication.sha256)
      if (matched) corpus = catalog.tables.results.filter((result) => result.publication_id === matched.publication_id).map((entry)=>entry.data)
    } catch {}
  }
  const selected = ["csv","xlsx"].includes(format) ? metrics : metrics.slice(0, 40)
  const knownIds = new Set(known.map((entry) => entry.id))
  const unclassified = format === "xlsx" ? analysis.allCandidates.filter((entry) => !knownIds.has(entry.id)) : []
  const corpusSelected = ["csv","xlsx"].includes(format) ? corpus : corpus.slice(0, 40)
  return {
    title: "Протокол анализа PDF", code: "pdf-analysis",
    summary: `Документ ${document.name}. Протокол содержит сведения об обработке страниц и извлечённых числовых кандидатах.`,
    sections: [
      facts("Сведения об обработке", [
        ["Название", analysis.publication.title || document.name], ["Состояние", exportStatus(analysis.publication.processing_status)],
        ["Страниц в PDF", analysis.publication.page_count], ["Извлечено страниц", analysis.pages.filter((page) => page.status !== "error" && page.status !== "skipped").length],
        ["Страниц с OCR", analysis.pages.filter((page) => page.extractionMethod === "ocr").length],
        ["Числовые кандидаты", analysis.totalCandidates], ["Распознанные кандидаты с метрикой", metrics.length], ["Записи научного корпуса по этому PDF", corpus.length],
        ["Оригинал PDF", url],
      ]),
      table("Страницы", ["Стр.", "Метод", "Слова", "Состояние"], analysis.pages.map((page) =>
        [page.page, page.extractionMethod, page.wordCount, page.error ?? exportStatus(page.status)]), [10, 20, 12, 58]),
      ...(corpus.length ? [{
        ...table("Научные метрики совпадающего PDF", ["Стр.","Запись","Метрика","Исходное значение","Нормализовано","Источник"],
          corpusSelected.map((row) => [row.source_page,row.result_id,row.metric_name,
            [row.raw_value,row.raw_unit].filter(Boolean).join(" "),
            row.normalized_value ? [row.normalized_value,row.normalized_unit].filter(Boolean).join(" ") : "Шкала не подтверждена",
            [row.source_table,row.source_fragment].filter(Boolean).join(" · ")]),[7,12,18,15,17,31]),
        paragraphs: ["Совпадение PDF подтверждено по SHA-256. Представлено " + corpusSelected.length + " из " + corpus.length + " записей."],
      }] : []),
      {
        ...table("Распознанные метрики", ["Стр.","Метрика","Значение","Фрагмент"],selected.map((item) =>
          [item.page, item.metricName + (item.metricK !== null && !item.metricName?.includes("@") ? "@"+item.metricK : ""),
            [item.rawValue,item.unit && !item.rawValue.endsWith(item.unit) ? item.unit : ""].filter(Boolean).join(" "),
            item.sourceFragment || item.text]),[8,19,15,58]),
        paragraphs: [metrics.length ? "Представлено " + selected.length + " из " + metrics.length + ". Автоматические значения требуют сверки." :
          "Распознанных метрик в извлечённом тексте нет. Другие числовые упоминания доступны на отдельном листе XLSX."],
      },
      ...(unclassified.length ? [table("Числовые упоминания без установленной метрики",["Стр.","Число","Фрагмент"],
        unclassified.map((item) => [item.page,item.rawValue,item.sourceFragment || item.text]))] : []),
    ],
  }
}

export async function processingExport(): Promise<OfficialExport> {
  const documents = await listLocalDocuments()
  const rows = await Promise.all(documents.map(async (document) => {
    const data = await getFullAnalysis(document.id)
    return [document.name, exportStatus(data?.publication.processing_status ?? "pending"), data?.publication.page_count ?? 0,
      data?.pages.filter((page) => page.extractionMethod === "ocr").length ?? 0, data?.totalCandidates ?? 0]
  }))
  return { title: "Сводный протокол обработки PDF", code: "pdf-processing", summary: `Документов в локальном хранилище ${documents.length}.`,
    sections: [table("Состояние документов", ["Документ", "Состояние", "Страниц", "OCR", "Кандидаты"], rows, [42, 20, 12, 12, 14])] }
}

export async function comparisonExport(left: string, right: string): Promise<OfficialExport | null> {
  const result = await compareRagRecords(left, right)
  if (!result) return null
  const clean = (value: unknown) => typeof value === "string" ? value : ""
  return {
    title: "Протокол сравнения научных метрик", code: "metric-comparison",
    summary: `Записи ${left} и ${right}. Решение ${exportStatus(result.status).toLowerCase()}.`,
    sections: [
      facts("Итог сравнения", [
        ["Запись A", left], ["Запись B", right], ["Решение", exportStatus(result.status)],
        ["Абсолютная разница", result.change?.absolute_difference ?? undefinedValue],
        ["Единица разницы", result.change?.unit === "percentage_points" ? "п.п." : result.change?.unit ?? undefinedValue],
        ["Основание", result.basis === "shared_table" ? "Общая таблица оценки и подтверждённые оси датасета и метрики" :
          result.basis === "documented_cohort" ? "Документированная общая выборка" : "Сопоставление условий в предметной схеме"],
      ]),
      table("Исходные данные", ["Запись", "Метрика", "Значение", "Датасет", "Источник"], [
        [left, result.left.result.metric_name, [result.left.result.raw_value, result.left.result.raw_unit].filter(Boolean).join(" "),
          result.left.context.datasets.dataset_name, `PDF ${result.left.result.publication_id}, стр. ${result.left.result.source_page}`],
        [right, result.right.result.metric_name, [result.right.result.raw_value, result.right.result.raw_unit].filter(Boolean).join(" "),
          result.right.context.datasets.dataset_name, `PDF ${result.right.result.publication_id}, стр. ${result.right.result.source_page}`],
      ], [20, 21, 15, 23, 21]),
      ...(["differences", "missing"] as const).flatMap((kind) => result[kind].length ? [
        table(kind === "missing" ? "Недостающие сведения" : "Расхождения",
          ["Поле схемы", "A", "B"], result[kind].map((entry: Record<string, unknown>) =>
            [clean(entry.field), clean(entry.left) || undefinedValue, clean(entry.right) || undefinedValue]), [34, 33, 33]),
      ] : []),
    ],
  }
}

export function answerExport(body: unknown, base: string): OfficialExport | null {
  if (!body || typeof body !== "object") return null
  const input = body as Record<string, unknown>
  if (typeof input.question !== "string" || typeof input.answer !== "string" || !input.answer.trim() ||
    input.question.length > 2000 || input.answer.length > 16000) return null
  const sources = Array.isArray(input.sources) ? input.sources.slice(0, 12).flatMap((item) => {
    if (!item || typeof item.title !== "string" || typeof item.url !== "string") return []
    try {
      const url = new URL(item.url, base)
      return ["http:", "https:"].includes(url.protocol) ? [[item.title.slice(0, 250), url.href.slice(0, 600)]] : []
    } catch { return [] }
  }) : []
  return {
    title: "Ответ исследовательского ассистента", code: "assistant-answer",
    summary: "Сохранённый вопрос пользователя, ответ языковой модели и источники для проверки.",
    sections: [{ title: "Вопрос", paragraphs: [input.question] }, { title: "Ответ", paragraphs: [input.answer] },
      ...(sources.length ? [table("Источники", ["№", "Наименование", "Адрес"], sources.map((row, index) => [index + 1, ...row]), [8, 37, 55])] : [])],
  }
}
