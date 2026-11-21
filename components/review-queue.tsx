"use client"

import { useState, type FormEvent } from "react"
import useSWR from "swr"
import { ArrowUpRight, CheckCircle2, ScanLine } from "lucide-react"
import type { ReviewRevision } from "@/lib/rag-store"
import type { SourceReason, SourceRevision } from "@/lib/source-review"
import { metricLabel, recordValue, type ParticipantIssue, type ResultRecord } from "@/lib/result-data"

type FormalIssue = ParticipantIssue & { status: string }
type SourceTask = { id: string; publication: string; page: number; reasons: SourceReason[]; decision: SourceRevision["decision"] }
type Revision = SourceRevision | ReviewRevision

const reasons = {
  unknown_scale: "Не указана шкала",
  visual_region: "Нужна сверка изображения",
  quote_review: "Нужна сверка цитаты",
} satisfies Record<SourceReason, string>

const actions = {
  confirm: "Подтвердить замечание", rebind: "Уточнить привязку",
  unreadable: "Источник нечитаем", open: "Оставить открытым",
} as const

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? "Не удалось загрузить данные.")
  return result
}

export function ReviewQueue({ records, onEvidence, onPage, initialTask }: {
  records: ResultRecord[]
  onEvidence: (record: ResultRecord) => void
  onPage: (publication: string, page: number) => void
  initialTask?: string
}) {
  const issueRequest = useSWR<{ issues: FormalIssue[] }>("/api/rag/issues", getJson)
  const sourceRequest = useSWR<{ tasks: SourceTask[] }>("/api/rag/source-reviews", getJson)
  const [mode, setMode] = useState<"issues" | "sources">("sources")
  const [reason, setReason] = useState("")
  const [state, setState] = useState(initialTask ? "" : "open")
  const [query, setQuery] = useState(initialTask ?? "")
  const [active, setActive] = useState(initialTask ?? "")
  const [page, setPage] = useState(0)
  const [notice, setNotice] = useState("")
  const byId = new Map(records.map((record) => [record.id, record]))
  const pageSize = 12
  const formal = issueRequest.data?.issues ?? []
  const tasks = sourceRequest.data?.tasks ?? []
  const search = query.trim().toLowerCase()
  const filtered = tasks.filter((item) => (!reason || item.reasons.includes(reason as SourceReason)) &&
    (!state || (state === "open") === (item.decision === "open")) &&
    (!search || item.id.toLowerCase().includes(search) ||
      byId.get(item.id)?.metricName?.toLowerCase().includes(search)))
  const pageNumber = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1))
  const shown = filtered.slice(pageNumber * pageSize, (pageNumber + 1) * pageSize)
  const selected = filtered.find((item) => item.id === active) ?? shown[0]
  const record = selected && byId.get(selected.id)
  const error = mode === "issues" ? issueRequest.error : sourceRequest.error

  return <div className="page-content ws-page">
    <header className="ws-heading"><div><h1>Очередь проверки</h1><p>Откройте задачу по записи, сверьте число и заголовок на странице, затем сохраните решение. История остаётся в очереди.</p></div></header>
    <div className="ws-panel ws-actions" aria-label="Порядок проверки"><span>1. Выбрать запись</span><span>2. Открыть страницу</span><span>3. Сохранить решение</span></div>
    <div className="ws-segments" aria-label="Вид проверки">
      <button type="button" aria-pressed={mode === "issues"} onClick={() => setMode("issues")}>Замечания корпуса <span>{formal.length}</span></button>
      <button type="button" aria-pressed={mode === "sources"} onClick={() => setMode("sources")}>Сверка источников <span>{tasks.filter((task) => task.decision === "open").length}</span></button>
    </div>
    {error && <p className="ws-feedback" role="alert">{error.message}</p>}
    {notice && <p className="ws-feedback" role="status">{notice}</p>}
    {mode === "issues" && <>
      {issueRequest.isLoading && <p role="status">Загружаем замечания…</p>}
      {issueRequest.data && formal.length === 0 && <p className="ws-feedback">В корпусе нет предметных замечаний.</p>}
      {formal.map((issue) => {
        const related = records.filter((entry) => entry.publicationId === issue.publicationId && issue.recordIds.includes(entry.sourceRow.result_id))
        const url = `/api/rag/review/${encodeURIComponent(issue.publicationId)}/${encodeURIComponent(issue.id)}`
        return <section className="ws-panel ws-stack" key={issue.id}>
          <header className="ws-row"><div><code>{issue.publicationId}/{issue.id}</code>
            <h2>{issue.checkName === "conflicting_sample_size" ? "Расхождение в размере выборки" : issue.checkName}</h2>
          </div><span className={`ws-chip ${issue.status === "resolved" ? "ws-ok" : "ws-attention"}`}>{issue.status === "resolved" ? "Решение принято" : "Открыто"}</span></header>
          <p>{issue.checkName === "conflicting_sample_size" ? "В подписи к таблице II указано 156 общих вопросов. В тексте на той же странице указано 150." : issue.description}</p>
          {!!issue.sourcePage && <div className="ws-actions"><button className="ws-button" type="button" onClick={() => onPage(issue.publicationId, issue.sourcePage!)}>Посмотреть страницу {issue.sourcePage} <ArrowUpRight aria-hidden="true" /></button></div>}
          {issue.sourceFragment && <blockquote className="ws-quote">{issue.sourceFragment}</blockquote>}
          {related.length > 0 && <details className="ws-details"><summary>Затронутые записи · {related.length}</summary>
            <div className="ws-actions">{related.map((entry) => <button className="ws-button" type="button" key={entry.id} onClick={() => onEvidence(entry)}>
              {entry.id} · {metricLabel(entry)}
            </button>)}</div>
          </details>}
          <DecisionForm url={url} options={records.filter((entry) => entry.publicationId === issue.publicationId)} onSaved={() => void issueRequest.mutate()} />
        </section>
      })}
    </>}
    {mode === "sources" && <>
      <div className="ws-panel ws-grid ws-three">
        <label className="ws-field"><span>Найти запись</span><input type="search" value={query} placeholder="ID или метрика" onChange={(event) => {
          setQuery(event.target.value); setActive(""); setPage(0)
        }} /></label>
        <label className="ws-field"><span>Причина сверки</span><select value={reason} onChange={(event) => { setReason(event.target.value); setActive(""); setPage(0) }}>
          <option value="">Все причины</option>{Object.entries(reasons).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <label className="ws-field"><span>Статус</span><select value={state} onChange={(event) => { setState(event.target.value); setActive(""); setPage(0) }}>
          <option value="open">Открытые</option><option value="reviewed">С решением</option><option value="">Все</option>
        </select></label>
      </div>
      {sourceRequest.isLoading && <p role="status">Загружаем задачи сверки…</p>}
      {sourceRequest.data && filtered.length === 0 && <p className="ws-feedback">С таким фильтром задач нет.</p>}
      {selected && record && <div className="ws-reader">
        <section className="ws-panel ws-stack">
          <div className="ws-row"><h2>Записи</h2><span className="ws-chip">{filtered.length}</span></div>
          <div className="ws-list">{shown.map((item) => <button className="ws-list-button" type="button" key={item.id}
            aria-pressed={selected.id === item.id} onClick={() => setActive(item.id)}>
            <span>{item.id} <small>· стр. {item.page}</small></span><small>{reasons[item.reasons[0]]}</small>
          </button>)}</div>
          <div className="ws-pagination">
            <button className="ws-button" type="button" disabled={pageNumber === 0} onClick={() => { setPage(pageNumber - 1); setActive("") }}>Назад</button>
            <button className="ws-button" type="button" disabled={(pageNumber + 1) * pageSize >= filtered.length} onClick={() => { setPage(pageNumber + 1); setActive("") }}>Далее</button>
          </div>
        </section>
        <section className="ws-panel ws-stack">
          <header className="ws-row"><div><code>{selected.id}</code><h2>{metricLabel(record)}</h2></div><strong className="ws-big-value">{recordValue(record)}</strong></header>
          <div className="ws-actions">{selected.reasons.map((item) => <span className="ws-chip ws-attention" key={item}>{reasons[item]}</span>)}</div>
          <div className="ws-actions">
            <button className="ws-button ws-primary" type="button" onClick={() => onEvidence(record)}><ScanLine aria-hidden="true" /> Открыть доказательство</button>
            <button className="ws-button" type="button" onClick={() => onPage(selected.publication, selected.page)}>Страница {selected.page} <ArrowUpRight aria-hidden="true" /></button>
          </div>
          {record.sourceFragment && <blockquote className="ws-quote">{record.sourceFragment}</blockquote>}
          <DecisionForm key={selected.id} url={`/api/rag/source-reviews/${encodeURIComponent(selected.publication)}/${encodeURIComponent(record.sourceRow.result_id)}`}
            onSaved={() => { setNotice(`Решение по ${selected.id} сохранено.`); void sourceRequest.mutate() }} />
        </section>
      </div>}
    </>}
  </div>
}

