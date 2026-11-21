import { documentTopics, topicMatch } from "@/lib/document-topics"
import { randomUUID } from "node:crypto"
import { queryRows, transaction } from "@/lib/db"

export const workspaceId = (id: string) => /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(id)
export const privateDocument = (id: string) => id.startsWith("private-")
export function ownedAreas(owner: string) {
  return queryRows<{ id: string; name: string; documents: number }>(`
    SELECT a.id,a.name,count(d.document_id)::int documents FROM workspace_areas a
    LEFT JOIN workspace_documents d ON d.area_id=a.id WHERE a.owner=$1 GROUP BY a.id ORDER BY a.created_at DESC`, [owner])
}
export async function ownedArea(owner: string, id: string) {
  if (!workspaceId(id)) return undefined
  return (await ownedAreas(owner)).find((area) => area.id === id)
}
export async function createArea(owner: string, name: string) {
  const [area] = await queryRows<{ id: string; name: string }>(`
    INSERT INTO workspace_areas(id,owner,name) VALUES($1,$2,$3) ON CONFLICT(owner,name) DO NOTHING RETURNING id,name`,
    [randomUUID(),owner,name])
  return area
}
export function workspaceDocuments(owner: string, area: string, text = "", tag = "") {
  return queryRows<{
    id:string; filename:string; title:string|null; sha256:string|null; corpus_id:null; page_count:number; processing_status:string; error_message:string|null; tags:string[]
  }>(`
    SELECT p.id,p.filename,p.title,p.sha256,p.corpus_id,p.page_count,p.processing_status,p.error_message,
      ARRAY(SELECT DISTINCT tag FROM unnest(d.tags || COALESCE(p.automatic_tags,'{}')) tag ORDER BY tag) tags
    FROM workspace_documents d JOIN workspace_areas a ON a.id=d.area_id JOIN publications p ON p.id=d.document_id
    WHERE a.owner=$1 AND a.id=$2 AND ($4='' OR $4=ANY(d.tags || COALESCE(p.automatic_tags,'{}')))
      AND ($3='' OR strpos(lower(concat_ws(' ',p.filename,p.title,array_to_string(d.tags || COALESCE(p.automatic_tags,'{}'),' '))),lower($3))>0
        OR EXISTS (SELECT 1 FROM pages f WHERE f.publication_id=p.id AND strpos(lower(f.text_content),lower($3))>0))
    ORDER BY p.updated_at DESC`,[owner,area,text,tag])
}
export function workspaceFindings(owner: string, area: string, id = "") {
  return queryRows<{ document_id:string; filename:string; page_number:number; metric_name:string; metric_k:number|null; raw_value:string; unit:string|null; source_fragment:string }>(`
    SELECT p.id document_id,p.filename,n.page_number,n.metric_name,n.metric_k,n.raw_value,n.unit,n.source_fragment
    FROM workspace_documents d JOIN workspace_areas a ON a.id=d.area_id
    JOIN publications p ON p.id=d.document_id JOIN numeric_candidates n ON n.publication_id=p.id
    WHERE a.owner=$1 AND a.id=$2 AND n.is_classified=1 AND ($3='' OR p.id=$3)
    ORDER BY p.filename,n.page_number,n.id LIMIT 1000`, [owner,area,id])
}
export function linkWorkspaceDocument(area: string, document: string, tags: string[]) {
  return queryRows(`INSERT INTO workspace_documents(area_id,document_id,tags) VALUES($1,$2,$3)
    ON CONFLICT(area_id,document_id) DO UPDATE SET tags=(SELECT ARRAY(SELECT DISTINCT unnest(workspace_documents.tags || excluded.tags) ORDER BY 1))`,[area,document,tags])
}
export async function canReadDocument(owner: string, id: string) {
  return !privateDocument(id) || (await queryRows(`
    SELECT 1 FROM workspace_documents d JOIN workspace_areas a ON a.id=d.area_id WHERE a.owner=$1 AND d.document_id=$2 LIMIT 1`,[owner,id])).length === 1
}
export function bookmarks(owner: string) {
  return queryRows<{ href:string; title:string }>("SELECT href,title FROM workspace_bookmarks WHERE owner=$1 ORDER BY created_at DESC",[owner])
}
export function saveBookmark(owner: string, href: string, title: string) {
  return queryRows("INSERT INTO workspace_bookmarks(owner,href,title) VALUES($1,$2,$3) ON CONFLICT(owner,href) DO UPDATE SET title=excluded.title",[owner,href,title])
}
export function removeBookmark(owner: string, href: string) {
  return queryRows("DELETE FROM workspace_bookmarks WHERE owner=$1 AND href=$2",[owner,href])
}


