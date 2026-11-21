"use client"

import { useState } from "react"
import useSWR from "swr"
import { ExportMenu } from "@/components/export-menu"
import { areas } from "@/lib/research"
import type { OfficialExport } from "@/lib/official-export-data"

async function load<T>(url:string):Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw Error("Паспорт этой области пока недоступен.")
  return response.json()
}

export function AreaPassportView({initial}: {initial?:string}) {
  const [query,setQuery] = useState("")
  const [scope,setScope] = useState(initial ?? "all")
  const {data,error} = useSWR<OfficialExport>("/api/passports?"+new URLSearchParams({area:scope}),load)
  const personal = useSWR<{areas:{id:string;name:string}[]}>("/api/workspaces",load)
  const needle=query.trim().toLowerCase()
  const sections=data?.sections.flatMap((section)=>{
    if (!needle || section.title.toLowerCase().includes(needle)) return [section]
    const table=section.table
    const rows=table?.rows.filter((row)=>row.some((cell)=>String(cell??"").toLowerCase().includes(needle)))
    return table && rows?.length ? [{...section,table:{...table,rows}}] : []
  }) ?? []
  return <div className="page-content ws-page">
    <header className="ws-heading"><h1>Паспорт данных</h1></header>
    <section className="ws-panel ws-row">
      <label className="ws-field"><span>Исследовательская область</span><select value={scope} onChange={(event)=>setScope(event.target.value)}>
        <option value="all">Все области вместе</option>
        {Object.entries(areas).map(([key,item])=><option key={key} value={key}>{item.label}</option>)}
        {personal.data?.areas.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label className="ws-field"><span>Найти поле</span><input type="search" value={query} onChange={(event)=>setQuery(event.target.value)} /></label>
      {data && <ExportMenu kind="passport" params={{area:scope}} label="Скачать паспорт" />}
    </section>
    {error && <p role="alert" className="ws-feedback">{error.message}</p>}
    {data && !sections.length && <p>Поля по запросу не найдены.</p>}
    {sections.map((section)=><details className="ws-panel ws-details" key={section.title} open={sections.length <= 3 || !!needle}>
      <summary>{section.title}</summary>
      {section.paragraphs?.map((text)=><p key={text}>{text}</p>)}
      {section.table && <div className="table-scroll"><table className="ws-table"><thead><tr>
        {section.table.headers.map((header)=><th key={header} scope="col">{header}</th>)}
      </tr></thead><tbody>{section.table.rows.map((row,index)=><tr key={index}>{row.map((cell,col)=><td key={col}>{cell ?? "—"}</td>)}</tr>)}</tbody></table></div>}
    </details>)}
  </div>
}
