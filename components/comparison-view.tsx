"use client"

import { comparisonExamples } from "@/lib/comparison-examples"
import { ComparisonRecordSelect } from "@/components/comparison-record-select"
import { ExportMenu } from "@/components/export-menu"

import { useState, type FormEvent } from "react"
import useSWR from "swr"
import { ArrowLeftRight, ArrowRight, CheckCircle2, Info, TriangleAlert } from "lucide-react"
import { metricLabel, recordValue, type ResultRecord } from "@/lib/result-data"

type Difference = { field: string; left?: string; right?: string }
type ComparedRecord = { result: Record<string, string>; context: Record<string, Record<string, string>> }
type Verdict = {
  status: "comparable" | "incompatible" | "insufficient_data"
  basis?: "shared_table" | "documented_cohort"
  converted_units?: boolean
  differences: Difference[]
  missing: Difference[]
  left: ComparedRecord
  right: ComparedRecord
  change: { absolute_difference: string; right_minus_left: string; unit: string; direction: string | null; better: string | null } | null
}

const labels: Record<string, string> = {
  metric_name: "Метрика", metric_variant: "Определение метрики", metric_group: "Группа метрики",
  metric_k: "Глубина оценки k", metric_unit: "Единица измерения", aggregation: "Агрегация",
  dataset_name: "Датасет", dataset_version: "Версия датасета", data_split: "Разбиение",
  task_type: "Задача", evaluation_protocol: "Протокол оценки", hardware: "Оборудование",
  measurement_mode: "Режим измерения", language: "Язык", scientific_domain: "Предметная область",
  finite_value_and_explicit_unit: "Число и явно указанная шкала", metric_value: "Значение",
  shared_evaluation_cohort: "Подтверждение общей выборки", unit_scale: "Шкала",
}
const titles = {
  comparable: "Записи сопоставимы", incompatible: "Записи несопоставимы", insufficient_data: "Недостаточно данных",
}

const conditions = {
  result: ["metric_name", "metric_variant", "metric_k", "raw_value","raw_unit","normalized_value","normalized_unit","aggregation","sample_size","source_table","source_page"],
  datasets: ["dataset_name", "dataset_version", "data_split"],
  tasks: ["task_type","language"],
  configurations: ["rag_variant","retrieval_method","generator_model","top_k"],
  experiments: ["evaluation_protocol", "hardware","baseline_name"],
}
const fieldLabel = (field: string) => labels[field] ?? field.replaceAll("_", " ")
const show = (value: string | undefined) => value || "Не указано"
const metricFamily = (record: ResultRecord) => record.metricName?.replace(/\s*@\s*\d+\b/gu, "").trim() ?? ""
const russianNumber = (value: string) => value.replace(".", ",")

async function getVerdict(url: string): Promise<Verdict> {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? "Не удалось сравнить записи.")
  return data
}

