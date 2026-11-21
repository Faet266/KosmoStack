import { cookies } from "next/headers"
import { sessionCookie } from "@/lib/auth-paths"
import { authAccount } from "@/lib/auth-store"

export async function currentAccount() {
  return authAccount((await cookies()).get(sessionCookie)?.value)
}