function DecisionForm({ url, options, onSaved }: { url: string; options?: ResultRecord[]; onSaved: () => void }) {
  const { data, error, mutate } = useSWR<{ history: Revision[] }>(url, getJson)
  const [decision, setDecision] = useState<keyof typeof actions>("confirm")
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const labels = options ? actions : { ...actions, confirm: "Источник сверен", rebind: "" }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setSaving(true); setMessage(""); setFailed(false)
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), decision }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Не удалось сохранить решение.")
      await mutate(payload, false)
      form.reset()
      setDecision("confirm")
      setMessage("Решение сохранено.")
      onSaved()
    } catch (error) {
      setFailed(true)
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить решение.")
    } finally {
      setSaving(false)
    }
  }

  return <div className="ws-stack">
    <details className="ws-details">
      <summary>Записать решение</summary>
      <form className="ws-stack" onSubmit={submit}>
        <div className="ws-grid ws-two">
          <label className="ws-field"><span>Решение</span><select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}>
            {Object.entries(labels).filter(([, label]) => label).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
          </select></label>
          <label className="ws-field"><span>Автор</span><input name="author" required maxLength={120} /></label>
          {decision === "rebind" && options && <label className="ws-field"><span>Запись для привязки</span><select name="recordId" required defaultValue="">
            <option value="">Выберите запись</option>{options.map((entry) => <option value={entry.id} key={entry.id}>{entry.id} · {metricLabel(entry)}</option>)}
          </select></label>}
        </div>
        <label className="ws-field"><span>Обоснование</span><textarea name="reason" required maxLength={2000} rows={3} /></label>
        <div className="ws-actions"><button className="ws-button ws-primary" type="submit" disabled={saving}>
          <CheckCircle2 aria-hidden="true" />{saving ? "Сохраняем…" : "Сохранить решение"}</button>
          {message && <span role={failed ? "alert" : "status"}>{message}</span>}</div>
      </form>
    </details>
    {error && <p role="alert">История решений недоступна.</p>}
    {!!data?.history.length && <details className="ws-details">
      <summary>История решений · {data.history.length}</summary>
      <ol className="ws-history">{data.history.map((revision) => <li key={revision.id}>
        <strong>{labels[revision.decision]}</strong> · {revision.author} · {new Date(revision.created_at).toLocaleString("ru-RU")}
        <p>{revision.reason}</p><a href={revision.source_url} target="_blank" rel="noreferrer">PDF · стр. {revision.source_page}</a>
        {"record_id" in revision && revision.record_id && <> · {revision.record_id}</>}
      </li>)}</ol>
    </details>}
  </div>
}
