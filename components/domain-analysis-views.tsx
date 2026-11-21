"use client"

import { useState, type FormEvent } from "react"
import type { ReviewRevision } from "@/lib/rag-store"
import useSWR from "swr"
import { ArrowRight, CheckCircle2, CircleHelp, ClipboardCheck, GitCompareArrows, RotateCcw, TriangleAlert } from "lucide-react"
import { metricLabel, recordValue, reviewStatusLabel, type ParticipantIssue, type ResultRecord } from "@/lib/result-data"

type CompareField = { field: string; left: string; right: string }
type ComparedRecord = {
  result: Record<string, string>
  context: Record<string, Record<string, string>>
}
type ComparisonResponse = {
  status: "comparable" | "incompatible" | "insufficient_data"
  differences: CompareField[]
  missing: CompareField[]
  change: {
    right_minus_left: string
    absolute_difference: string
    unit: string
    direction: string | null
    better: "left" | "right" | "tie" | null
  } | null
  shared_evaluation_cohort: string | null
  left: ComparedRecord
  right: ComparedRecord
}

type CompareViewProps = {
  records: ResultRecord[]
  compareIds: string[]
  onEvidence: (record: ResultRecord) => void
  onToast: (message: string) => void
  onClear: () => void
}

const fieldLabels: Record<string, string> = {
  metric_name: "Определение метрики",
  metric_variant: "Вариант метрики",
  metric_unit: "Единица измерения",
  metric_group: "Группа метрики",
  metric_k: "Глубина оценки k",
  aggregation: "Агрегация",
  dataset_name: "Набор данных",
  dataset_version: "Версия набора",
  data_split: "Разбиение набора",
  language: "Язык",
  scientific_domain: "Предметная область",
  task_type: "Задача",
  evaluation_protocol: "Протокол оценки",
  hardware: "Оборудование",
  measurement_mode: "Режим измерения",
  metric_value: "Значение",
}

function labelFor(field: string) {
  return fieldLabels[field] ?? field.replaceAll("_", " ")
}

async function comparisonFetcher(url: string): Promise<ComparisonResponse> {
  const response = await fetch(url)
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? "Не удалось сравнить записи.")
  return payload as ComparisonResponse
}

function valueOrUnknown(value: string | null | undefined) {
  return value === null || value === undefined || value === "" ? "Не указано" : value
}

