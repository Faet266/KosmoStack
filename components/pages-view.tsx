"use client"

import { FileCitation } from "@/components/file-citation"
import type { CitationItem } from "@/lib/research"
import { ExportMenu } from "@/components/export-menu"
import { useEffect, useState } from "react"
import useSWR from "swr"
import { PdfTagSearch, PdfTagExcerpt, usePdfTags } from "@/components/pdf-tag-search"
import { ArrowLeft, ArrowRight, ArrowUpRight, ScanLine } from "lucide-react"
import { metricLabel, recordValue, sourceMethodLabel, type ResultRecord } from "@/lib/result-data"

type Publication = { id: string; corpus_id: string | null; sha256: string | null; title: string | null; filename: string; page_count: number; authors?:string|null; year?:number|null; doi?:string|null }
type PageSummary = { pageNumber: number; wordCount: number; extractionMethod: string; status: string; candidateCount: number }
type Candidate = { id: number; raw_value: string; unit: string | null; metric_name: string | null; metric_k: number | null; source_fragment: string; is_classified: number }
type LocalPage = { page: { text_content: string; error_message: string | null }; candidates: Candidate[] }

export type PageSelection = { publication: string; page: number }
async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? "Не удалось получить страницу.")
  return result
}

export function PagesView({ mode, records, initial, onEvidence, onCatalog, onUpload, publicationsUrl, initialCitation, initialTag, workspaceId }: {
  mode: "rag" | "uploads"; publicationsUrl?: string; initialCitation?:boolean; initialTag?:string; workspaceId?:string; records: ResultRecord[]; initial?: PageSelection
  onEvidence: (record: ResultRecord) => void; onCatalog: (publication: string) => void; onUpload: () => void
}) {
  const publications = useSWR<{ publications: Publication[] }>(publicationsUrl ?? (mode === "uploads" ? "/api/publications?scope=uploads" : "/api/publications"), getJson, { revalidateOnFocus: false })
  const [selected, setSelected] = useState(initial?.publication ?? "")
  const [tag,setTag]=useState(initialTag??"")
  const [jump,setJump]=useState({id:initial?.publication??"",page:initial?.page,revision:0})
  const tags=usePdfTags(workspaceId?"/api/workspaces/"+workspaceId+"?mode=tag-pages":mode==="rag"?"/api/research/rag/tag-pages":null,tag)
  function onHit(id:string,page:number){
    setSelected(id)
    setJump(previous=>({id,page,revision:previous.revision+1}))
  }
  useEffect(()=>{
    if(!tag||!tags.data?.hits.length||jump.revision)return
    const hit=tags.data.hits.find(item=>item.id===selected&&item.page===jump.page) ??
      tags.data.hits.find(item=>item.id===selected) ?? tags.data.hits[0]
    onHit(hit.id,hit.page)
  },[tag,tags.data,jump,selected])
  const aliases=tag?[...new Set([...(tags.topic?.aliases??[]),...(tags.data?.hits??[]).map(item=>item.alias)])].slice(0,25):[]
  const list = (publications.data?.publications ?? []).filter((item) => mode === "rag" || !item.corpus_id)
  const corpus = list.filter((item) => item.corpus_id).sort((a, b) => a.corpus_id!.localeCompare(b.corpus_id!))
  const uploads = list.filter((item) => !item.corpus_id)
  const current = list.find((item) => item.id === selected || item.corpus_id === selected) ?? corpus[0] ?? uploads[0]
  const companion = current?.sha256 && list.find((item) => item.id !== current.id && item.sha256 === current.sha256 &&
    Boolean(item.corpus_id) !== Boolean(current.corpus_id))
  const results = current?.corpus_id ? records.filter((record) => record.publicationId === current.corpus_id) : []

  return <div className="page-content ws-page">
    <header className="ws-heading"><div><h1>Страницы публикации</h1><p>Откройте страницу, её извлечённый текст и связанные результаты.</p></div></header>
    {(workspaceId||mode==="rag")&&<PdfTagSearch tag={tag} setTag={value=>{setTag(value);setJump(previous=>({...previous,revision:0}))}} data={tags.data} error={tags.error} pending={tags.isLoading} onHit={onHit}/>}
    {publications.error && <p className="ws-feedback" role="alert">{publications.error.message}</p>}
    {publications.isLoading && <p className="ws-feedback" role="status">Загружаем публикации…</p>}
    {publications.data && !current && <p className="ws-feedback">В этом разделе пока нет документов.</p>}
    {current && <>
      <section className="ws-panel ws-stack">
        <label className="ws-field"><span>Публикация</span>
          <select value={current.id} onChange={(event) => {
            const id=event.target.value
            const article=list.find(item=>item.id===id)
            const hit=tags.data?.hits.find(item=>item.id===(article?.corpus_id??id))
            if(hit)onHit(hit.id,hit.page)
            else setSelected(id)
          }}>
            {corpus.length > 0 && <optgroup label="Научный корпус RAG dev">{corpus.map((publication) =>
              <option key={publication.id} value={publication.id}>{publication.corpus_id} · {publication.title ?? publication.filename}</option>)}</optgroup>}
            {uploads.length > 0 && <optgroup label="Загруженные PDF">{uploads.map((publication) =>
              <option key={publication.id} value={publication.id}>{publication.title ?? publication.filename}</option>)}</optgroup>}
          </select>
        </label>
        <div className="ws-row"><div><h2>{current.title ?? current.filename}</h2>
          <p>{current.filename} · {current.page_count} стр.{current.corpus_id ? ` · ${results.length} научных записей` : " · локальный разбор"}</p></div>
          <div className="ws-actions">
            {!current.corpus_id && current.page_count > 0 && <ExportMenu kind="analysis" params={{ id: current.id }} label="Экспорт анализа" inline />}
            {current.corpus_id && <button className="ws-button" type="button" onClick={() => onCatalog(current.corpus_id!)}>Результаты в каталоге</button>}
            {companion && <button className="ws-button" type="button" onClick={() => setSelected(companion.id)}>
              {current.corpus_id ? "Кандидаты из загруженного PDF" : "Записи научного корпуса"}
            </button>}
          </div>
        </div>
      </section>
      <PublicationReader key={current.id+":"+jump.revision} publication={current} results={results}
        initialPage={jump.id===current.corpus_id||jump.id===current.id?jump.page:undefined}
        initialCitation={!tag&&initialCitation} highlight={aliases} tagLabel={tags.topic?.label} onEvidence={onEvidence} onUpload={onUpload} />
    </>}
  </div>
}

