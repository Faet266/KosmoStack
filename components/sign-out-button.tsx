"use client"

import { useState } from "react"
import { LogOut } from "lucide-react"

export function SignOutButton() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  async function logout() {
    setPending(true)
    setError("")
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" })
      if (!response.ok) throw Error()
      window.location.replace("/login")
    } catch {
      setError("Не удалось завершить сеанс.")
      setPending(false)
    }
  }
  return <div className="ws-logout"><button className="ws-button ws-square" type="button" disabled={pending}
    onClick={() => void logout()} aria-label="Выйти из аккаунта" title="Выйти из аккаунта"><LogOut aria-hidden="true" /></button>
    {error && <small role="alert">{error}</small>}
  </div>
}
