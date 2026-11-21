"use client"

import { FileCitation } from "@/components/file-citation"
import { PdfTagSearch, PdfTagExcerpt, usePdfTags } from "@/components/pdf-tag-search"
import { useEffect,useState } from "react"
import { ArrowLeft, ArrowRight, ArrowUpRight, Search } from "lucide-react"
import useSWR from "swr"
import { tableWorkbook } from "@/lib/spreadsheet-export"
import { downloadBlobFile, downloadCsvFile, encodeCsv } from "@/lib/csv"
import { areaWorkspace, areas } from "@/lib/research"
import type { IndexedArea, IndexedFinding, IndexedPublication } from "@/lib/research-evidence"

async function getJson<T>(endpoint: string): Promise<T> {
  const response = await fetch(endpoint)
  if (!response.ok) throw new Error(response.status === 401 ? "Войдите в KosmoStack." : "Не удалось загрузить данные области.")
  return response.json()
}

function PublicationSelect({ publications, value, onChange, all }: {
  publications: IndexedPublication[]; value: string; onChange: (id: string) => void; all?: boolean
}) {
  return <label className="ws-field"><span>Публикация</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {all && <option value="">Все публикации</option>}
      {publications.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}
    </select>
  </label>
}

export function IndexedPages({ area, initialArticle, initialPage, initialCitation, initialTag }: { area: IndexedArea; initialArticle?: string; initialPage?: number; initialCitation?:boolean; initialTag?:string }) {
  const endpoint = "/api/research/" + area + "/evidence"
  const { data, error, isLoading } = useSWR<{ publications: IndexedPublication[] }>(endpoint, getJson, { revalidateOnFocus: false })
  const [selected, select] = useState(initialArticle ?? "")
  const [tag,setTag] = useState(initialTag??"")
  const [jump,setJump]=useState({tag:initialTag??"",id:initialArticle??"",page:initialPage??1,revision:0})
  const tags=usePdfTags("/api/research/"+area+"/tag-pages",tag)
  function onHit(id:string,page:number){
    select(id);setJump(previous=>({tag,id,page,revision:previous.revision+1}))
  }
  useEffect(()=>{
    if(!tag||!tags.data?.hits.length||jump.revision>0&&jump.tag===tag)return
    const hit=tags.data.hits.find(item=>item.id===selected&&item.page===jump.page) ??
      tags.data.hits.find(item=>item.id===selected) ?? tags.data.hits[0]
    onHit(hit.id,hit.page)
  },[tag,tags.data,jump,selected])
  const aliases=tag?[...new Set([...(tags.topic?.aliases??[]),...((tags.data?.hits??[]).map(item=>item.alias))])].slice(0,25):[]
  const publications = data?.publications ?? []
  const article = publications.find((item) => item.id === selected) ?? publications[0]
  return <div className="page-content ws-page">
    <header className="ws-heading"><div><h1>Страницы публикации</h1><p>{areas[area].label}</p></div>
      <a className="ws-button" href={"/research/" + area}>Поиск по статьям и тегам</a></header>
    <PdfTagSearch tag={tag} setTag={value=>{setTag(value);setJump(previous=>({...previous,tag:""}))}} data={tags.data} error={tags.error} pending={tags.isLoading} onHit={onHit} />
    {isLoading && <p role="status" className="ws-feedback">Загружаем публикации…</p>}
    {error && <p role="alert" className="ws-feedback">{error.message}</p>}
    {data && !article && <p className="ws-feedback">В этой области пока нет публикаций.</p>}
    {article && <section className="ws-panel ws-stack">
      <PublicationSelect value={article.id} publications={publications} onChange={(id)=>{const hit=tags.data?.hits.find(item=>item.id===id);onHit(id,hit?.page??1)}} />
       <IndexedReader key={article.id+":"+jump.revision} area={area} endpoint={endpoint} article={article}
        initialPage={article.id===jump.id?jump.page:undefined} initialCitation={!tag && article.id===initialArticle && initialCitation}
        highlight={aliases} tagLabel={tags.topic?.label} />
    </section>}
  </div>
}