export function CompareView({ records, compareIds, onEvidence, onToast, onClear }: CompareViewProps) {
  const eligible = records.filter((record) => record.extractionStatus === "extracted" && record.metricValue !== null)
  const [leftId, setLeftId] = useState(compareIds[0] ?? eligible[0]?.id ?? "")
  const [rightId, setRightId] = useState(compareIds[1] ?? eligible[1]?.id ?? "")
  const comparisonKey = leftId && rightId && leftId !== rightId
    ? `/api/compare?left=${encodeURIComponent(leftId)}&right=${encodeURIComponent(rightId)}`
    : null
  const { data, error, isLoading } = useSWR(comparisonKey, comparisonFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })
  const leftRecord = records.find((record) => record.id === leftId)
  const rightRecord = records.find((record) => record.id === rightId)
  const status = data?.status
  const isComparable = status === "comparable"
  const differences = data?.differences ?? []
  const missing = data?.missing ?? []
  const changedFields = new Set(differences.map((item) => item.field))
  const missingFields = new Set(missing.map((item) => item.field))
  const rows = data ? [
    ["Метрика", "metric_name", data.left.result.metric_name, data.right.result.metric_name],
    ["Вариант метрики", "metric_variant", data.left.result.metric_variant, data.right.result.metric_variant],
    ["Глубина k", "metric_k", data.left.result.metric_k, data.right.result.metric_k],
    ["Единица", "metric_unit", data.left.result.metric_unit, data.right.result.metric_unit],
    ["Набор", "dataset_name", data.left.context.datasets?.dataset_name, data.right.context.datasets?.dataset_name],
    ["Версия · split", "dataset_version", `${data.left.context.datasets?.dataset_version ?? ""} · ${data.left.context.datasets?.data_split ?? ""}`, `${data.right.context.datasets?.dataset_version ?? ""} · ${data.right.context.datasets?.data_split ?? ""}`],
    ["Задача", "task_type", data.left.context.tasks?.task_type, data.right.context.tasks?.task_type],
    ["Протокол", "evaluation_protocol", data.left.context.experiments?.evaluation_protocol, data.right.context.experiments?.evaluation_protocol],
    ["Агрегация", "aggregation", data.left.result.aggregation, data.right.result.aggregation],
  ] as Array<[string, string, string | undefined, string | undefined]> : []

  return <div className="page-content">
    <div className="page-heading-row"><div><div className="eyebrow page-eyebrow">СРАВНЕНИЕ РЕЗУЛЬТАТОВ</div><h1>Сравнение записей</h1><p>Выберите две записи и проверьте условия их экспериментов.</p></div><div className="page-actions"><button type="button" className="secondary-button" onClick={() => { setLeftId(""); setRightId(""); onClear(); onToast("Выбор записей сброшен.") }}><RotateCcw aria-hidden="true" /> Сбросить выбор</button></div></div>

    {eligible.length >= 2 ? <section className="comparison-selector"><label><span>Запись A</span><select value={leftId} onChange={(event) => setLeftId(event.target.value)}><option value="" disabled>Выберите запись</option>{eligible.map((record) => <option key={record.id} value={record.id}>{record.id} · {record.metricName ?? "Метрика не указана"}{record.metricK !== null ? ` · k=${record.metricK}` : ""} · {recordValue(record)}</option>)}</select></label><div className="compare-icon"><GitCompareArrows aria-hidden="true" /></div><label><span>Запись B</span><select value={rightId} onChange={(event) => setRightId(event.target.value)}><option value="" disabled>Выберите запись</option>{eligible.map((record) => <option key={record.id} value={record.id}>{record.id} · {record.metricName ?? "Метрика не указана"}{record.metricK !== null ? ` · k=${record.metricK}` : ""} · {recordValue(record)}</option>)}</select></label></section> : <div className="empty-state comparison-empty"><div className="empty-icon"><GitCompareArrows aria-hidden="true" /></div><h3>Для сравнения пока нет результатов</h3><p>Сейчас скрипт извлекает текст и числовые фрагменты для проверки, но не создаёт структурированные записи.</p></div>}

    {eligible.length >= 2 && leftId === rightId && <div className="comparison-message" role="status"><CircleHelp aria-hidden="true" /><span>Для сравнения выберите две разные записи.</span></div>}
    {isLoading && <div className="comparison-message" role="status">Проверяю условия сравнения по модулю участника 2…</div>}
    {error && <div className="comparison-message is-error" role="alert"><TriangleAlert aria-hidden="true" /><span>{error.message}</span></div>}

    {data && leftRecord && rightRecord && <>
      <section className={`comparison-verdict ${isComparable ? "is-compatible" : status === "insufficient_data" ? "is-insufficient" : "is-incompatible"}`}>
        <div className="verdict-icon">{isComparable ? <CheckCircle2 aria-hidden="true" /> : status === "insufficient_data" ? <CircleHelp aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}</div>
        <div><span className="eyebrow">ВЫВОД ДОМЕННОЙ ПРОВЕРКИ</span><h2>{isComparable ? "Можно сравнивать" : status === "insufficient_data" ? "Недостаточно данных" : "Нельзя напрямую сравнивать"}</h2>
          {isComparable ? <p>Совместимость подтверждена правилами участника 2. Разница не является оценкой статистической значимости.</p> : <p>{differences[0] ? `Первое существенное отличие: ${labelFor(differences[0].field)} (${valueOrUnknown(differences[0].left)} и ${valueOrUnknown(differences[0].right)}).` : `Не хватает условий: ${missing.map((item) => labelFor(item.field)).join(", ") || "причина указана в результатах доменной проверки"}.`}</p>}
        </div><span className="verdict-label">{isComparable ? "СОВМЕСТИМЫ" : status === "insufficient_data" ? "НУЖНЫ ДАННЫЕ" : "УСЛОВИЯ РАЗЛИЧАЮТСЯ"}</span>
      </section>

      <div className="comparison-columns"><article className="comparison-card"><div className="comparison-card-top"><span className="comparison-letter">A</span><div><span className="eyebrow">{leftRecord.id}</span><h3>{metricLabel(leftRecord)}</h3></div></div><strong className="comparison-value">{recordValue(leftRecord)}</strong><p>{leftRecord.model ?? "Модель не указана"} · {leftRecord.dataset ?? "Набор не указан"}</p><button type="button" className="text-button" onClick={() => onEvidence(leftRecord)}>Открыть доказательство <ArrowRight aria-hidden="true" /></button></article>
        <div className="comparison-middle"><span>{isComparable ? "Δ" : status === "insufficient_data" ? "?" : "≠"}</span><small>{isComparable ? "абсолютная разница" : status === "insufficient_data" ? "нет вывода" : "не сравнивать"}</small>{isComparable && data.change && <><strong>{data.change.absolute_difference} {data.change.unit === "percentage_points" ? "п.п." : data.change.unit}</strong><small>{data.change.better === "tie" ? "значения равны" : data.change.better ? `${data.change.better === "right" ? "B" : "A"} лучше по указанному направлению` : `B − A = ${data.change.right_minus_left} ${data.change.unit}`}</small></>}</div>
        <article className="comparison-card"><div className="comparison-card-top"><span className="comparison-letter letter-b">B</span><div><span className="eyebrow">{rightRecord.id}</span><h3>{metricLabel(rightRecord)}</h3></div></div><strong className="comparison-value">{recordValue(rightRecord)}</strong><p>{rightRecord.model ?? "Модель не указана"} · {rightRecord.dataset ?? "Набор не указан"}</p><button type="button" className="text-button" onClick={() => onEvidence(rightRecord)}>Открыть доказательство <ArrowRight aria-hidden="true" /></button></article>
      </div>

      <section className="conditions-panel"><div className="panel-heading"><div><h2>Условия эксперимента</h2><p>Пустые значения не считаются совпадением.</p></div><span className="count-pill">{differences.length ? `${differences.length} отличий` : `${missing.length} полей не подтверждено`}</span></div><div className="condition-grid">{rows.map(([label, field, leftValue, rightValue]) => <div className="condition-row" key={field}><span>{label}</span><strong className={changedFields.has(field) ? "condition-diff" : missingFields.has(field) ? "condition-missing" : ""}>{valueOrUnknown(leftValue)}</strong><strong className={changedFields.has(field) ? "condition-diff" : missingFields.has(field) ? "condition-missing" : ""}>{valueOrUnknown(rightValue)}</strong></div>)}</div>
        {differences.length > 0 && <div className="comparison-reasons"><strong>Отличается</strong>{differences.map((item) => <p key={item.field}>{labelFor(item.field)}: {valueOrUnknown(item.left)} → {valueOrUnknown(item.right)}</p>)}</div>}
        {missing.length > 0 && <div className="comparison-reasons is-muted"><strong>Недостаточно данных</strong>{missing.map((item) => <p key={item.field}>{labelFor(item.field)}: A — {valueOrUnknown(item.left)}; B — {valueOrUnknown(item.right)}</p>)}</div>}
      </section>
      <div className="comparison-footnote"><CircleHelp aria-hidden="true" /><span>Результат, условия и статус получены из функции Profile.compare участника 2. Неизвестные поля не трактуются как совпадение.</span></div>
    </>}
  </div>
}