export async function deleteArea(owner:string,id:string) {
  if (!workspaceId(id)) return false
  return transaction(async(db)=>{
    const removed=await db.query("DELETE FROM workspace_areas WHERE owner=$1 AND id=$2",[owner,id])
    if (!removed.rowCount) return false
    const path="/cabinet/"+id
    await db.query("DELETE FROM workspace_bookmarks WHERE owner=$1 AND (href=$2 OR starts_with(href,$2||'?'))",[owner,path])
    return true
  })
}


export async function ensureWorkspaceTopics(owner:string, area:string) {
  const pending = await queryRows<{id:string;filename:string;title:string|null;pages:string[];metrics:string[]}>(`
    SELECT p.id,p.filename,p.title,
      ARRAY(SELECT LEFT(f.text_content,2400) FROM pages f WHERE f.publication_id=p.id ORDER BY f.page_number) pages,
      ARRAY(SELECT DISTINCT n.metric_name FROM numeric_candidates n WHERE n.publication_id=p.id AND n.metric_name IS NOT NULL LIMIT 8) metrics
    FROM workspace_documents d JOIN workspace_areas a ON a.id=d.area_id JOIN publications p ON p.id=d.document_id
    WHERE a.owner=$1 AND a.id=$2 AND p.processing_status='done' AND p.automatic_tags IS NULL LIMIT 15`,[owner,area])
  for (const item of pending) {
    const topics = documentTopics(item)
    await queryRows("UPDATE publications SET automatic_tags=$2 WHERE id=$1 AND automatic_tags IS NULL AND processing_status='done'",[item.id,topics])
  }
}

export async function workspaceTagPages(owner:string, area:string, tag:string) {
  const documents=await workspaceDocuments(owner,area)
  const tags=[...new Set(documents.flatMap(item=>item.tags))].sort((a,b)=>a.localeCompare(b,"ru"))
    .map(label=>({key:label,label,aliases:[] as string[]}))
  const topic=tags.find(item=>item.key===tag)
  const hits:Array<{id:string;title:string;page:number;alias:string;excerpt:string}>=[]
  if(!topic)return {tags,hits}
  const matching=documents.filter(item=>item.tags.includes(tag))
  const byId=new Map(matching.map(item=>[item.id,item]))
  const pages=await queryRows<{publication_id:string;page_number:number;text_content:string}>(
    "SELECT publication_id,page_number,text_content FROM pages WHERE publication_id=ANY($1) AND text_content IS NOT NULL ORDER BY publication_id,page_number",
    [matching.map(item=>item.id)])
  const aliases=new Set<string>()
  for(const row of pages){
    const match=topicMatch(row.text_content,tag)
    const article=byId.get(row.publication_id)
    if(!match||!article)continue
    const alias=match.alias.replace(/\s+/gu," ")
    aliases.add(alias.toLowerCase())
    if(hits.length<300)hits.push({id:article.id,title:article.title??article.filename,page:row.page_number,alias,
      excerpt:row.text_content.slice(Math.max(0,match.start-80),match.start+match.alias.length+80)})
  }
  topic.aliases=[...aliases].slice(0,25)
  return {tags,hits}
}
