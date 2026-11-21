"use client"

import { Bookmark } from "lucide-react"
import { useState } from "react"
import { useSWRConfig } from "swr"

export function BookmarkButton({ href, title }: { href:string; title:string }) {
  const { mutate } = useSWRConfig()
  const [status,setStatus] = useState<"idle" | "pending" | "done" | "error">("idle")
  async function save() {
    setStatus("pending")
    const response = await fetch("/api/bookmarks", { method:"POST", headers:{"Content-Type":"application/json"},body:JSON.stringify({href,title}) }).catch(() => null)
    setStatus(response?.ok ? "done" : "error")
    if (response?.ok) void mutate("/api/bookmarks")
  }
  return <button type="button" className="ws-button" onClick={() => void save()} disabled={status === "pending" || status === "done"}>
    <Bookmark aria-hidden="true" />{status === "done" ? "В кабинете" : status === "pending" ? "Сохраняем…" : status === "error" ? "Повторить сохранение" : "В личный кабинет"}
  </button>
}
