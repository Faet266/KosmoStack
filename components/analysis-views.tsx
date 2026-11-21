"use client"

import { ExportMenu } from "@/components/export-menu"

import { useState } from "react"
import useSWR from "swr"
import { Search } from "lucide-react"
import { AnalysisReport } from "@/components/analysis-report"
import { RagQualityReport } from "@/components/rag-quality-report"
import type { ResultRecord } from "@/lib/result-data"
import { PdfAnalysisWorkspace } from "@/components/pdf-analysis-workspace"

type PassportField = {
  table: string; name: string; definition: string; type: string; cardinality: string; rule: string; example: string
}
type Passport = { version: string; fields: PassportField[] }
const tableNames: Record<string, string> = {
  publications: "Публикации", configurations: "Конфигурации", datasets: "Датасеты",
  tasks: "Задачи", experiments: "Эксперименты", results: "Результаты", issues: "Замечания",
}

export function PassportView() {
  const { data, error } = useSWR<Passport>("/api/rag/passport", async (url: string) => {
    const response = await fetch(url)
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error)
    return payload
  }, { revalidateOnFocus: false })
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("results")
  const fields = data?.fields ?? []
  const tables = [...new Set(fields.map((field) => field.table))]
  const needle = query.trim().toLowerCase()
  const rows = fields.filter((field) => (!category || category === field.table) &&
    (!needle || [field.table, field.name, field.definition, field.rule, field.type].some((part) => part.toLowerCase().includes(needle))))

  return <div className="page-content ws-page">
    <header className="ws-heading"><div><h1>Паспорт данных</h1><p>{data ? `${fields.length} полей · 7 таблиц · схема ${data.version}` : "Поля, типы, единицы и правила выгрузки RAG dev."}</p></div>
      <ExportMenu kind="passport" label="Скачать паспорт" />
    </header>
    {error ? <p className="ws-feedback" role="alert">{error.message}</p> : !data ? <p className="ws-feedback" role="status">Загружаем паспорт…</p> :
      <div className="ws-reader">
        <section className="ws-panel ws-stack">
          <h2>Таблицы схемы</h2>
          <div className="ws-list">
            <button className="ws-list-button" type="button" aria-pressed={!category} onClick={() => setCategory("")}><span>Все таблицы</span><small>{fields.length}</small></button>
            {tables.map((table) => <button type="button" className="ws-list-button" key={table} aria-pressed={category === table} onClick={() => setCategory(table)}>
              <span>{tableNames[table] ?? table}<code>{table}.csv</code></span><small>{fields.filter((field) => field.table === table).length}</small>
            </button>)}
          </div>
        </section>
        <section className="ws-panel ws-stack">
          <div className="ws-row"><div><h2>{category ? tableNames[category] : "Все поля"}</h2>{category && <code>{category}.csv</code>}</div>
            <span className="ws-chip">{rows.length} полей</span></div>
          <label className="ws-field"><span>Поиск по полям</span><div className="ws-search"><Search aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, тип или назначение" />
          </div></label>
          {rows.map((field) => <details className="ws-details ws-schema-field" key={field.table + "." + field.name}>
            <summary><code>{field.name}</code><span>{field.type}</span></summary>
            <p>{field.definition}</p>
            <dl className="ws-key-values">
              <div><dt>Таблица и связь</dt><dd>{field.table} · {field.cardinality}</dd></div>
              <div><dt>Правило</dt><dd>{field.rule}</dd></div>
              <div><dt>Пример</dt><dd>{field.example || "—"}</dd></div>
            </dl>
          </details>)}
          {!rows.length && <p className="ws-feedback">Полей по запросу нет в выбранных таблицах.</p>}
        </section>
      </div>}
  </div>
}

export function RunsView({ onToast, onOpenCorpus, onEvidence }: {
  onToast: (message: string) => void; onOpenCorpus: (id: string) => void; onEvidence: (record: ResultRecord) => void
}) {
  return <div className="page-content ws-page">
    <header className="ws-heading"><div><h1>Загрузка и анализ PDF</h1><p>Извлечение текста, OCR и кандидаты метрик с исходными страницами.</p></div></header>
    <PdfAnalysisWorkspace onToast={onToast} onOpenCorpus={onOpenCorpus} onEvidence={onEvidence} />
  </div>
}

export function ReportsView({ onToast, onReview }: { onToast: (message: string) => void; onReview: (id?: string) => void }) {
  const [mode, setMode] = useState<"quality" | "processing">("quality")
  return <div className="page-content ws-page">
    <header className="ws-heading"><div><h1>Проверки и метрики</h1><p>Итоги сверки корпуса и протоколы обработки PDF.</p></div>
      <ExportMenu kind="metrics" label="Скачать отчёт по метрикам" />
    </header>
    <div className="ws-segments" aria-label="Вид отчёта">
      <button type="button" aria-pressed={mode === "quality"} onClick={() => setMode("quality")}>Качество корпуса</button>
      <button type="button" aria-pressed={mode === "processing"} onClick={() => setMode("processing")}>Обработка PDF</button>
    </div>
    {mode === "quality" ? <RagQualityReport onReview={onReview} /> : <AnalysisReport onToast={onToast} />}
  </div>
}
