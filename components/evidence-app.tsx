"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { BarChart3, BookOpen, CheckCircle2, ChevronRight, ClipboardCheck, FileText, GitCompareArrows, History, Menu, Search, Table2, X } from "lucide-react"
import { SignOutButton } from "@/components/sign-out-button"
import { OwnedAreaChoices } from "@/components/personal-workspace"
import { IndexedComparison } from "@/components/indexed-comparison"
import { IndexedCatalog, IndexedPages } from "@/components/indexed-research-view"
import { areaWorkspace, areas, type Area } from "@/lib/research"
import { CatalogView } from "@/components/catalog-view"
import { ThemeButton, useWorkspaceTheme } from "@/components/workspace-theme"
import { ResearchAreas } from "@/components/research-areas"
import { PagesView, type PageSelection } from "@/components/pages-view"
import { ComparisonView } from "@/components/comparison-view"
import { ReviewQueue } from "@/components/review-queue"
import { AreaPassportView } from "@/components/area-passport-view"
import { ReportsView, RunsView } from "@/components/analysis-views"
import { EvidencePreview } from "@/components/evidence-preview"
import { tableWorkbook } from "@/lib/spreadsheet-export"
import { downloadBlobFile, downloadCsvFile } from "@/lib/csv"
import { exportResultsCsv, type ParticipantData, type ResultRecord } from "@/lib/result-data"

type PageKey = "home" | "catalog" | "pages" | "compare" | "review" | "runs" | "passport" | "reports"
const navItems = [
  { id: "catalog" as const, label: "Каталог результатов", icon: BookOpen, group: "ДАННЫЕ" },
  { id: "pages" as const, label: "Страницы публикации", icon: FileText, group: "ДАННЫЕ" },
  { id: "compare" as const, label: "Сравнение", icon: GitCompareArrows, group: "АНАЛИЗ" },
  { id: "review" as const, label: "Очередь проверки", icon: ClipboardCheck, group: "АНАЛИЗ" },
  { id: "runs" as const, label: "Загрузка и анализ PDF", icon: History, group: "АНАЛИЗ" },
  { id: "passport" as const, label: "Паспорт данных", icon: Table2, group: "ПРОЕКТ" },
  { id: "reports" as const, label: "Проверки и метрики", icon: BarChart3, group: "ПРОЕКТ" },
]

const pageTitles: Record<PageKey, { breadcrumb: string }> = {
  home: { breadcrumb: "Проект / Главная" },
  catalog: { breadcrumb: "Данные / Каталог" },
  pages: { breadcrumb: "Данные / Страницы" },
  compare: { breadcrumb: "Анализ / Сравнение" },
  review: { breadcrumb: "Анализ / Очередь проверки" },
  runs: { breadcrumb: "Анализ / Прогоны" },
  passport: { breadcrumb: "Проект / Паспорт данных" },
  reports: { breadcrumb: "Проект / Отчёты" },
}

