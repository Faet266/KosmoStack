"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Moon, Sun } from "lucide-react"

const ThemeContext = createContext({ light: false, toggle: () => {} })

export function WorkspaceTheme({ children }: { children: ReactNode }) {
  const [light, setLight] = useState(false)
  useEffect(() => {
    try {
      setLight(localStorage.getItem("kosmostack-theme") === "light")
    } catch {}
  }, [])
  useEffect(() => { document.documentElement.dataset.workspaceTheme = light ? "light" : "dark" }, [light])
  function toggle() {
    const next = !light
    setLight(next)
    try { localStorage.setItem("kosmostack-theme", next ? "light" : "dark") } catch {}
  }
  return <ThemeContext.Provider value={{ light, toggle }}>{children}</ThemeContext.Provider>
}

export function useWorkspaceTheme() { return useContext(ThemeContext) }

export function ThemeButton() {
  const { light, toggle } = useWorkspaceTheme()
  const label = light ? "Включить тёмную тему" : "Включить светлую тему"
  return <button className="ws-button ws-square theme-toggle" type="button" onClick={toggle} aria-label={label} title={label}>
    {light ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
  </button>
}
