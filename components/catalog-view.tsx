"use client"

import { useState, type ReactNode } from "react"
import { ArrowDownToLine, ArrowLeftRight, ArrowUpRight, Filter, Search, X } from "lucide-react"
import { extractionStatusLabel, metricLabel, recordValue, sourceMethodLabel, type ResultRecord } from "@/lib/result-data"

type Props = {
  records: ResultRecord[]; search: string; setSearch: (value: string) => void; publicationCount: number
  onEvidence: (record: ResultRecord) => void; onCompare: (ids: string[]) => void
  onExport: (records: ResultRecord[], format?:"csv"|"xlsx") => void; onPages: (publication: string, page: number) => void
}
type Choice = { value: string; label: string }
const filters = ["metric", "dataset", "origin", "group", "k", "protocol", "aggregation", "method", "reading", "issue", "quote"] as const
type Filter = typeof filters[number]
const blank: Record<Filter, string> = { metric: "", dataset: "", origin: "", group: "", k: "", protocol: "", aggregation: "", method: "", reading: "", issue: "", quote: "" }
const labelByFilter = {
  metric: "Метрика", dataset: "Датасет", origin: "Происхождение", group: "Группа метрик", k: "Глубина оценки k",
  protocol: "Протокол", aggregation: "Агрегация", method: "Метод извлечения", reading: "Состояние значения",
  issue: "Замечания", quote: "Сверка цитаты",
}
const origins: Record<ResultRecord["origin"], string> = {
  primary: "Первичный", cited: "Цитируемый", unclassified: "Не указано",
}
const groups: Record<string, string> = {
  retrieval_quality: "Качество поиска", generation_quality: "Качество ответа", answer_quality: "Качество ответа",
  latency: "Задержка", efficiency: "Эффективность", cost: "Стоимость",
}

const options = (values: Array<string | null | undefined>, label: (value: string) => string = (value) => value): Choice[] =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ru"))
    .map((value) => ({ value, label: label(value) }))
const selectable = (record: ResultRecord) => record.extractionStatus === "extracted" && record.metricValue !== null