export function ReviewView({ records, issues, onEvidence }: { records: ResultRecord[]; issues: ParticipantIssue[]; onEvidence: (record: ResultRecord) => void }) {
  return <div className="page-content">
    <div className="page-heading-row"><div><div className="eyebrow page-eyebrow">КОНТРОЛЬ КАЧЕСТВА</div><h1>Очередь проверки</h1><p>Замечания из корпуса и решения по ним со ссылками на PDF.</p></div><div className="page-actions"><span className="count-pill">{issues.length} в очереди</span></div></div>
    <div className="review-readonly-note"><ClipboardCheck aria-hidden="true" /><span>Решения сохраняются с автором, причиной и источником.</span></div>
    {issues.length > 0 ? <div className="issue-list">{issues.map((issue, index) => {
      const related = issue.recordIds.map((id) => records.find((record) => record.id === `${issue.publicationId}/${id}`)).filter((record): record is ResultRecord => Boolean(record))
      return <article className="issue-card" key={issue.id}><div className="issue-severity"><span>{String(index + 1).padStart(2, "0")}</span><small>ЗАМЕЧАНИЕ</small></div><div className="issue-content"><div className="issue-heading"><div><span className="eyebrow">{issue.id} · {issue.publicationId}</span><h2>{issue.checkName}</h2></div><span className="review-badge review-unreviewed"><span className="status-dot status-unreviewed" />Кандидат</span></div><p>{issue.description}</p><div className="issue-meta"><span>PDF-страница {issue.sourcePage ?? "не указана"}</span><span>{related.length} затронутых результатов</span></div>
        {issue.sourceFragment && <blockquote className="issue-source-quote">{issue.sourceFragment}</blockquote>}
        {related.length > 0 && <div className="issue-related-records"><span className="eyebrow">ЗАТРОНУТЫЕ ЗАПИСИ</span><div>{related.map((record) => <button type="button" className="secondary-button compact" key={record.id} onClick={() => onEvidence(record)}>{record.id} · {record.metricName ?? "результат"} <ArrowRight aria-hidden="true" /></button>)}</div></div>}
        <ReviewDecision issue={issue} records={records.filter((record) => record.publicationId === issue.publicationId)} />
      </div></article>
    })}</div> : <div className="empty-state review-empty"><div className="empty-icon"><CheckCircle2 aria-hidden="true" /></div><h3>Пока нет замечаний</h3><p>Здесь будут отображаться вопросы к результатам после анализа PDF.</p></div>}
  </div>
}

