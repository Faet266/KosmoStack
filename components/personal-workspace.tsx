"use client"

import { useRef, useState, type DragEvent, type FormEvent } from "react"
import useSWR from "swr"
import { ThemeButton, useWorkspaceTheme } from "@/components/workspace-theme"
import { SignOutButton } from "@/components/sign-out-button"
import { PagesView } from "@/components/pages-view"
import { BookmarkButton } from "@/components/bookmark-button"
import { ExportMenu } from "@/components/export-menu"
import { tableWorkbook } from "@/lib/spreadsheet-export"
import { encodeCsv, downloadBlobFile, downloadCsvFile } from "@/lib/csv"

type Area = { id:string; name:string; documents:number }
type Publication = { id:string; filename:string; title:string|null; processing_status:string; error_message?:string|null; page_count:number; tags:string[] }
type Finding = { document_id:string; filename:string; page_number:number; metric_name:string; metric_k:number|null; raw_value:string; unit:string|null; source_fragment:string }
type BookmarkEntry = {href:string;title:string}
async function read<T>(url:string):Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw Error("Не удалось загрузить данные.")
  return response.json()
}
async function write(url:string,init:RequestInit) {
  const response = await fetch(url,init)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw Error(data?.error ?? "Не удалось сохранить.")
  return data
}

function Shell({ children }: { children:React.ReactNode }) {
  const { light } = useWorkspaceTheme()
  return <main className={"app-shell evidence-workspace ws-library "+(light ? "theme-light" : "theme-dark")}>
    <div className="ws-library-inner ws-page">
      <div className="ws-row"><div className="ws-actions"><a className="ws-button" href="/">На главную</a>
        <a className="ws-button" href="/cabinet">Личный кабинет</a><a className="ws-button" href="/research">Поиск по статьям и тегам</a></div>
        <div className="ws-actions"><ThemeButton /><SignOutButton /></div></div>
      {children}
    </div>
  </main>
}

function DeleteAreaButton({area,removed}: {area:Area;removed:()=>void}) {
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  async function remove() {
    if (!window.confirm("Удалить личную область «"+area.name+"»? Её теги и закладки будут удалены.")) return
    setBusy(true);setError("")
    try {
      await write("/api/workspaces/"+area.id,{method:"DELETE"})
      removed()
    } catch(cause) {setError((cause as Error).message);setBusy(false)}
  }
  return <span className="ws-actions"><button type="button" className="ws-button ws-text-warn" disabled={busy}
    onClick={()=>void remove()}>{busy?"Удаляем…":"Удалить область"}</button>{error&&<small role="alert">{error}</small>}</span>
}

export function OwnedAreaChoices({ view }: { view:"library"|"catalog"|"pages" }) {
  const { data } = useSWR<{areas:Area[]}>("/api/workspaces",read,{revalidateOnFocus:false})
  return <div className="ws-actions">
    {data?.areas.map((area)=><a className="ws-button" key={area.id} href={"/cabinet/"+area.id+(view === "library" ? "" : "?tab="+view)}>{area.name} · {area.documents}</a>)}
    <a className="ws-button" href="/cabinet#areas">Создать область</a>
  </div>
}