export function ComparisonView({ records, initialIds, onEvidence, onCatalog, onReview }: {
  records: ResultRecord[]
  initialIds: string[]
  onEvidence: (record: ResultRecord) => void
  onCatalog: () => void
  onReview: (id: string) => void
}) {
  const eligible = records.filter((record) => record.extractionStatus === "extracted" && record.metricValue !== null)
  const [metric, setMetric] = useState("")
  const [filter, setFilter] = useState("")
  const [left, setLeft] = useState(initialIds[0] ?? "")
  const [right, setRight] = useState(initialIds[1] ?? "")
  const [pair, setPair] = useState<string[]>(initialIds)
  const families = [...new Set(eligible.map(metricFamily).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"))
  const selected = [left, right]
  const query = filter.trim().toLowerCase()
  const choices = eligible.filter((record) => selected.includes(record.id) ||
    ((!metric || metricFamily(record) === metric) && (!query ||
      [record.id, metricLabel(record), record.configuration, record.dataset, record.paperTitle].some((text) => text?.toLowerCase().includes(query)))))
  const { data, error, isLoading, mutate } = useSWR(pair.length === 2 && pair[0] !== pair[1] ?
    "/api/compare?" + new URLSearchParams({ left: pair[0], right: pair[1] }) : null, getVerdict,
    { revalidateOnFocus: false })
  const suggested = useSWR<{ ids: string[] }>(left ? "/api/compare/suggestions?" + new URLSearchParams({ record: left }) : null,
    async (url: string) => {
      const response = await fetch(url)
      if (!response.ok) throw new Error("Не удалось подобрать пару.")
      return response.json()
    }, { revalidateOnFocus: false })
  const first = eligible.find((record) => record.id === pair[0])
  const second = eligible.find((record) => record.id === pair[1])
  const hasPair = Boolean(left && right && left !== right)
  const changed = pair[0] !== left || pair[1] !== right
  const visibleVerdict = !changed && data && first && second

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!hasPair) return
    if (changed) setPair([left, right])
    else void mutate()
  }

  return <div className="page-content ws-page ws-comparison">
    <header className="ws-heading ws-comparison-heading">
      <div><h1>Сравнение метрик</h1><p>Выберите два результата. Разница появится, если совпадают существенные условия оценки.</p></div>
      <button className="ws-button" type="button" onClick={onCatalog}>Выбрать в каталоге <ArrowRight aria-hidden="true" /></button>
    </header>
    <div className="ws-panel ws-stack"><h2>Контрольные примеры</h2>
      <div className="ws-actions">{comparisonExamples.map((example)=><button type="button" className="ws-button" key={example.left}
        onClick={()=>{setMetric("");setFilter("");setLeft(example.left);setRight(example.right);setPair([example.left,example.right])}}>{example.label}</button>)}</div>
    </div>
    <form className="ws-panel ws-stack ws-comparison-form" onSubmit={submit}>
      <div className="ws-grid ws-two">
        <label className="ws-field"><span>Метрика</span><select value={metric} onChange={(event) => {
          setMetric(event.target.value); setLeft(""); setRight(""); setPair([])
        }}><option value="">Все метрики</option>{families.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label className="ws-field"><span>Найти запись</span><input type="search" placeholder="ID, система, публикация или датасет" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
        {([["A", left, setLeft, right], ["B", right, setRight, left]] as const).map(([letter, id, setId, other]) =>
          <ComparisonRecordSelect key={letter} slot={letter} label={"Результат "+letter} placeholder="Выберите результат"
            selected={id} onSelect={setId} choices={choices.filter((record) => record.id !== other).map((record) => ({
              id:record.id, title:metricLabel(record), value:recordValue(record),
              context:record.configuration ?? record.model ?? "Система не указана", reference:record.id,
            }))} />)}
      </div>
      <div className="ws-actions">
        <button type="submit" className="ws-button ws-primary" disabled={!hasPair || (!changed && isLoading)}><ArrowLeftRight aria-hidden="true" /> Сравнить</button>
        <button type="button" className="ws-button" disabled={!left && !right && !filter && !metric} onClick={() => {
          setLeft(""); setRight(""); setPair([]); setFilter(""); setMetric("")
        }}>Сбросить</button>
        {!choices.length && <span className="ws-muted" role="status">Записей по фильтру нет.</span>}
        {hasPair && changed && <span className="ws-muted">Нажмите «Сравнить» для выбранной пары.</span>}
      </div>
      {left && <div className="ws-stack" aria-label="Сопоставимые результаты">
        <strong>Подходящие записи для B</strong>
        {suggested.isLoading && <p className="ws-muted">Сверяем условия по источникам…</p>}
        {suggested.error && <p role="status">{suggested.error.message}</p>}
        {suggested.data && (suggested.data.ids.length ? <div className="ws-actions">
          {suggested.data.ids.map((id) => {
            const record = records.find((row) => row.id === id)
            return <button className="ws-button" key={id} type="button" onClick={() => { setRight(id); setPair([left, id]) }}>
              {id}{record ? ` · ${recordValue(record)}` : ""}
            </button>
          })}
        </div> : <p className="ws-muted">Для A не найдена пара с подтверждёнными условиями.</p>)}
      </div>}
    </form>
    {!changed && isLoading && <p className="ws-feedback" role="status">Проверяем условия экспериментов…</p>}
    {!changed && error && <p className="ws-feedback" role="alert">{error.message}</p>}
    {visibleVerdict && <ComparisonOutcome data={data} first={first} second={second} onEvidence={onEvidence} onReview={onReview} />}
  </div>
}

function ComparisonOutcome({ data, first, second, onEvidence, onReview }: {
  data: Verdict; first: ResultRecord; second: ResultRecord; onEvidence: (record: ResultRecord) => void; onReview: (id:string)=>void
}) {
  const Icon = data.status === "comparable" ? CheckCircle2 : data.status === "incompatible" ? TriangleAlert : Info
  const reason = data.differences[0] ?? data.missing[0]
  const unit = data.change?.unit === "percentage_points" ? "п.п." : data.change?.unit
  const changed = new Set(data.differences.map(({ field }) => field))
  const missing = new Set(data.missing.map(({ field }) => field))
  return <>
    <section className={`ws-verdict ws-${data.status}`} aria-live="polite">
      <Icon aria-hidden="true" />
      <div><h2>{titles[data.status]}</h2>
        {data.change ? <p>Разница {russianNumber(data.change.absolute_difference)} {unit}. {data.change.better === "tie" ? "Значения равны." :
          data.change.better ? `Результат ${data.change.better === "right" ? "B" : "A"} лучше по указанному направлению.` : "Направление улучшения не указано."}</p> :
          reason && <p>{fieldLabel(reason.field)}{data.differences.length ? ` · A: ${show(reason.left)}, B: ${show(reason.right)}` : " · нужна сверка с источниками"}.</p>}
        {data.basis === "shared_table" && <p>Общая оценка подтверждается одной таблицей, датасетом, задачей и страницей источника.</p>}
        {data.status === "comparable" && <p>Пустые дополнительные поля ниже означают, что они не приведены в источнике.</p>}
        {data.converted_units && <p>Явно указанные единицы приведены к общей шкале.</p>}
      </div>
    </section>
    <div className="ws-grid ws-two">
      {[first, second].map((record, index) => <article className="ws-panel ws-result-card ws-comparison-result" key={record.id} data-slot={index ? "B" : "A"}>
        <div className="ws-row"><span className="ws-chip">Результат {index ? "B" : "A"}</span><code>{record.id}</code></div>
        <h2>{metricLabel(record)}</h2><strong className="ws-big-value">{recordValue(record)}</strong>
        <p>{record.configuration ?? record.model ?? "Система не указана"} · {record.dataset ?? "Датасет не указан"}</p>
        <div className="ws-actions"><button type="button" className="ws-button" onClick={() => onEvidence(record)}>Доказательство · стр. {record.page ?? "—"}</button>
          <button type="button" className="ws-button" onClick={() => onReview(record.id)}>Найти в очереди проверки</button></div>
      </article>)}
    </div>
    <section className="ws-panel ws-stack">
      <div className="ws-row"><h2>Условия экспериментов</h2><ExportMenu kind="comparison" params={{ left: first.id, right: second.id }} label="Скачать сравнение" /></div>
      <div className="table-scroll"><table className="ws-table">
        <thead><tr><th scope="col">Параметр</th><th scope="col">Результат A</th><th scope="col">Результат B</th></tr></thead>
        <tbody>{Object.entries(conditions).flatMap(([section, fields]) => fields.map((field) => {
          const a = (section === "result" ? data.left.result : data.left.context[section])?.[field]
          const b = (section === "result" ? data.right.result : data.right.context[section])?.[field]
          return <tr key={field} className={changed.has(field) ? "ws-diff" : missing.has(field) ? "ws-missing" : ""}>
            <th scope="row">{fieldLabel(field)}</th><td>{show(a)}</td><td>{show(b)}</td>
          </tr>
        }))}</tbody>
      </table></div>
      {(data.differences.length + data.missing.length > 0) && <details className="ws-details">
        <summary>Все причины и недостающие условия</summary>
        <ul>{data.differences.map((item, index) => <li key={`diff-${index}`}>{fieldLabel(item.field)} · A: {show(item.left)}, B: {show(item.right)}</li>)}
          {data.missing.map((item, index) => <li key={`missing-${index}`}>{fieldLabel(item.field)} · недостаточно данных</li>)}</ul>
      </details>}
    </section>
  </>
}
