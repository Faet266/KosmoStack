"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import useSWR from "swr"
import { ArrowLeft, ArrowUpRight, FileText, RefreshCw, Search, Tag } from "lucide-react"
import { ThemeButton, useWorkspaceTheme } from "@/components/workspace-theme"
import { TranslateExcerpt } from "@/components/translate-excerpt"
import { PdfTagExcerpt } from "@/components/pdf-tag-search"
import { CitationDetails } from "@/components/file-citation"
import { BookmarkButton } from "@/components/bookmark-button"
import { SignOutButton } from "@/components/sign-out-button"
import { ResearchAreas } from "@/components/research-areas"
import { areaWorkspace, areas, type Area, type ResearchArticle, type ResearchResults } from "@/lib/research"

const pageSize = 12

async function searchResearch(url: string): Promise<ResearchResults> {
  const response = await fetch(url)
  if (!response.ok) throw new Error("Не удалось открыть индекс публикаций.")
  return response.json()
}

export function ResearchView({ area, initialTag, initialQuery }: { area: Area; initialTag: string; initialQuery: string }) {
  const info = areas[area]
  const { light } = useWorkspaceTheme()
  const [tag, setTag] = useState(initialTag)
  const [query, setQuery] = useState(initialQuery)
  const [input, setInput] = useState(initialQuery)
  const [pdfOnly,setPdfOnly] = useState(area === "space")
  const [offset, setOffset] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const endpoint = `/api/research/${area}`
  const params = new URLSearchParams({ q: query, tag, offset: String(offset), pdf: pdfOnly ? "1" : "0" })
  const { data, error, isLoading, mutate } = useSWR(endpoint + "?" + params, searchResearch, { revalidateOnFocus: false })
  const tagLabels = new Map((data?.tags ?? []).map((item) => [item.key, item.label]))
  const visibleTag = tagLabels.get(tag)

  function select(filter: string, text: string) {
    setTag(filter)
    setQuery(text)
    setOffset(0)
    const next = new URLSearchParams()
    if (filter) next.set("tag", filter)
    if (text) next.set("q", text)
    window.history.replaceState(null, "", "/research/" + area + (next.size ? "?" + next : ""))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    select(tag, input.trim())
  }

  async function refreshTags() {
    setRefreshing(true); setMessage(""); setFailed(false)
    try {
      const response = await fetch(endpoint, { method: "POST" })
      if (!response.ok) throw new Error()
      await mutate()
      setMessage("Теги пересчитаны по материалам в PostgreSQL.")
    } catch {
      setFailed(true)
      setMessage("Не удалось пересчитать теги.")
    } finally {
      setRefreshing(false)
    }
  }

  return <main className={`app-shell evidence-workspace ${light ? "theme-light" : "theme-dark"} ws-library`}>
    <div className="ws-library-inner ws-page">
      <div className="ws-row"><Link className="ws-button" href="/"><ArrowLeft aria-hidden="true" /> На главную</Link><ResearchAreas selected={area} /><div className="ws-actions"><Link className="ws-button" href="/cabinet">Личный кабинет</Link><ThemeButton /><SignOutButton /></div></div>
      <header className="ws-heading"><div><h1>{info.label}</h1><p>{info.description}</p>{data && <p aria-live="polite">Публикаций в области: {data.indexed} · PDF: {data.pdfCount}</p>}</div>
        <div className="ws-actions"><Link className="ws-button" href={areaWorkspace(area, "pages")}>Страницы публикаций</Link><Link className="ws-button ws-primary" href={areaWorkspace(area, "catalog")}>Каталог результатов<ArrowUpRight aria-hidden="true" /></Link></div>
      </header>
      <section className="ws-panel ws-stack" aria-label="Поиск публикаций">
        <form onSubmit={submit} className="ws-library-search">
          <label className="ws-field"><span>Поиск по статьям</span>
            <div className="ws-search"><Search aria-hidden="true" /><input type="search" value={input} maxLength={150}
              placeholder="Тег, название, автор, DOI или слова из текста" onChange={(event) => setInput(event.target.value)} /></div>
          </label>
          <button className="ws-button ws-primary" type="submit">Найти</button>
          {(input || tag || query) && <button className="ws-button" type="button" onClick={() => { setInput(""); select("", "") }}>Сбросить</button>}
        </form>
        <div className="ws-segments" aria-label="Наличие оригинала PDF">
          <button type="button" aria-pressed={pdfOnly} onClick={()=>{setPdfOnly(true);setOffset(0)}}>С PDF</button>
          <button type="button" aria-pressed={!pdfOnly} onClick={()=>{setPdfOnly(false);setOffset(0)}}>Все материалы</button>
        </div>
        <div className="ws-row"><strong>Теги и число статей</strong>
          <button className="ws-button" type="button" onClick={() => void refreshTags()} disabled={refreshing || isLoading || !data?.indexed}>
            <RefreshCw aria-hidden="true" />{refreshing ? "Пересчитываем…" : "Пересчитать теги из базы"}
          </button>
        </div>
        <div className="ws-actions ws-library-tags">
          <button className="ws-chip" type="button" aria-pressed={!tag} onClick={() => select("", query)}>Все публикации</button>
          {data?.tags.map((item) => <button className="ws-chip" type="button" aria-pressed={tag === item.key} key={item.key}
            onClick={() => select(tag === item.key ? "" : item.key, query)}><Tag aria-hidden="true" /> {item.label} <strong>{item.count}</strong></button>)}
        </div>
        {message && <p role={failed ? "alert" : "status"}>{message}</p>}
      </section>
      <div className="ws-row"><div><h2>{visibleTag ? `Статьи с тегом «${visibleTag}»` : "Публикации"}</h2>
        {data && <p aria-live="polite">Найдено {data.total} из {data.indexed}</p>}</div>
        <details className="ws-details ws-citation-explainer">
          <summary>Зачем цитировать</summary>
          <p>Ссылка указывает, кто опубликовал результат и где его проверить. Для списка литературы скачайте BibTeX. Для конкретного утверждения откройте фрагмент и укажите страницу, если она известна.</p>
        </details>
      </div>
      {isLoading && <p className="ws-feedback" role="status">Загружаем публикации…</p>}
      {error && <div className="ws-panel ws-row"><p role="alert">{error.message}</p><button className="ws-button" type="button" onClick={() => void mutate()}>Повторить</button></div>}
      {!!data && !data.articles.length && <p className="ws-feedback">{data.indexed ? "По этим условиям публикаций нет." : "В области пока нет импортированных публикаций."}</p>}
      <div className="ws-grid ws-two">
        {data?.articles.map((article) => <PublicationCard key={article.id} area={area} article={article} activeTag={tag}
          tags={tagLabels} onTag={(key) => select(key, query)} />)}
      </div>
      {!!data && data.total > pageSize && <div className="ws-pagination">
        <button className="ws-button" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Назад</button>
        <span>Страница {Math.floor(offset / pageSize) + 1} из {Math.ceil(data.total / pageSize)}</span>
        <button className="ws-button" type="button" disabled={offset + pageSize >= data.total} onClick={() => setOffset(offset + pageSize)}>Далее</button>
      </div>}
    </div>
  </main>
}

