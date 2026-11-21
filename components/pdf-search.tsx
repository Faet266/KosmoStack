"use client"

import { useState, type FormEvent } from "react"
import { ExternalLink, Search } from "lucide-react"

type ResponseData = {
  answer?: string | null
  mode: string
  sources: { citation: number; title: string; page: number; excerpt: string; method: string; url: string; record: { id: string; url: string; reviewReasons: string[] } | null }[]
}

const reviewMessages: Record<string, string> = {
  unknown_scale: "Шкала неизвестна, результат нельзя сравнивать.",
  visual_region: "Привязана визуальная область. Требуется сверка с изображением.",
  quote_review: "Полная цитата требует визуальной сверки.",
}

export function PdfSearch() {
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState(false)
  const [data, setData] = useState<ResponseData | null>(null)
  const [error, setError] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError("")
    setData(null)
    try {
      const response = await fetch(`/api/rag/search?q=${encodeURIComponent(query.trim())}`, { signal: AbortSignal.timeout(45_000) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? "Поиск недоступен.")
      setData(payload)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Поиск недоступен.")
    } finally {
      setPending(false)
    }
  }

  return <div className="page-content">
    <div className="page-heading-row"><div><h1>Поиск по PDF</h1>
      <p>Введите вопрос, метрику или ключевые слова. Ответ составляется из найденных фрагментов со ссылками на страницы.</p>
    </div></div>
    <form className="catalog-toolbar" onSubmit={submit}>
      <label className="catalog-search"><Search aria-hidden="true" />
        <input type="search" aria-label="Запрос по PDF" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={300} required />
      </label>
      <button type="submit" className="primary-button" disabled={!query.trim() || pending}>{pending ? "Ищем…" : "Найти"}</button>
    </form>
    {error && <p role="alert" className="pdf-inline-error">{error}</p>}
    {data?.mode === "none" && <p role="status">Нет данных по запросу в проиндексированных источниках.</p>}
    {data?.mode === "some_terms" && <p role="status">Показаны фрагменты, в которых совпала часть запроса.</p>}
    {data?.answer && <section className="catalog-panel" aria-label="Ответ по источнику">
      <div className="catalog-panel-head"><div><h2>Ответ из источника</h2><p>{data.answer} <a href={data.sources[0].url} target="_blank" rel="noreferrer">[1]</a></p></div></div>
    </section>}
    {!!data?.sources.length && <section className="issue-list" aria-label="Ответ по источникам">
      {data.sources.map((source) => <article className="issue-card" key={source.citation}>
        <div className="issue-content">
          <h2>{source.title}</h2>
          <blockquote className="issue-source-quote">{source.excerpt}</blockquote>
          {source.record && <a className="text-button" href={source.record.url} target="_blank" rel="noreferrer">Научная запись {source.record.id}</a>}
          {source.record?.reviewReasons.map((reason) => reviewMessages[reason] && <p key={reason}>{reviewMessages[reason]}</p>)}
          {source.method === "ocr" && <p>Текст распознан через OCR и требует сверки.</p>}
          <a className="text-button" href={source.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> [{source.citation}] PDF · стр. {source.page}</a>
        </div>
      </article>)}
    </section>}
  </div>
}
