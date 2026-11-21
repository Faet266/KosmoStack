"use client"
import useSWR from "swr"
import type { ragControlCheck } from "@/lib/rag-control"

export function RagControlCheck() {
  const {data,error}=useSWR<ReturnType<typeof ragControlCheck>>("/api/rag/control",async(url:string)=>{
    const response=await fetch(url)
    if (!response.ok) throw Error("Контрольная сверка недоступна.")
    return response.json()
  })
  return <section className="ws-panel ws-stack">
    <h2>Контрольная сверка по PDF</h2>
    {error && <p role="alert">{error.message}</p>}
    {data && <><p>Подтверждено {data.matched} из {data.total} значений. {data.scope}</p>
      <a className="ws-link" href="/?view=compare&area=rag">Открыть контрольные примеры сравнения</a>
      <details className="ws-details"><summary>Записи и оригиналы страниц</summary><ul>{data.rows.map((row)=>
        <li key={row.key}><a className="ws-link" href={row.pdf}>{row.key} · стр. {row.page}</a> · {row.metric} · {row.value} {row.unit} · {row.outcome==="verified"?"совпало":"требует разбора"}</li>)}</ul></details></>}
  </section>
}