function PublicationReader({ publication, results, initialPage, onEvidence, onUpload, initialCitation, highlight, tagLabel }: {
  publication: Publication; results: ResultRecord[]; initialPage?: number; initialCitation?:boolean; highlight:string[]; tagLabel?:string
  onEvidence: (record: ResultRecord) => void; onUpload: () => void
}) {
  const [selectedPage, setSelectedPage] = useState(initialPage)
  const [view,setView] = useState<"original"|"text"|"results"|"cite">(initialCitation?"cite":"original")
  const [onlyResults, setOnlyResults] = useState(false)
  const endpoint = `/api/publications/${encodeURIComponent(publication.id)}/pages`
  const listing = useSWR<{ pages: PageSummary[] }>(publication.page_count ? endpoint : null, getJson, { revalidateOnFocus: false })
  const corpus = publication.corpus_id
  const counts = new Map<number, number>()
  for (const record of results) if (record.page) counts.set(record.page, (counts.get(record.page) ?? 0) + 1)
  const countFor = (entry: PageSummary) => corpus ? counts.get(entry.pageNumber) ?? 0 : entry.candidateCount
  const pages = (listing.data?.pages ?? []).filter((entry) => !onlyResults || countFor(entry) > 0)
  const index = Math.max(0, pages.findIndex((entry) => entry.pageNumber === (selectedPage ?? results.find((record) => record.page)?.page)))
  const page = pages[index]
  const pageResults = results.filter((entry) => entry.page === page?.pageNumber)

  if (!publication.page_count) return <div className="ws-panel ws-stack">
    <h2>Анализ ещё не готов</h2><button className="ws-button" type="button" onClick={onUpload}>Открыть загрузку и анализ PDF</button>
  </div>
  if (listing.error) return <p className="ws-feedback" role="alert">{listing.error.message}</p>
  if (listing.isLoading) return <p className="ws-feedback" role="status">Загружаем список страниц…</p>
  return <div className="ws-reader">
    <section className="ws-panel ws-stack">
      <div className="ws-row"><h2>Страницы</h2><span className="ws-chip">{pages.length}</span></div>
      <label className="ws-check"><input type="checkbox" checked={onlyResults} onChange={(event) => setOnlyResults(event.target.checked)} />
        {corpus ? "Только с результатами" : "Только с кандидатами"}</label>
      {pages.length > 0 && <label className="ws-field"><span>Перейти к странице</span><select value={page?.pageNumber} onChange={(event) => setSelectedPage(Number(event.target.value))}>
        {pages.map((entry) => <option key={entry.pageNumber} value={entry.pageNumber}>Стр. {entry.pageNumber}{countFor(entry) > 0 ? ` · ${countFor(entry)} записей` : ""}</option>)}
      </select></label>}
      <div className="ws-list ws-page-grid" aria-label="Страницы документа">
        {pages.map((entry) => <button className="ws-list-button" type="button" key={entry.pageNumber}
          aria-pressed={page?.pageNumber === entry.pageNumber} onClick={() => setSelectedPage(entry.pageNumber)}>
          <span>{entry.pageNumber}</span>{countFor(entry) > 0 && <small aria-label={`${countFor(entry)} записей`}>{countFor(entry)}</small>}
        </button>)}
      </div>
      {!page && <p className="ws-muted">Страниц по фильтру нет.</p>}
    </section>
    {page && <section className="ws-panel ws-stack">
      <div className="ws-row"><div><h2>Страница {page.pageNumber}</h2><p>{sourceMethodLabel(page.extractionMethod)}{!corpus ? ` · ${page.wordCount} слов` : ""}</p></div>
        <div className="ws-actions">
          <button className="ws-button ws-square" type="button" disabled={index === 0} aria-label="Предыдущая страница" onClick={() => setSelectedPage(pages[index - 1].pageNumber)}><ArrowLeft /></button>
          <button className="ws-button ws-square" type="button" disabled={index + 1 >= pages.length} aria-label="Следующая страница" onClick={() => setSelectedPage(pages[index + 1].pageNumber)}><ArrowRight /></button>
        </div>
      </div>
      {tagLabel&&<p>Выбранный тег <mark className="ws-tag-mark">{tagLabel}</mark></p>}
      <PageBody key={page.pageNumber+":"+highlight.join("|")} highlight={highlight} publication={publication} summary={page} endpoint={endpoint} results={pageResults} onEvidence={onEvidence} view={view} setView={setView} />
    </section>}
  </div>
}

