"use client"
import useSWR from "swr"
import { highlightRanges } from "@/lib/tag-highlight.mjs"

export type PdfTagData = {tags:Array<{key:string;label:string;aliases:string[]}>;
  hits:Array<{id:string;title:string;page:number;alias:string;excerpt:string}>}

export function usePdfTags(endpoint:string|null, tag:string) {
  const url=endpoint?endpoint+(endpoint.includes("?")?"&":"?")+"tag="+encodeURIComponent(tag):null
  const {data,error,isLoading}=useSWR<PdfTagData>(url,async(url:string)=>{
    const response=await fetch(url)
    if(!response.ok)throw Error("Не удалось загрузить совпадения по тегу.")
    return response.json()
  },{revalidateOnFocus:false})
  return {data,error,isLoading,topic:data?.tags.find(item=>item.key===tag)}
}
export function PdfTagSearch({tag,setTag,data,error,pending,onHit}:{
  tag:string;setTag:(tag:string)=>void;data?:PdfTagData;error?:Error;pending:boolean;
  onHit:(id:string,page:number)=>void
}) {
  return <section className="ws-panel ws-stack" aria-label="Поиск тегов в PDF">
    <label className="ws-field"><span>Тег на страницах PDF</span>
      <select value={tag} onChange={(event)=>setTag(event.target.value)}>
        <option value="">Выберите тег</option>
        {tag&&!data?.tags.some(item=>item.key===tag)&&<option value={tag}>{tag}</option>}
        {data?.tags.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
      </select></label>
    {error&&<p role="alert">{error.message}</p>}
    {tag&&pending&&<p role="status">Ищем страницы…</p>}
    {tag&&data&&(!data.hits.length?<p>В доступных PDF совпадения не найдены.</p>:
      <label className="ws-field"><span>Совпадения · {data.hits.length} страниц</span>
        <select value="" onChange={(event)=>{
          const item=data.hits[Number(event.target.value)]
          if(event.target.value&&item)onHit(item.id,item.page)
        }}>
          <option value="">Перейти к другому совпадению</option>
          {data.hits.map((item,index)=><option key={item.id+"/"+item.page} value={index}>{item.title} · стр. {item.page} · {item.alias}</option>)}
        </select></label>)}
  </section>
}

export function PdfTagExcerpt({text,aliases}:{text:string;aliases:string[]}) {
  const chunks=[]
  let position=0
  for(const [start,end] of highlightRanges(text,aliases)){
    chunks.push(text.slice(position,start),<mark className="ws-tag-mark" key={start}>{text.slice(start,end)}</mark>)
    position=end
  }
  chunks.push(text.slice(position))
  return <>{chunks}</>
}