export function CatalogView({ records, search, setSearch, publicationCount, onEvidence, onCompare, onExport, onPages }: Props) {
  const [active, setActive] = useState(blank)
  const [advanced, setAdvanced] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const choices: Record<Filter, Choice[]> = {
    metric: options(records.map((row) => row.metricName)),
    dataset: options(records.map((row) => row.dataset)),
    origin: options(records.map((row) => row.origin), (value) => origins[value as ResultRecord["origin"]]),
    group: options(records.map((row) => row.sourceRow.metric_group), (value) => groups[value] ?? value),
    k: [...new Set(records.flatMap((row) => row.metricK === null ? [] : [row.metricK]))].sort((a, b) => a - b)
      .map((value) => ({ value: String(value), label: String(value) })).concat({ value: "missing", label: "Не указана" }),
    protocol: options(records.map((row) => row.protocol)),
    aggregation: options(records.map((row) => row.aggregation)),
    method: options(records.map((row) => row.extractionMethod), sourceMethodLabel),
    reading: options(records.map((row) => row.extractionStatus), (value) => extractionStatusLabel(value as ResultRecord["extractionStatus"])),
    issue: [{ value: "yes", label: "С замечанием" }, { value: "no", label: "Без замечаний" }],
    quote: [{ value: "found_in_cached_page", label: "Цитата найдена в кеше" }, { value: "needs_visual_review", label: "Требуется визуальная сверка" }],
  }
  const query = search.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  const visible = records.filter((row) => {
    const fields = [row.id, row.publicationId, row.paperTitle, row.doi, row.model, row.configuration, row.dataset, metricLabel(row), row.sourceFragment]
    if (!query.every((term) => fields.some((text) => text?.toLowerCase().includes(term)))) return false
    const values = {
      metric: row.metricName, dataset: row.dataset, origin: row.origin, group: row.sourceRow.metric_group,
      k: row.metricK === null ? "missing" : String(row.metricK), protocol: row.protocol, aggregation: row.aggregation,
      method: row.extractionMethod, reading: row.extractionStatus, issue: row.issueIds.length ? "yes" : "no", quote: row.quoteStatus,
    }
    return filters.every((key) => !active[key] || values[key] === active[key])
  })
  const pageSize = 25
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize))
  const current = Math.min(page, pageCount - 1)
  const visibleRows = visible.slice(current * pageSize, (current + 1) * pageSize)
  const activeFilters = filters.filter((key) => active[key])
  const duplicateCount = records.filter((row) => row.duplicateOf).length

  function setFilter(key: Filter, value: string) {
    setActive((previous) => ({ ...previous, [key]: value })); setPage(0)
  }
  function clear() {
    setSearch(""); setActive(blank); setPage(0)
  }
  function toggle(id: string) {
    setSelected((previous) => previous.includes(id) ? previous.filter((item) => item !== id) :
      previous.length < 2 ? [...previous, id] : previous)
  }
  function menu(key: Filter): ReactNode {
    return choices[key].length > 0 && <label className="ws-field" key={key}><span>{labelByFilter[key]}</span>
      <select value={active[key]} onChange={(event) => setFilter(key, event.target.value)}>
        <option value="">Все</option>{choices[key].map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>
    </label>
  }

  return <div className="page-content ws-page">
    <header className="ws-heading">
      <div><h1>Каталог результатов</h1><p>Научные значения с условиями эксперимента и ссылками на страницы PDF.</p></div>
      <a className="ws-button ws-primary" href="/api/rag/export"><ArrowDownToLine aria-hidden="true" /> Скачать 7 таблиц</a>
    </header>
    <div className="ws-grid ws-three" aria-label="Сводка корпуса">
      <div className="ws-stat"><span>Публикации</span><strong>{publicationCount}</strong></div>
      <div className="ws-stat"><span>Уникальные результаты</span><strong>{records.length - duplicateCount}</strong></div>
      <div className="ws-stat"><span>Повторные упоминания</span><strong>{duplicateCount}</strong></div>
    </div>
    <section className="ws-panel ws-stack" aria-label="Поиск и фильтры">
      <div className="ws-grid ws-catalog-controls">
        <label className="ws-field"><span>Поиск</span><div className="ws-search"><Search aria-hidden="true" />
          <input type="search" data-catalog-search value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Публикация, DOI, система, метрика или ID" />
        </div></label>
        {menu("metric")}{menu("dataset")}
      </div>
      <div className="ws-actions">
        <button type="button" className="ws-button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><Filter aria-hidden="true" /> Ещё фильтры</button>
        {activeFilters.map((key) => <button type="button" className="ws-chip ws-remove" key={key}
          aria-label={`Убрать фильтр ${labelByFilter[key]}`} onClick={() => setFilter(key, "")}>
          {choices[key].find((choice) => choice.value === active[key])?.label ?? active[key]} <X aria-hidden="true" />
        </button>)}
        {(activeFilters.length > 0 || query.length > 0) && <button type="button" className="ws-button" onClick={clear}>Сбросить поиск и фильтры</button>}
      </div>
      {advanced && <div className="ws-grid ws-three">{filters.slice(2).map(menu)}</div>}
    </section>
    {selected.length > 0 && <div className="ws-panel ws-row ws-selection">
      <div className="ws-actions" aria-label="Выбранные для сравнения записи">{selected.map((id) => {
        const record = records.find((entry) => entry.id === id)!
        return <button type="button" className="ws-chip ws-remove" key={id} onClick={() => toggle(id)} aria-label={`Убрать ${id} из сравнения`}>
          {id} · {metricLabel(record)} <X aria-hidden="true" />
        </button>
      })}</div>
      <button type="button" className="ws-button ws-primary" disabled={selected.length !== 2} onClick={() => onCompare(selected)}>
        <ArrowLeftRight aria-hidden="true" /> Сравнить · {selected.length} из 2
      </button>
    </div>}
    <section className="ws-panel ws-stack">
      <header className="ws-row"><div><h2>Результаты</h2><p aria-live="polite">Найдено {visible.length} из {records.length}</p></div>
        <button type="button" className="ws-button" disabled={!visible.length} onClick={() => onExport(visible)}>
          <ArrowDownToLine aria-hidden="true" /> CSV выборки
        </button>
        <button className="ws-button ws-primary" type="button" disabled={!visible.length} onClick={()=>onExport(visible,"xlsx")}>XLSX выборки</button>
      </header>
      {visibleRows.length ? <div className="table-scroll"><table className="ws-table ws-catalog-table">
        <thead><tr><th scope="col"><span className="sr-only">Выбор для сравнения</span></th><th scope="col">Метрика и публикация</th>
          <th scope="col">Система и датасет</th><th scope="col">Значение</th><th scope="col">Источник</th></tr></thead>
        <tbody>{visibleRows.map((record) => <tr key={record.id}>
          <td><input type="checkbox" aria-label={`Выбрать ${record.id} для сравнения`} checked={selected.includes(record.id)}
            disabled={!selectable(record) || (selected.length === 2 && !selected.includes(record.id))}
            onChange={() => toggle(record.id)} /></td>
          <th scope="row"><button type="button" className="ws-link" onClick={() => onEvidence(record)}>{metricLabel(record)}</button>
            <small>{record.paperTitle}</small><code>{record.id}</code></th>
          <td>{record.configuration ?? record.model ?? "Не указана"}<small>{record.dataset ?? "Датасет не указан"}</small>
            {record.task && <small>{record.task}</small>}</td>
          <td><button type="button" className="ws-link ws-value" aria-label={`Открыть доказательство ${record.id}`} onClick={() => onEvidence(record)}>{recordValue(record)}</button>
            <small>{origins[record.origin]}{record.aggregation ? ` · ${record.aggregation}` : ""}</small>
            {!record.metricUnit && record.metricValue !== null && <small className="ws-text-warn">Шкала не указана</small>}</td>
          <td>{record.page ? <button type="button" className="ws-link" onClick={() => onPages(record.publicationId, record.page!)}>
            Стр. {record.page} <ArrowUpRight aria-hidden="true" />
          </button> : "Страница не указана"}
            <small>{record.table || sourceMethodLabel(record.extractionMethod)}</small>
            {record.quoteStatus === "needs_visual_review" && <small className="ws-text-warn">Нужна сверка</small>}
            {record.issueIds.length > 0 && <small>Замечаний · {record.issueIds.length}</small>}</td>
        </tr>)}</tbody>
      </table></div> : <p className="ws-feedback">По выбранным условиям результатов нет.</p>}
      {pageCount > 1 && <div className="ws-pagination">
        <button className="ws-button" type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Назад</button>
        <span>Страница {current + 1} из {pageCount}</span>
        <button className="ws-button" type="button" disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)}>Далее</button>
      </div>}
    </section>
  </div>
}