export function Cabinet({ account }: {account:{name:string;email:string}}) {
  const areas = useSWR<{areas:Area[]}>("/api/workspaces",read)
  const bookmarks = useSWR<{bookmarks:BookmarkEntry[]}>("/api/bookmarks",read)
  const [name,setName] = useState("")
  const [error,setError] = useState("")
  const [busy,setBusy] = useState(false)
  async function create(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError("")
    try {
      const { area } = await write("/api/workspaces",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})})
      window.location.assign("/cabinet/"+area.id)
    } catch (cause) { setError((cause as Error).message); setBusy(false) }
  }
  async function remove(href:string) {
    try {
      await write("/api/bookmarks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({href,remove:true})})
      await bookmarks.mutate()
    } catch (cause) { setError((cause as Error).message) }
  }
  return <Shell>
    <header className="ws-heading"><div><h1>Личный кабинет</h1><p>{account.name} · {account.email}</p></div></header>
    {error && <p className="ws-feedback" role="alert">{error}</p>}
    <section className="ws-panel ws-stack" id="areas">
      <h2>Мои области</h2>
      {areas.error && <p role="alert">{areas.error.message}</p>}
      <div className="ws-list">{areas.data?.areas.map((area)=><div className="ws-row" key={area.id}>
        <a className="ws-list-button" href={"/cabinet/"+area.id}>{area.name}<small>{area.documents} PDF</small></a>
        <DeleteAreaButton area={area} removed={()=>{void areas.mutate();void bookmarks.mutate()}} />
      </div>)}</div>
      <form className="ws-actions" onSubmit={(event)=>void create(event)}>
        <label className="ws-field"><span>Название новой области</span><input required minLength={2} maxLength={100} value={name} onChange={(event)=>setName(event.target.value)} /></label>
        <button className="ws-button ws-primary" type="submit" disabled={busy}>Создать область</button>
      </form>
    </section>
    <section className="ws-panel ws-stack">
      <h2>Сохранённое</h2><p>Публикации и области, к которым вы хотите вернуться.</p>
      {bookmarks.error && <p role="alert">{bookmarks.error.message}</p>}
      {bookmarks.data?.bookmarks.length === 0 && <p>Нажмите «В личный кабинет» у публикации или на странице области.</p>}
      {bookmarks.data?.bookmarks.map((item)=><div className="ws-row" key={item.href}><a className="ws-link" href={item.href}>{item.title}</a>
        <button type="button" className="ws-button" onClick={()=>void remove(item.href)}>Убрать</button></div>)}
    </section>
  </Shell>
}