function PageBody({ publication, summary, endpoint, results, onEvidence, view, setView, highlight }: {
  publication: Publication; summary: PageSummary; endpoint: string; results: ResultRecord[]; onEvidence: (record: ResultRecord) => void
  highlight:string[]
  view:"original"|"text"|"results"|"cite"; setView:(view:"original"|"text"|"results"|"cite")=>void
}) {
  const [zoom, setZoom] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [limit, setLimit] = useState(20)
  const corpus = publication.corpus_id
  const number = summary.pageNumber
  const sourceRoot = `/api/rag/sources/${encodeURIComponent(corpus ?? "")}`
  const pdf = corpus ? `${sourceRoot}/pdf#page=${number}` : `/api/documents/${encodeURIComponent(publication.id)}/file#page=${number}`
  const imageRoot = corpus ? "/api/research/rag/image/"+encodeURIComponent(corpus) : "/api/documents/"+encodeURIComponent(publication.id)+"/page-image"
  const image = highlight.length ? imageRoot+"?"+new URLSearchParams({page:String(number),highlight:highlight.join("|")}) :
    corpus ? sourceRoot+"/"+number+"/image" : null
  const source = useSWR<{ fragments: { text: string; block_type: string }[] }>(
    corpus && (view === "text" || view === "cite") ? `${sourceRoot}/${number}` : null, getJson, { revalidateOnFocus: false })
  const local = useSWR<LocalPage>(!corpus && view !== "original" ? `${endpoint}?page=${number}` : null, getJson)
  const text = corpus ? source.data?.fragments.filter((part) => part.block_type === "line" || part.block_type === "ocr_line").map((part) => part.text).join("\n") :
    local.data?.page.text_content
  const citation = useSWR<CitationItem>(corpus && view==="cite" ? "/api/research/rag/citation/"+encodeURIComponent(corpus) : null,getJson)
  const citationItem:CitationItem = citation.data ?? {
    id:corpus ?? publication.id,title:publication.title ?? publication.filename,
    authors:publication.authors?.split(";").map(name=>name.trim()).filter(Boolean)??[],
    source_url:pdf.split("#")[0],year:publication.year??null,doi:publication.doi??null,
    provider:corpus?"Корпус RAG":"Загруженный PDF",
  }
  const total = corpus ? results.length : summary.candidateCount
  return <>
    <div className="ws-row">
      <div className="ws-segments" aria-label="Представление страницы">
        {([["original", "Оригинал"], ["text", "Текст"], ["cite","Цитата из файла"], ["results", `${corpus ? "Результаты" : "Кандидаты"} · ${total}`]] as const).map(([key, label]) =>
          <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
      </div>
      <div className="ws-actions">
        {view === "original" && image && !imageError && <button className="ws-button" type="button" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>
          {zoom ? "Масштаб 100%" : "Увеличить"}</button>}
        <a className="ws-button" href={pdf} target="_blank" rel="noreferrer">Открыть PDF <ArrowUpRight aria-hidden="true" /></a>
      </div>
    </div>
    {view === "original" && (image && !imageError ? <div className={`ws-pdf-image ${zoom ? "ws-zoom" : ""}`}>
      {/* The verified original page is served by the local source endpoint. */}
      <img src={image} onError={() => setImageError(true)} alt={`Оригинальная страница ${number} PDF`} />
    </div> : <iframe className="ws-pdf-frame" title={`Страница ${number} оригинального PDF`} src={pdf} />)}
    {view === "text" && <>
      {(source.isLoading || local.isLoading) && <p role="status">Загружаем текст…</p>}
      {(source.error || local.error) && <p role="alert">{(source.error ?? local.error).message}</p>}
      {text && <pre className="ws-page-text"><PdfTagExcerpt text={text} aliases={highlight}/></pre>}
      {!text && (source.data || local.data) && <p className="ws-feedback">{local.data?.page.error_message ?? "Для страницы нет извлечённого текста."}</p>}
    </>}
    {view==="cite" && <FileCitation article={citationItem} area={corpus?"rag":undefined} page={number} pdf={pdf} text={text??""} pending={source.isLoading||local.isLoading} />}
    {view === "results" && <>
      {local.isLoading && <p role="status">Загружаем кандидатов…</p>}
      {local.error && <p role="alert">{local.error.message}</p>}
      {!total && <p className="ws-feedback">На этой странице нет связанных {corpus ? "научных записей" : "числовых кандидатов"}.</p>}
      {corpus && results.length > 0 && <div className="table-scroll"><table className="ws-table">
        <thead><tr><th scope="col">Метрика</th><th scope="col">Значение</th><th scope="col">Система</th><th scope="col">Источник</th></tr></thead>
        <tbody>{results.slice(0, limit).map((record) => <tr key={record.id}>
          <th scope="row">{metricLabel(record)}<small>{record.id}</small></th>
          <td>{recordValue(record)}</td><td>{record.configuration ?? record.model ?? "Не указана"}</td>
          <td><button className="ws-button" type="button" onClick={() => onEvidence(record)}><ScanLine aria-hidden="true" /> Доказательство</button></td>
        </tr>)}</tbody></table></div>}
      {!!local.data?.candidates.length && <div className="table-scroll"><table className="ws-table">
        <thead><tr><th scope="col">Кандидат</th><th scope="col">Метрика</th><th scope="col">Извлечённый фрагмент</th></tr></thead>
        <tbody>{local.data.candidates.slice(0, limit).map((entry) => <tr key={entry.id}>
          <td>{entry.raw_value}{entry.unit && !entry.raw_value.endsWith(entry.unit) ? ` ${entry.unit}` : ""}</td>
          <td>{entry.metric_name ? metricLabel({ metricName: entry.metric_name, metricK: entry.metric_k }) : "Не определена"}</td>
          <td>{entry.source_fragment}</td>
        </tr>)}</tbody></table></div>}
      {total > limit && <button className="ws-button" type="button" onClick={() => setLimit(limit + 20)}>Показать ещё {Math.min(20, total - limit)}</button>}
    </>}
  </>
}
