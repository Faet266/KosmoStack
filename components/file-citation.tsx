"use client"

import { useState } from "react"
import { ArrowUpRight, Copy, Download } from "lucide-react"
import { citationAuthors, citationIdentifiers, cleanCitationText, formatCitationDate, makeBibtex, makeCitation, type Area, type CitationItem } from "@/lib/research"
import { downloadBlobFile } from "@/lib/csv"

const origin = () => typeof window === "undefined" ? "http://127.0.0.1:3000" : window.location.origin

function CopyText({ text, label }: {text:string;label:string}) {
  const [status,setStatus]=useState("")
  async function copy() {
    try { await navigator.clipboard.writeText(text);setStatus("Скопировано") }
    catch { setStatus("Выделите текст вручную") }
  }
  return <span className="ws-actions"><button className="ws-button" type="button" onClick={()=>void copy()} disabled={!text}>
    <Copy aria-hidden="true" />{label}</button>{status&&<small role="status">{status}</small>}</span>
}

export function CitationDetails({article,area}: {article:CitationItem;area?:Area}) {
  const authors=citationAuthors(article)
  const ids=citationIdentifiers(article)
  const date=formatCitationDate(article.citation?.date || String(article.year??""))
  const cite=makeCitation(article,origin())
  return <div className="ws-stack">
    {authors.length>0 && <ol className="ws-citation-authors">{authors.map((person,index)=>
      <li key={person.name+index}><strong>{person.family && person.given ? person.family+" "+person.given : person.name}</strong>
        {person.initials&&<span> · {person.initials}</span>}
        {!!person.organizations.length&&<small> · {person.organizations.join("; ")}</small>}
        {person.orcid&&<small> · ORCID {person.orcid}</small>}</li>)}</ol>}
    <dl className="ws-key-values">
      <div><dt>Организации</dt><dd>{article.citation?.organizations?.join("; ") || "В источнике не указаны"}</dd></div>
      <div><dt>Журнал / издатель</dt><dd>{[article.citation?.publication,article.citation?.publisher].filter(Boolean).join(" · ")||article.provider}</dd></div>
      <div><dt>Дата публикации</dt><dd>{date || "В источнике не указана"}</dd></div>
      <div><dt>Том / выпуск</dt><dd>{[article.citation?.volume,article.citation?.issue].filter(Boolean).join(" / ")||"—"}</dd></div>
      <div><dt>Идентификаторы</dt><dd>{ids.map(({label,value})=>label+" "+value).join("; ")||"—"}</dd></div>
    </dl>
    <p className="ws-citation" suppressHydrationWarning>{cite}</p>
    <div className="ws-actions"><CopyText text={cite} label="Скопировать библиографию" />
      {area && <button className="ws-button" type="button" onClick={()=>downloadBlobFile(
        new Blob([makeBibtex(article,origin(),area)],{type:"application/x-bibtex;charset=utf-8"}),
        area+"-"+article.id.replace(/[^a-z0-9]/giu,"_")+".bib") }><Download aria-hidden="true" /> BibTeX</button>}
    </div>
  </div>
}

export function FileCitation({article,area,page,text,pdf,pending}: {
  article:CitationItem;area?:Area;page:number;text:string;pdf:string;pending?:boolean
}) {
  const [selection,setSelection]=useState("")
  const quote=cleanCitationText(selection)
  const formatted=quote ? "«"+quote+"» — "+makeCitation(article,origin(),page)+" · "+new URL(pdf,origin()).href : ""
  return <section className="ws-stack" id="file-citation">
    <h3>Цитата из PDF · страница {page}</h3>
    {pending ? <p role="status">Загружаем текст страницы…</p> : text ?
      <><label className="ws-field"><span>Выделите нужный фрагмент на этой странице</span>
        <textarea className="ws-citation-source" readOnly value={text} rows={9}
          onSelect={(event)=>setSelection(event.currentTarget.value.slice(event.currentTarget.selectionStart,event.currentTarget.selectionEnd))} /></label>
        {quote&&<blockquote className="ws-quote">{formatted}</blockquote>}
        <div className="ws-actions"><CopyText text={formatted} label="Скопировать цитату" />
          <a className="ws-button" href={pdf} target="_blank" rel="noreferrer">Открыть страницу PDF <ArrowUpRight aria-hidden="true" /></a></div></> :
      <p>На этой странице нет извлечённого текста. Проверьте оригинал PDF.</p>}
    <details className="ws-details"><summary>Полные сведения о публикации</summary><CitationDetails article={article} area={area} /></details>
  </section>
}
