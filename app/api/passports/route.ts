import { currentAccount } from "@/lib/current-account"
import { areaPassport } from "@/lib/area-passport"

export async function GET(request:Request) {
  const user = await currentAccount()
  if (!user) return new Response(null,{status:401})
  try {
    const report = await areaPassport(new URL(request.url).searchParams.get("area") ?? "all",user.id)
    return report ? Response.json(report,{headers:{"Cache-Control":"no-store"}}) : new Response(null,{status:404})
  } catch {
    return Response.json({error:"Паспорт этой области пока недоступен."},{status:404})
  }
}
