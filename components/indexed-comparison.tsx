"use client"

import { ComparisonRecordSelect } from "@/components/comparison-record-select"
import { useState } from "react"
import useSWR from "swr"
import { areaWorkspace, areas } from "@/lib/research"
import type { IndexedArea, IndexedFinding } from "@/lib/research-evidence"

export function IndexedComparison({area}: {area:IndexedArea}) {
  const {data,error} = useSWR<{findings:IndexedFinding[]}>("/api/research/"+area+"/evidence?mode=findings",async(url:string)=>{
    const response=await fetch(url)
    if (!response.ok) throw Error("Не удалось получить записи области.")
    return response.json()
  })
  const [left,setLeft] = useState("")
  const [right,setRight] = useState("")
  const [submitted,compare] = useState(false)
  const rows = data?.findings ?? []
  const selected = left && right && left!==right && submitted ? [rows[Number(left)],rows[Number(right)]] : null
  const diff = selected?.[0]?.metric && selected[1]?.metric && selected[0].metric !== selected[1].metric
  return <div className="page-content ws-page ws-comparison">
    <header className="ws-heading ws-comparison-heading"><div><h1>Сравнение результатов</h1><p>{areas[area].label}</p></div></header>
    {error && <p role="alert" className="ws-feedback">{error.message}</p>}
    <form className="ws-panel ws-stack ws-comparison-form" onSubmit={(event)=>{event.preventDefault();compare(true)}}>
      <div className="ws-grid ws-two">{([["A",left,setLeft,right],["B",right,setRight,left]] as const).map(([label,value,set,other])=>
        <ComparisonRecordSelect key={label} slot={label} label={"Запись "+label} placeholder="Выберите запись"
          selected={value} onSelect={(id)=>{set(id);compare(false)}} choices={rows.flatMap((row,index)=>String(index)===other?[]:[{
            id:String(index), title:row.metric ?? row.title, value:row.value, context:row.metric ? row.title : undefined,
            reference:row.page ? "Стр. "+row.page : row.kind==="reported" ? "Результат из аннотации" : "Аннотация",
          }])} />)}</div>
      <button type="submit" className="ws-button ws-primary" disabled={!left||!right||left===right}>Сопоставить источники</button>
    </form>
    {selected && <>
      <section className="ws-panel ws-stack">
        <h2>{diff ? "Записи несопоставимы" : "Недостаточно данных для расчёта разницы"}</h2>
        <p>{diff ? "У A и B разные показатели." : area === "solar" ?
          "По этим кандидатам не подтверждены общий тип прибора, площадь, условия измерения, агрегация и направление развёртки." :
          "В аннотациях не подтверждены единая числовая метрика, шкала и протокол измерения."}</p>
      </section>
      <div className="ws-grid ws-two">{selected.map((row,index)=>row&&<article key={index} className="ws-panel ws-stack ws-comparison-result" data-slot={index ? "B" : "A"}>
        <span className="ws-chip">Запись {index ? "B" : "A"}</span>
        <h2>{row.metric ?? row.title}</h2>
        {row.metric && row.value && <strong className="ws-big-value">{row.value}</strong>}
        {row.metric && <p>{row.title}</p>}
        <blockquote className="ws-quote">{row.excerpt}</blockquote>
        <div className="ws-actions"><a className="ws-button" href={areaWorkspace(area,"pages",row.article,row.page??undefined)}>Страница публикации</a>
          <a className="ws-link" href={row.url}>Первоисточник</a></div>
      </article>)}</div>
    </>}
  </div>
}