function IndexedReader({ area, endpoint, article, initialPage = 1, initialCitation, highlight, tagLabel }: {
  area: IndexedArea; endpoint: string; article: IndexedPublication; initialPage?: number; initialCitation?:boolean; highlight:string[]; tagLabel?:string
}) {
  const pages = article.pages ?? 0
  const [page, setPage] = useState(Math.min(initialPage, pages || 1))
  const [view,setView]=useState<"original"|"text"|"cite">(initialCitation && pages && article.pdf_url ? "cite" : article.pdf_url && pages ? "original" : "text")
  const [imageFailed,failImage]=useState(false)
  function changePage(number:number) {setPage(number);failImage(false)}
  const params = new URLSearchParams({ mode: "text", id: article.id })
  const paging=new URLSearchParams({page:String(page),...(highlight.length?{highlight:highlight.join("|")}:{})})
  if (pages) params.set("page", String(page))
  const url = article.pdf_url ? article.pdf_url + (pages ? "#page=" + page : "") : null
  const { data, error, isLoading } = useSWR<{ fragments: Array<{ page: number | null; source_url: string; body: string }> }>(
    view === "original" ? null : endpoint + "?" + params, getJson, { revalidateOnFocus: false })
  return <>
    {tagLabel && <p>Выбранный тег <mark className="ws-tag-mark">{tagLabel}</mark></p>}
    <div className="ws-row"><div><h2>{article.title}</h2>
      <p>{[article.provider, article.year, pages ? pages + " стр." : null].filter(Boolean).join(" · ")}</p>
      {!!article.authors.length && <p>{article.authors.join(", ")}</p>}</div>
      <div className="ws-actions">
        <a className="ws-button" href={article.source_url} target="_blank" rel="noreferrer">Первоисточник <ArrowUpRight aria-hidden="true" /></a>
        <a className="ws-button" href={areaWorkspace(area, "catalog", article.id)}>Результаты по публикации</a>
      </div>
    </div>
    {(pages > 0 || url) && <div className="ws-row">
      {pages > 0 && <div className="ws-actions">
        <button className="ws-button ws-square" type="button" disabled={page <= 1} onClick={() => changePage(page - 1)} aria-label="Предыдущая страница"><ArrowLeft /></button>
        <label className="ws-field"><span>Страница</span><select value={page} onChange={(event) => changePage(Number(event.target.value))}>
          {Array.from({ length: pages }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} из {pages}</option>)}
        </select></label>
        <button className="ws-button ws-square" type="button" disabled={page >= pages} onClick={() => changePage(page + 1)} aria-label="Следующая страница"><ArrowRight /></button>
      </div>}
      {url && <div className="ws-actions">
        {pages > 0 && <div className="ws-segments" aria-label="Просмотр страницы PDF">
          {([["original","Оригинал"],["text","Текст"],["cite","Цитата из файла"]] as const).map(([key,label])=>
            <button type="button" key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</div>}
        <a className="ws-button" href={url} target="_blank" rel="noreferrer">Открыть PDF <ArrowUpRight aria-hidden="true" /></a>
      </div>}
    </div>}
    {view==="original" && url ? (imageFailed ? <iframe key={url} className="ws-pdf-frame" title={"Страница "+page+" PDF"} src={url} /> :
      <div className="ws-pdf-image"><img key={paging.toString()} src={"/api/research/"+area+"/image/"+encodeURIComponent(article.id)+"?"+paging}
        alt={"Оригинал PDF · страница "+page} onError={()=>failImage(true)} /></div>) :
      view==="cite" && url ? <FileCitation key={page} article={article} area={area} page={page} pdf={url}
        text={data?.fragments.map((part)=>part.body).join("\n")??""} pending={isLoading}/> : <>
      <h3>{pages > 0 ? "Извлечённый текст страницы" : "Аннотация из открытого источника"}</h3>
      {isLoading && <p role="status">Загружаем текст…</p>}
      {error && <p role="alert">{error.message}</p>}
      {data?.fragments.map((fragment) => <div className="ws-page-text" key={fragment.source_url}><PdfTagExcerpt text={fragment.body} aliases={highlight}/></div>)}
      {data && !data.fragments.length && <p className="ws-feedback">Текст недоступен. Откройте первоисточник.</p>}
    </>}
  </>
}

const kindLabel = {
  candidate: "Автоматический кандидат",
  reported: "Фрагмент с выводом авторов",
  abstract: "Фрагмент аннотации",
}
export function IndexedCatalog({ area, initialArticle }: { area: IndexedArea; initialArticle?: string }) {
  const base = "/api/research/" + area + "/evidence"
  const { data: list } = useSWR<{ publications: IndexedPublication[] }>(base, getJson, { revalidateOnFocus: false })
  const [article, select] = useState(initialArticle ?? "")
  const [query, setQuery] = useState("")
  const [metric, setMetric] = useState("")
  const [limit, setLimit] = useState(12)
  const queryString = new URLSearchParams({ mode: "findings", id: article })
  const { data, error, isLoading } = useSWR<{ findings: IndexedFinding[] }>(base + "?" + queryString, getJson, { revalidateOnFocus: false })
  const findings = data?.findings ?? []
  const metrics = [...new Set(findings.flatMap((row) => row.metric ? [row.metric] : []))]
  const shown = findings.filter((row) => (!metric || metric === row.metric) &&
    [row.title, row.metric, row.value, row.excerpt].join(" ").toLowerCase().includes(query.trim().toLowerCase()))

  async function download(format:"csv"|"xlsx") {
    const rows = shown.map((row) => [row.title, kindLabel[row.kind], row.metric, row.value, row.page, row.excerpt,
      new URL(row.url, window.location.origin).href])
    const headers=["Публикация", "Тип записи", "Метрика", "Значение", "Страница", "Фрагмент", "Источник"]
    if(format==="xlsx")downloadBlobFile(new Blob([await tableWorkbook("Каталог результатов",headers,rows)]),area+"-results.xlsx")
    else downloadCsvFile(encodeCsv(headers,rows),area+"-results.csv")
  }

  return <div className="page-content ws-page">
    <header className="ws-heading"><div><h1>Каталог результатов</h1><p>{areas[area].label}</p></div>
      <a className="ws-button" href={"/research/" + area}>Поиск по статьям и тегам</a></header>
    <section className="ws-panel ws-stack">
      <p>{area === "solar" ? "Значения извлечены из текста PDF автоматически. Сверяйте кандидатов с оригиналом перед использованием." :
        "Фрагменты аннотаций фиксируют выводы авторов, когда они явно сформулированы. По каждому материалу доступен первоисточник."}</p>
      <PublicationSelect value={article} publications={list?.publications ?? []} all onChange={(id) => { select(id); setMetric(""); setLimit(12) }} />
      <label className="ws-field"><span>Поиск по публикации и фрагменту</span><div className="ws-search"><Search aria-hidden="true" />
        <input type="search" data-catalog-search value={query} onChange={(event) => { setQuery(event.target.value); setLimit(12) }} /></div>
      </label>
      {area === "solar" && <label className="ws-field"><span>Метрика</span><select value={metric} onChange={(event) => { setMetric(event.target.value); setLimit(12) }}>
        <option value="">Все метрики</option>{metrics.map((item) => <option key={item}>{item}</option>)}
      </select></label>}
      <div className="ws-row"><strong aria-live="polite">Найдено {shown.length}</strong>
        <button className="ws-button" type="button" disabled={!shown.length} onClick={()=>void download("csv")}>Скачать CSV</button>
        <button className="ws-button" type="button" disabled={!shown.length} onClick={()=>void download("xlsx")}>Скачать XLSX</button></div>
    </section>
    {isLoading && <p role="status" className="ws-feedback">Загружаем результаты…</p>}
    {error && <p role="alert" className="ws-feedback">{error.message}</p>}
    {data && !shown.length && <p className="ws-feedback">По этим условиям результатов нет.</p>}
    <div className="ws-grid ws-two">{shown.slice(0, limit).map((row, index) => <article key={row.article + ":" + row.page + ":" + index} className="ws-panel ws-stack">
      <div className="ws-row"><small>{kindLabel[row.kind]}</small>{row.page && <small>Стр. {row.page}</small>}</div>
      <h2>{row.metric && row.value ? row.metric + " · " + row.value : row.title}</h2>
      {row.metric && <p>{row.title}</p>}
      <blockquote className="ws-quote">{row.excerpt}</blockquote>
      <div className="ws-actions">
        <a className="ws-button" href={areaWorkspace(area, "pages", row.article, row.page ?? undefined)}>Страница публикации</a>
        <a className="ws-link" href={row.url} target="_blank" rel="noreferrer">Первоисточник <ArrowUpRight aria-hidden="true" /></a>
      </div>
    </article>)}</div>
    {limit < shown.length && <button className="ws-button" type="button" onClick={() => setLimit(limit + 12)}>Показать ещё</button>}
  </div>
}