export default function EvidenceApp({ area, rag, ragUnavailable, initial, initialQuery, uploads, article, articlePage, passportScope, initialReview, initialCitation, initialTag }: {
  ragUnavailable?: boolean; area?: Area; rag?: Pick<ParticipantData, "records" | "metadata" | "resultColumns">
  initial?: string; initialQuery?: string; uploads: boolean; article?: string; articlePage?: number; passportScope?: string; initialReview?: string; initialCitation?: boolean; initialTag?:string
}) {
  const { records = [], metadata, resultColumns = [] } = rag ?? {}
  const [activePage, setActivePage] = useState<PageKey>(navItems.find((item) => item.id === initial)?.id ?? "home")
  const [search, setSearch] = useState(initialQuery ?? "")
  const [sourcePage, setSourcePage] = useState<PageSelection>()
  const [reviewTask, setReviewTask] = useState<string | undefined>(initialReview)
  const [selectedRecord, setSelectedRecord] = useState<ResultRecord | null>(null)
  const detailUrl = selectedRecord ? `/api/rag/results/${encodeURIComponent(selectedRecord.publicationId)}/${encodeURIComponent(selectedRecord.sourceRow.result_id)}` : null
  const { data: detail, error: detailError } = useSWR<{ record: ResultRecord }>(detailUrl, async (url: string) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error("Не удалось загрузить карточку источника.")
    return response.json()
  }, { revalidateOnFocus: false })
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [toast, setToast] = useState("")
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { light: isLightTheme } = useWorkspaceTheme()
  const currentPage = pageTitles[activePage]

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(""), 4200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        window.location.assign(area ? "/research/" + area : "/research")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [area])

  const showToast = (message: string) => setToast(message)
  const goTo = (page: PageKey) => {
    setActivePage(page)
    const params = new URLSearchParams({ view: page })
    if (area) params.set("area", area)
    if (uploads && page === "pages") params.set("scope", "uploads")
    window.history.replaceState(null, "", "/?" + params)
    window.scrollTo(0, 0)
    setMobileNavOpen(false)
  }
  const exportCsv = async (records: ResultRecord[],format:"csv"|"xlsx"="csv") => {
    try {
      if(format==="xlsx") {
        const data=await tableWorkbook("Научные результаты RAG",resultColumns,records.map(record=>resultColumns.map(column=>record.sourceRow[column])))
        downloadBlobFile(new Blob([data],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),"rag-dev-results.xlsx")
      } else downloadCsvFile(exportResultsCsv(records,resultColumns),"rag-dev-results.csv")
      showToast("Экспортировано "+records.length+" строк.")
    } catch {showToast("Не удалось сформировать выгрузку.") }
  }
  function visitPage(publication: string, page: number) {
    setSourcePage({ publication, page })
    goTo("pages")
  }

  function visitReview(id?: string) {
    setReviewTask(id)
    goTo("review")
    if (id) window.history.replaceState(null,"","/?"+new URLSearchParams({ view:"review", area:"rag", record:id }))
  }

  function visitCatalog(publication?: string) {
    if (area !== "rag") {
      const params = new URLSearchParams({ view: "catalog", area: "rag" })
      if (publication) params.set("q", publication + "/")
      window.location.assign("/?" + params)
      return
    }
    if (publication) setSearch(publication + "/")
    goTo("catalog")
  }

  const missingCorpus = ragUnavailable && ["catalog", "pages", "compare", "review", "reports", "passport"].includes(activePage)

  return <div className={`app-shell evidence-workspace ${isLightTheme ? "theme-light" : "theme-dark"}`}>
    <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`} aria-label="Основная навигация">
      <div className="sidebar-brand"><div className="brand-symbol"><img src="/kosmostack-emblem.png" alt="Эмблема KosmoStack" /></div><div className="brand-title"><strong>KosmoStack</strong></div><button type="button" className="icon-button sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Закрыть меню"><X /></button></div>
      <a className="ws-library-nav-link" href={area ? "/research/" + area : "/research"}><Search aria-hidden="true" /> Поиск по статьям и тегам</a>
      <ResearchAreas selected={area} />
      <a className="ws-library-nav-link" href="/cabinet">Личный кабинет</a>
      <nav className="sidebar-nav">{["ДАННЫЕ", "АНАЛИЗ", "ПРОЕКТ"].map((group) => <div className="nav-group" key={group}><span className="nav-group-label">{group}</span>{navItems.filter((item) => item.group === group).map((item) => { const Icon = item.icon; return <button type="button" className={`nav-item ${activePage === item.id ? "active" : ""}`} key={item.id} onClick={() => {
        if (item.id === "catalog" && activePage !== "catalog") { window.location.assign("/?view=catalog"); return }
        if (item.id === "review") setReviewTask(undefined)
        if (item.id === "pages") setSourcePage(undefined)
        goTo(item.id)
      }} aria-current={activePage === item.id ? "page" : undefined}><Icon aria-hidden="true" /><span>{item.label}</span></button>})}</div>)}</nav>
      <div className="sidebar-spacer" />
      {area && <div className="sidebar-corpus"><div className="corpus-status"><span className="context-dot" />{areas[area].short}</div>
        {area === "rag" && <button type="button" className="sidebar-help" onClick={() => goTo("passport")}>Паспорт корпуса <span>↗</span></button>}
      </div>}
    </aside>

    {mobileNavOpen && <button type="button" className="mobile-scrim" aria-label="Закрыть меню" onClick={() => setMobileNavOpen(false)} />}
    <main className="main-column">
      <header className="topbar"><div className="topbar-leading"><button type="button" className="icon-button mobile-menu-button" aria-label="Открыть меню" onClick={() => setMobileNavOpen(true)}><Menu /></button><div className="breadcrumbs"><a className="ws-link" href="/">На главную</a><span className="breadcrumb-divider">/</span><strong>{currentPage.breadcrumb.split(" / ")[1]}</strong></div></div><div className="topbar-actions"><button type="button" className="top-search-button" aria-label="Открыть поиск" onClick={() => window.location.assign(area ? "/research/" + area : "/research")}><Search aria-hidden="true" /><span>Поиск</span><kbd>⌘ K</kbd></button><ThemeButton /><SignOutButton /></div></header>
      <div className="topbar-rule"><span /></div>
      <div className="content-scroll">
        {area && <div className="workspace-context" aria-label="Выбранная область">
          <span><span className="context-dot" />{areas[area].label}</span>
          {metadata && <span>{metadata.resultCount} результатов · {metadata.publicationCount} публикаций</span>}
        </div>}
        {missingCorpus ? <section className="page-content ws-page">
          <div className="ws-panel ws-stack">
            <h1>Корпус RAG ещё не подключён</h1>
            <p>Для каталога, сравнения и проверок подключите подготовленный корпус по README-START.md. Свои PDF можно загрузить в личном кабинете.</p>
            <div className="ws-actions"><a className="ws-button" href="/cabinet">Личный кабинет</a></div>
          </div>
        </section> : <>
        {activePage === "home" && <AreaChoice view="library" />}
        {(activePage === "catalog" || activePage === "pages") && <div className="ws-area-bar">
          <ResearchAreas selected={area} workspace={activePage} />
          {activePage === "pages" && <a className="ws-button" href="/?view=pages&scope=uploads" aria-current={uploads ? "page" : undefined}>Загруженные PDF</a>}
        </div>}
        {activePage === "catalog" && (area === "rag" && metadata ? <CatalogView records={records} search={search} setSearch={setSearch}
          publicationCount={metadata.publicationCount} onEvidence={setSelectedRecord}
          onCompare={(ids) => { setCompareIds(ids); goTo("compare") }} onExport={exportCsv} onPages={visitPage} /> :
          area === "solar" || area === "space" ? <IndexedCatalog key={area} area={area} initialArticle={article} /> :
            <AreaChoice view="catalog" />)}
        {activePage === "pages" && (area === "rag" || uploads ? <PagesView key={sourcePage ? `${sourcePage.publication}/${sourcePage.page}` : "all"}
          mode={uploads ? "uploads" : "rag"} records={records} initial={sourcePage ?? (article ? { publication: article, page: articlePage ?? 1 } : undefined)}
          initialCitation={initialCitation} initialTag={initialTag} onEvidence={setSelectedRecord} onCatalog={visitCatalog} onUpload={() => goTo("runs")} /> :
          area === "solar" || area === "space" ? <IndexedPages key={area} area={area} initialArticle={article} initialPage={articlePage} initialCitation={initialCitation} initialTag={initialTag} /> :
            <AreaChoice view="pages" />)}
        {activePage === "compare" && (area === "solar" || area === "space") && <IndexedComparison key={area} area={area} />}
        {activePage === "compare" && !area && <div className="page-content ws-page"><h1>Выберите область для сравнения</h1><div className="ws-actions">{Object.entries(areas).map(([key,info])=><a className="ws-button" href={"/?view=compare&area="+key} key={key}>{info.label}</a>)}</div></div>}
        {activePage === "runs" && <RunsView onEvidence={setSelectedRecord} onToast={showToast} onOpenCorpus={visitCatalog} />}
        {activePage === "passport" && <AreaPassportView initial={passportScope ?? area} />}
        {area === "rag" ? <>
          {activePage === "compare" && <ComparisonView records={records} initialIds={compareIds} onEvidence={setSelectedRecord} onCatalog={visitCatalog} onReview={visitReview} />}
          {activePage === "review" && <ReviewQueue key={reviewTask ?? "all"} records={records} initialTask={reviewTask}
            onEvidence={setSelectedRecord} onPage={visitPage} />}

          {activePage === "reports" && <ReportsView onToast={showToast} onReview={visitReview} />}
        </> : (activePage === "review" || activePage === "reports") &&
          <div className="page-content ws-page">
            <header className="ws-heading"><h1>{navItems.find((item) => item.id === activePage)?.label}</h1></header>
            <section className="ws-panel ws-stack">
              <p>В этом разделе используются проверяемые записи корпуса RAG.</p>
              <a className="ws-button ws-primary" href={`/?view=${activePage}&area=rag`}>Выбрать область RAG</a>
            </section>
          </div>}
        </>}
      </div>
    </main>
    {selectedRecord && <EvidencePreview key={selectedRecord.id} record={detail?.record ?? selectedRecord}
      loading={Boolean(detailUrl && !detail && !detailError)} sourceConnected={Boolean(detail?.record.sourceImageUrl)}
      onClose={() => setSelectedRecord(null)} onToast={showToast} />}
    {detailError && <p className="toast-message" role="alert">{detailError.message}</p>}
    {toast && <div className="toast-message" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true" /><span>{toast}</span><button type="button" aria-label="Закрыть уведомление" onClick={() => setToast("")}><X /></button></div>}
  </div>
}

function AreaChoice({ view = "catalog" }: { view?: "catalog" | "pages" | "library" }) {
  return <section className="page-content ws-page ws-area-choice">
    <header className="ws-heading"><div><h1>Выберите область исследований</h1>
      <p>Откройте каталог результатов и публикации выбранной области.</p></div></header>
    <div className="ws-area-grid">
      {(Object.keys(areas) as Area[]).map((key) => <a className="ws-panel ws-stack ws-area-card" key={key} href={view === "library" ? "/research/" + key : areaWorkspace(key, view)}>
        <div className="ws-row"><h2>{areas[key].label}</h2><ChevronRight aria-hidden="true" /></div>
        <p>{areas[key].description}</p>
      </a>)}
    </div>
    <OwnedAreaChoices view={view} />
  </section>
}