import { getLocalDocumentPaths } from "@/lib/local-documents"
import { queryRows } from "@/lib/db"
import { getPublication } from "@/lib/db-analysis"
import { researchPageImage } from "@/lib/research-page-image"

export async function GET(request:Request,{params}: {params:Promise<{id:string}>}) {
  const {id}=await params
  const page=Number(new URL(request.url).searchParams.get("page"))
  const path=getLocalDocumentPaths(id)
  if(!path||!Number.isInteger(page)||page<1)return new Response(null,{status:404})
  const item=await getPublication(id)
  if(!item?.sha256||page>item.page_count)return new Response(null,{status:404})
  const [source] = new URL(request.url).searchParams.has("highlight") ? await queryRows<{extraction_method:string}>(
    "SELECT extraction_method FROM pages WHERE publication_id=$1 AND page_number=$2",[id,page]) : []
  return researchPageImage(request,path.pdfPath,item.sha256,page,undefined,source?.extraction_method==="ocr")
}
