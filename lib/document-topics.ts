import { highlightRanges } from "@/lib/tag-highlight.mjs"

const known: Array<[string, RegExp]> = [
  ["Агровольтаика", /\bagrivoltaics?\b|агровольтаик\p{L}*/giu],
  ["Солнечная энергетика", /\b(?:solar (?:energy|power|panels?)|photovoltaics?)\b|фотовольтаик\p{L}*|солнечн\p{L}+\s+(?:энерги|панел|элемент)\p{L}*/giu],
  ["Урожайность", /\b(?:crop yields?|agricultural yield|harvest yields?)\b|урожайност\p{L}*/giu],
  ["Орошение", /\b(?:irrigation|water savings|water consumption|drip irrigation)\b|орошени\p{L}*|водопотреблен\p{L}*/giu],
  ["Микроклимат", /\b(?:microclimate|soil moisture|soil temperature)\b|микроклимат\p{L}*|влажност\p{L}+\s+почв\p{L}*/giu],
  ["Опылители", /\b(?:pollinators?|pollination)\b|опылител\p{L}*/giu],
  ["Перовскиты", /\bperovskites?\b|перовскит\p{L}*/giu],
  ["Солнечные мини-сети", /\b(?:mini[- ]?grids?|microgrids?)\b|мини-сет\p{L}*/giu],
  ["Поиск по документам", /\b(?:retrieval[- ]augmented generation|reranking|document retrieval)\b|поиск\s+по\s+документ\p{L}*/giu],
  ["Экзопланеты", /\bexoplanets?\b|экзопланет\p{L}*/giu],
  ["Дистанционное зондирование", /\b(?:remote sensing|earth observation)\b|дистанционн\p{L}+\s+зондирован\p{L}*/giu],
  ["Климат", /\b(?:climate change|climate models?|climate adaptation)\b|изменени\p{L}+\s+климат\p{L}*/giu],
]
const stop = /^(?:research|study|studies|report|results?|data|method|analysis|model|using|based|approach|results|project|design|science|under|of|the|with|this|those|that|where|there|their|which|through|having|into|from|demonstrate|national|laboratory|systems?|technical|review|figure|table|references|energy|available|can|will|may|was|were|has|have|pdf|исследован\p{L}*|результат\p{L}*|анализ\p{L}*|метод\p{L}*|работа|данн\p{L}*|проект\p{L}*|система|может|будет|котор\p{L}*|своих|для|или|при|что|как|это|эти)$/iu
const normalize = (text:string) => text.normalize("NFKC").replace(/\s+/gu," ").trim()
const occurrences = (text:string, expression:RegExp) => [...text.matchAll(expression)].length

export function documentTopics(input:{title?:string|null;filename:string;pages:string[];metrics?:string[]}) {
  const title = normalize((input.title||"")+" "+input.filename.replace(/\.pdf$/iu,"").replace(/[_-]+/gu," "))
  // Sample each page to preserve subject changes in a long report while bounding the work.
  const body = normalize(input.pages.map((page)=>page.slice(0,2400)).join(" "))
  if (!/\p{L}{3}/u.test(body)) return []
  const ranked = known.flatMap(([name,pattern])=>{
    const count = occurrences(body,pattern)
    const inTitle = occurrences(title,pattern)
    return count>=2 || count>0 && inTitle ? [{name,weight:Math.min(count,15)+inTitle*8}] : []
  })
  const tags = ranked.sort((a,b)=>b.weight-a.weight).slice(0,6).map(({name})=>name)
  if (tags.length>=4) return tags
  const frequencies = new Map<string,number>()
  const titleTerms = new Set((title.toLowerCase().match(/\p{L}{4,}(?:-\p{L}{3,})?/gu)??[]).filter((word)=>!stop.test(word)))
  for (const word of body.matchAll(/\p{L}{4,}(?:-\p{L}{3,})?/gu)) {
    const token=word[0].toLowerCase()
    if (token.length>27 || stop.test(token)) continue
    frequencies.set(token,(frequencies.get(token)??0)+1)
  }
  const stems = new Set(tags.map((tag)=>tag.toLowerCase().slice(0,7)))
  const fallback = [...frequencies.entries()].filter(([token,count])=>count>=3&&titleTerms.has(token)||count>=5)
    .sort(([a,aCount],[b,bCount]) => (Math.min(bCount,20)+Number(titleTerms.has(b))*10)-(Math.min(aCount,20)+Number(titleTerms.has(a))*10))
  for (const [word] of fallback) {
    const stem=word.slice(0,7)
    if (stems.has(stem) || word.startsWith("agrivolta") && tags.includes("Агровольтаика")) continue
    stems.add(stem)
    tags.push(word)
    if (tags.length>=4) break
  }
  for (const metric of new Set(input.metrics??[])) {
    const cleaned=normalize(metric).slice(0,42)
    if (cleaned && !tags.includes(cleaned) && tags.length<4) tags.push(cleaned)
  }
  return tags
}

export function topicMatch(text:string,tag:string) {
  const pattern=known.find(([name])=>name===tag)?.[1]
  if(pattern){
    const match=text.matchAll(new RegExp(pattern.source.replaceAll(" ","\\s+"),pattern.flags)).next().value
    if(match)return {alias:match[0],start:match.index}
  }
  const range=highlightRanges(text,[tag])[0]
  if(range)return {alias:text.slice(range[0],range[1]),start:range[0]}
}