const decisionLabels = {
  open: "Оставить открытым",
  confirm: "Подтвердить замечание",
  rebind: "Исправить привязку",
  unreadable: "Признать источник нечитаемым",
} as const

function ReviewDecision({ issue, records }: { issue: ParticipantIssue; records: ResultRecord[] }) {
  const url = `/api/rag/review/${encodeURIComponent(issue.publicationId)}/${encodeURIComponent(issue.id)}`
  const { data, error, mutate } = useSWR<{ history: ReviewRevision[] }>(url, async (path: string) => {
    const response = await fetch(path)
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error)
    return payload
  })
  const [decision, setDecision] = useState<keyof typeof decisionLabels>("open")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form))
    setSaving(true)
    setMessage("")
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, decision }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error)
      await mutate(payload, false)
      form.reset()
      setDecision("open")
      setMessage("Решение сохранено.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить решение.")
    } finally {
      setSaving(false)
    }
  }

  return <details>
    <summary>Решение и история{data?.history.length ? ` · ${data.history.length}` : ""}</summary>
    {issue.sourcePage && <p><a href={`/api/rag/sources/${issue.publicationId}/pdf#page=${issue.sourcePage}`} target="_blank" rel="noreferrer">Исходная страница замечания</a></p>}
    <form className="advanced-filters" onSubmit={submit}>
      <label><span>Решение</span><select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}>
        {Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {decision === "rebind" && <label><span>Новая запись</span><select name="recordId" required>
        <option value="">Выберите запись</option>
        {records.map((record) => <option key={record.id} value={record.id}>{record.id} · {metricLabel(record)}</option>)}
      </select></label>}
      <label><span>Автор</span><input name="author" maxLength={120} required /></label>
      <label><span>Причина и обоснование</span><textarea name="reason" maxLength={2000} required /></label>
      <button type="submit" className="primary-button" disabled={saving}>Сохранить решение</button>
    </form>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">Не удалось загрузить историю.</p>}
    <ol>{data?.history.map((revision, index) => <li key={revision.id}>
      <strong>{decisionLabels[revision.decision]}</strong>{index === 0 ? " · текущее" : ""} · {revision.author} · {revision.created_at} UTC
      <p>{revision.reason}</p>
      <a href={revision.source_url} target="_blank" rel="noreferrer">PDF · страница {revision.source_page}</a>
      {revision.record_id && <span> · {revision.record_id}</span>}
    </li>)}</ol>
  </details>
}