export function PersonalArea({ area, tab, document, page, initialTag }: {area:Area;tab:string;document?:string;page?:number;initialTag?:string}) {
  const path = "/cabinet/"+area.id
  const endpoint = "/api/workspaces/"+area.id
  const [q,setQ] = useState("")
  const [tag,setTag] = useState("")
  const [error,setError] = useState("")
  const [busy,setBusy] = useState(false)
  const [notice,setNotice] = useState("")
  const [dragging,setDragging]=useState(false)
  const input=useRef<HTMLInputElement>(null)
  const dragDepth=useRef(0)
  const uploadLock=useRef(false)
  const {data,error:loadError,mutate} = useSWR<{publications:Publication[]}>(endpoint,read,{refreshInterval:(value)=>
    value?.publications.some((item)=>["pending","processing"].includes(item.processing_status)) ? 2000 : 0})
  const found = useSWR<{publications:Publication[]}>(tab === "library" && (q || tag) ? endpoint+"?"+new URLSearchParams({q,tag}) : null,read,{refreshInterval:()=>data?.publications.some((item)=>["pending","processing"].includes(item.processing_status))?2000:0})
  const results = useSWR<{findings:Finding[]}>(tab === "catalog" ? endpoint+"?mode=findings" : null,read,{refreshInterval:5000})
  const docs = (q || tag ? found.data : data)?.publications ?? []
  const tags = [...new Set(data?.publications.flatMap((item)=>item.tags) ?? [])]
  const metrics = (results.data?.findings ?? []).filter((item)=>!q || (item.filename+" "+item.metric_name+" "+item.source_fragment).toLowerCase().includes(q.toLowerCase()))
  async function downloadFindings(format:"csv"|"xlsx") {
    const headers=["Файл","Страница","Метрика","k","Значение","Единица","Фрагмент"]
    const rows=metrics.map(row=>[row.filename,row.page_number,row.metric_name,row.metric_k,row.raw_value,row.unit,row.source_fragment])
    if(format==="xlsx")downloadBlobFile(new Blob([await tableWorkbook("Каталог результатов",headers,rows)]),"workspace-results.xlsx")
    else downloadCsvFile(encodeCsv(headers,rows),"workspace-results.csv")
  }
  function pagesLink(id:string,num=1) {
    return path+"?"+new URLSearchParams({tab:"pages",document:id,page:String(num),...(tag?{tag}:{})})
  }
  function discuss(id?:string) {
    window.dispatchEvent(new CustomEvent("kosmostack-assistant",{detail:{workspace:area.id,id}}))
  }
  async function upload(files:File[]) {
    if (!files.length || uploadLock.current) return
    uploadLock.current=true
    setBusy(true);setError("");setNotice("")
    const failures:string[]=[]
    let accepted=0
    try {
      for(const [index,file] of files.entries()) {
        setNotice("Загрузка "+(index+1)+" из "+files.length+" · "+file.name)
        if (!file.name.toLowerCase().endsWith(".pdf") || file.size===0 || file.size>25*1024*1024) {
          failures.push(file.name+": требуется PDF до 25 МБ.")
          continue
        }
        const body=new FormData()
        body.set("workspace",area.id)
        body.set("file",file)
        try {await write("/api/documents",{method:"POST",body});accepted++}
        catch(cause) {failures.push(file.name+": "+(cause as Error).message)}
      }
      await Promise.allSettled([mutate(),found.mutate()])
      if (failures.length) setError(failures.join(" "))
      setNotice(accepted ? "Принято PDF: "+accepted+". Теги появятся после анализа." : "")
    } finally {uploadLock.current=false;setBusy(false)}
  }
  function drop(event:DragEvent<HTMLElement>) {
    event.preventDefault()
    dragDepth.current=0;setDragging(false)
    void upload(Array.from(event.dataTransfer.files))
  }
  return <Shell>
    <header className="ws-heading"><div><h1>{area.name}</h1><p>Личная область · {data?.publications.length ?? area.documents} PDF</p></div>
      <div className="ws-actions"><button className="ws-button" type="button" onClick={()=>discuss()}>Спросить ассистента</button><BookmarkButton href={path} title={area.name} /><DeleteAreaButton area={area} removed={()=>window.location.assign("/cabinet")} /></div></header>
    <nav className="ws-actions" aria-label="Разделы личной области">
      <a className="ws-button" href={path} aria-current={tab==="library"?"page":undefined}>Статьи и теги</a>
      <a className="ws-button" href={path+"?tab=pages"} aria-current={tab==="pages"?"page":undefined}>Страницы публикации</a>
      <a className="ws-button" href={path+"?tab=catalog"} aria-current={tab==="catalog"?"page":undefined}>Каталог результатов</a>
      <a className="ws-button" href={"/?view=passport&workspace="+area.id}>Паспорт данных</a>
    </nav>
    {(loadError || found.error || results.error || error) && <p className="ws-feedback" role="alert">{error || (loadError ?? found.error ?? results.error)?.message}</p>}
    {notice && <p aria-live="polite" className="ws-feedback">{notice}</p>}
    {tab === "library" && <>
      <section className={"ws-panel ws-stack ws-area-dropzone"+(dragging?" is-dragging":"")} aria-label="Добавить PDF"
        aria-busy={busy} onDragEnter={(event)=>{
          if (!event.dataTransfer.types.includes("Files")) return
          event.preventDefault();dragDepth.current++;setDragging(true)
        }} onDragOver={(event)=>{
          if (!event.dataTransfer.types.includes("Files")) return
          event.preventDefault();event.dataTransfer.dropEffect=busy?"none":"copy"
        }} onDragLeave={()=>{dragDepth.current=Math.max(0,dragDepth.current-1);if(!dragDepth.current)setDragging(false)}} onDrop={drop}>
        <h2>Перетащите PDF сюда</h2>
        <p>Можно добавить несколько файлов. До 25 МБ на файл. Теги подбираются автоматически по тексту.</p>
        <input ref={input} className="sr-only" type="file" accept=".pdf,application/pdf" multiple aria-label="Выбрать PDF"
          disabled={busy} onChange={(event)=>{const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";void upload(files)}} />
        <button className="ws-button ws-primary" type="button" disabled={busy} onClick={()=>input.current?.click()}>
          {busy ? "Загружаем…" : "Выбрать PDF"}</button>
      </section>
      <div className="ws-panel ws-stack">
        <label className="ws-field"><span>Поиск по названию, тегам и тексту PDF</span><input type="search" maxLength={150} value={q} onChange={(event)=>setQ(event.target.value)} /></label>
        {tags.length>0 && <div className="ws-actions">{tags.map((item)=><button key={item} className="ws-chip" type="button" aria-pressed={tag===item} onClick={()=>setTag(tag===item?"":item)}>{item}</button>)}</div>}
        {data && !docs.length && <p>Публикации по этому запросу не найдены.</p>}
        {docs.map((item)=><article className="ws-panel ws-stack" key={item.id}>
          <h2>{item.title || item.filename}</h2>
          <p>{item.processing_status === "error" ? item.error_message || "Ошибка обработки" : item.processing_status==="done" ? item.page_count+" стр." : item.processing_status==="pending"?"Ожидает анализа":"Анализируем PDF…"}
            {item.processing_status==="done"&&!item.tags.length ? " · Темы по тексту не определены" : ""}</p>
          {item.tags.length>0&&<div className="ws-actions" aria-label="Теги документа">{item.tags.map((topic)=><button className="ws-chip" key={topic} type="button"
            aria-pressed={tag===topic} onClick={()=>setTag(tag===topic?"":topic)}>{topic}</button>)}</div>}
          <div className="ws-actions"><a className="ws-button" href={pagesLink(item.id)}>Страницы публикации</a>
            <button className="ws-button" type="button" onClick={()=>discuss(item.id)}>Спросить об этом PDF</button>
            <BookmarkButton title={item.title || item.filename} href={pagesLink(item.id)} />
            {item.page_count > 0 && <ExportMenu kind="analysis" params={{id:item.id}} label="Экспорт анализа" />}</div>
        </article>)}
      </div>
    </>}
    {tab === "pages" && <PagesView mode="uploads" workspaceId={area.id} initialTag={initialTag} publicationsUrl={endpoint} records={[]}
      initial={document?{publication:document,page:page??1}:undefined} onEvidence={()=>{}} onCatalog={()=>window.location.assign(path+"?tab=catalog")}
      onUpload={()=>window.location.assign(path)} />}
    {tab === "catalog" && <section className="ws-panel ws-stack">
      <h2>Каталог результатов</h2><p>Числа с распознанной метрикой. Значения требуют сверки с источником.</p>
      <label className="ws-field"><span>Поиск по результатам</span><input type="search" value={q} onChange={(event)=>setQ(event.target.value)} /></label>
      {metrics.length > 0 && <div className="ws-actions">
        <button className="ws-button" type="button" onClick={()=>void downloadFindings("csv")}>Скачать CSV</button>
        <button className="ws-button" type="button" onClick={()=>void downloadFindings("xlsx")}>Скачать XLSX</button>
      </div>}
      {!!results.data && !metrics.length && <p>Подходящих метрик пока нет.</p>}
      {metrics.map((item,index)=><article key={item.document_id+":"+index} className="ws-panel ws-stack">
        <h2>{item.metric_name}{item.metric_k ? "@"+item.metric_k : ""} · {item.raw_value} {item.unit}</h2>
        <p>{item.filename} · стр. {item.page_number}</p><blockquote className="ws-quote">{item.source_fragment}</blockquote>
        <a className="ws-link" href={pagesLink(item.document_id,item.page_number)}>Открыть страницу</a>
      </article>)}
    </section>}
  </Shell>
}
