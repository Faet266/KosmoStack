"use client"

import { useRef, useState } from "react"
import { ArrowDownToLine, ChevronDown } from "lucide-react"
import { downloadBlobFile } from "@/lib/csv"
import type { ExportFormat } from "@/lib/official-export-data"

const formats = ["xlsx", "csv", "docx", "odt", "pdf"] as const
type Kind = "analysis" | "assistant" | "metrics" | "passport" | "processing" | "comparison"
const filenames: Record<Kind, string> = {
  analysis: "pdf-analysis", assistant: "assistant-answer", metrics: "rag-quality",
  passport: "rag-passport", processing: "pdf-processing", comparison: "metric-comparison",
}

export function ExportMenu({ kind, params, body, label = "Скачать", compact = false, inline = false }: {
  kind: Kind; params?: Record<string, string>; body?: object; label?: string; compact?: boolean; inline?: boolean
}) {
  const menu = useRef<HTMLDetailsElement>(null)
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [error, setError] = useState("")
  async function save(format: ExportFormat) {
    setError("")
    setBusy(format)
    if (menu.current) menu.current.open = false
    try {
      const query = new URLSearchParams({ ...params, format })
      const response = await fetch(`/api/exports/${kind}?${query}`, body ? {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      } : undefined)
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? "Не удалось скачать документ.")
      }
      downloadBlobFile(await response.blob(), `${filenames[kind]}.${format}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось скачать документ.")
    } finally {
      setBusy(null)
    }
  }
  const buttons = formats.map((format) => <button key={format} className="ws-button" type="button" disabled={busy !== null} title={format==="xlsx"?"Таблица с оформлением и фильтрами":format==="csv"?"Данные для импорта и анализа":undefined}
    onClick={() => void save(format)}>{busy === format ? "Готовим " + format.toUpperCase() + "…" : format.toUpperCase()}</button>)
  if (inline) return <div className="ws-stack ws-inline-export">
    <span>{label}</span>
    <div className="ws-actions" role="group" aria-label={label}>{buttons}</div>
    {error && <small className="ws-text-warn" role="alert">{error}</small>}
  </div>
  return <div className={`ws-export ${compact ? "ws-export-compact" : ""}`}>
    <details ref={menu}>
      <summary className="ws-button" aria-label={label}>
        <ArrowDownToLine aria-hidden="true" />{busy ? `Готовим ${busy.toUpperCase()}…` : label}<ChevronDown aria-hidden="true" />
      </summary>
      <div className="ws-export-options" aria-label="Формат выгрузки">
        {buttons}
      </div>
    </details>
    {error && <small className="ws-text-warn" role="alert">{error}</small>}
  </div>
}
