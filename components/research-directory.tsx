"use client"
import { ThemeButton, useWorkspaceTheme } from "@/components/workspace-theme"
import { OwnedAreaChoices } from "@/components/personal-workspace"

export function ResearchDirectory({children}: {children:React.ReactNode}) {
  const { light } = useWorkspaceTheme()
  return <main className={"app-shell evidence-workspace ws-library "+(light?"theme-light":"theme-dark")}>
    <div className="ws-library-inner ws-page">
      <div className="ws-row"><a className="ws-button" href="/">На главную</a><ThemeButton /></div>
      <header className="ws-heading"><h1>Поиск по статьям и тегам</h1></header>
      <div className="ws-area-grid">{children}</div><OwnedAreaChoices view="library" />
    </div>
  </main>
}