function PublicationCard({ article, area, tags, activeTag, onTag }: {
  article: ResearchArticle; area: Area; tags: Map<string, string>; activeTag: string; onTag: (value: string) => void
}) {
  const publicationUrl=areaWorkspace(area,"pages",article.id,article.match?.page??undefined)
  const pageUrl=publicationUrl+(activeTag?"&tag="+encodeURIComponent(activeTag):"")
  const titleSource = article.match?.page ? `PDF · стр. ${article.match.page}` :
    article.match?.location === "abstract" ? "Аннотация" : article.match?.location === "keywords" ? "Ключевые слова источника" : "Карточка публикации"
  const articleTags = [...article.tag_keys].sort((left, right) => Number(right === activeTag) - Number(left === activeTag))


  return <article className="ws-panel ws-stack ws-library-card">
    <div className="ws-row"><span className="ws-chip">{article.provider}</span><small>{[article.year, article.pages ? `${article.pages} стр.` : null].filter(Boolean).join(" · ")}</small></div>
    <h2><a href={article.source_url} target="_blank" rel="noreferrer">{article.title}</a></h2>
    {article.authors.length > 0 && <p>{article.authors.slice(0, 3).join("; ")}{article.authors.length > 3 ? ` +${article.authors.length - 3}` : ""}</p>}
    {article.match && <div className="ws-library-match">
      <blockquote className="ws-quote">{article.match.alias ? <PdfTagExcerpt text={article.match.excerpt} aliases={[article.match.alias]} /> : article.match.excerpt.split(/[⟦⟧]/u).map((part, index) =>
        index % 2 ? <mark className="ws-tag-mark" key={index}>{part}</mark> : part)}</blockquote>
      <a className="ws-link" href={article.match.page && article.pdf_url ? pageUrl : article.match.source_url}>{titleSource} <ArrowUpRight aria-hidden="true" /></a>
    </div>}
    <div className="ws-actions ws-library-tags" aria-label="Теги публикации">
      {articleTags.slice(0, 6).map((key) => <button type="button" className="ws-chip" key={key} aria-pressed={key === activeTag}
        onClick={() => onTag(key)}>{tags.get(key) ?? key}</button>)}
      {articleTags.length > 6 && <details className="ws-details"><summary>Ещё {articleTags.length - 6}</summary>
        <div className="ws-actions">{articleTags.slice(6).map((key) => <button type="button" className="ws-chip" key={key} onClick={() => onTag(key)}>{tags.get(key) ?? key}</button>)}</div>
      </details>}
    </div>
    {article.pdf_url && <div className="ws-actions"><a className="ws-button" href={pageUrl}><FileText aria-hidden="true" /> Страницы PDF</a>
      <Link className="ws-button" href={publicationUrl+"&citation=1#file-citation"}>Цитата из файла</Link></div>}
    <BookmarkButton href={areaWorkspace(area, "pages", article.id, article.match?.page ?? undefined)} title={article.title} />
    <details className="ws-details">
      <summary>Цитировать публикацию</summary>
      <CitationDetails article={article} area={area} />
      <TranslateExcerpt key={article.match?.excerpt ?? article.id}
        label={article.match ? "Перевести название и цитату" : "Перевести название"}
        text={[article.title, article.match?.excerpt.replace(/[⟦⟧]/gu, "")].filter(Boolean).join("\n\n")} />
    </details>
  </article>
}
