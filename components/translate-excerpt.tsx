"use client"

import { useState } from "react"
import { Languages } from "lucide-react"

export function TranslateExcerpt({ text, label = "Перевести цитату" }: { text: string; label?: string }) {
  const [translation, setTranslation] = useState("")
  const [translatedText, setTranslatedText] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [language, setLanguage] = useState("ru")
  async function translate() {
    setPending(true)
    setError("")
    setTranslation("")
    try {
      const response = await fetch("/api/assistant/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 1400), language }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setTranslatedText(text)
      setTranslation(data.translation)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось получить перевод.")
    } finally {
      setPending(false)
    }
  }
  return <div className="ws-stack ws-translation">
    <div className="ws-actions">
      <button type="button" className="ws-button" onClick={() => void translate()} disabled={pending}><Languages aria-hidden="true" />
        {pending ? "Переводим…" : label}</button>
      <select aria-label="Язык перевода" value={language} disabled={pending} onChange={(event) => { setLanguage(event.target.value); setTranslation(""); setError("") }}>
        <option value="ru">Русский</option><option value="en">English</option>
      </select>
    </div>
    {error && <p role="alert">{error}</p>}
    {translation && translatedText === text && <div className="ws-quote"><small>Машинный перевод</small><p>{translation}</p></div>}
  </div>
}
