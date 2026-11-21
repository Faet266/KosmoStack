"use client"

import { useMemo, useState } from "react"
import { ArrowDownToLine, ArrowRight, ClipboardCheck, Database, FileCheck2, History, Search, ShieldCheck, Users } from "lucide-react"

type PortalPage = "catalog" | "compare" | "review" | "runs" | "passport" | "reports" | "account" | "admin"

type PortalViewProps = {
  onNavigate: (page: PortalPage) => void
  onToast: (message: string) => void
}

type Member = { name: string; email: string; role: string; unit: string; status: string; last: string }
type AuditEntry = [string, string, string, string, string]

type AdminTab = "overview" | "members" | "journal"

export function AccountView({ onNavigate }: Pick<PortalViewProps, "onNavigate">) {
  return <div className="page-content">
    <div className="page-heading-row"><div><div className="eyebrow page-eyebrow">ОБЩЕЕ РАБОЧЕЕ ПРОСТРАНСТВО</div><h1>Общее хранилище</h1><p>Вход не требуется. PDF хранятся на устройстве, а анализ, поиск и история проверки работают через PostgreSQL.</p></div><div className="page-actions"><button className="primary-button" type="button" onClick={() => onNavigate("runs")}><ClipboardCheck aria-hidden="true" /> Открыть PDF</button></div></div>
    <section className="profile-overview-card">
      <div className="profile-avatar"><Database aria-hidden="true" /></div>
      <div className="profile-main"><span className="eyebrow">РЕЖИМ ДОСТУПА</span><h2>Общее рабочее пространство</h2><p>Анонимный доступ · без аккаунта</p></div>
      <div className="profile-membership"><span>ДОКУМЕНТЫ</span><strong>Общие</strong><small>Загруженные PDF видны всем посетителям.</small></div>
      <div className="profile-role"><span>БАЗА ДАННЫХ</span><strong>PostgreSQL</strong><small>Анализы и текст страниц сохраняются в базе.</small></div>
    </section>

<section className="account-stats" aria-label="Сводка общего хранилища">
      {[["Вход", "Не требуется"], ["PDF", "Общие"], ["Анализы", "Общие"], ["Хранение", "PostgreSQL"]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>Доступно посетителям приложения</small></article>)}
    </section>

    <div className="account-columns">
      <section className="account-panel"><div className="panel-heading"><div><h2>Общие документы</h2></div><span className="count-pill">PostgreSQL</span></div>
        <div className="empty-state compact-empty"><div className="empty-icon"><ClipboardCheck aria-hidden="true" /></div><h3>PDF и анализы сохраняются в базе</h3><p>Загруженные документы, текст страниц и отчёты видны всем посетителям приложения.</p></div>
      </section>
      <section className="account-panel account-history"><div className="panel-heading"><div><h2>Важно о доступе</h2></div><History aria-hidden="true" /></div>
        <div className="empty-state compact-empty"><div className="empty-icon"><History aria-hidden="true" /></div><h3>Вход временно отключён</h3><p>Не загружайте конфиденциальные или персональные документы: данные доступны без авторизации.</p></div>
      </section>
    </div>
  </div>
}

export function AdminView({ onNavigate, onToast }: PortalViewProps) {
  const [tab, setTab] = useState<AdminTab>("overview")
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("Все роли")
  const members: Member[] = []
  const auditEntries: AuditEntry[] = []
  const filteredMembers = useMemo(() => members.filter((member) =>
    (!query || `${member.name} ${member.email} ${member.unit}`.toLowerCase().includes(query.toLowerCase())) &&
    (roleFilter === "Все роли" || member.role === roleFilter),
  ), [query, roleFilter])

  return <div className="page-content">
    <div className="page-heading-row"><div><div className="eyebrow page-eyebrow">УПРАВЛЕНИЕ ПРОЕКТОМ</div><h1>Администрирование</h1></div><div className="page-actions"><button className="secondary-button" type="button" onClick={() => onToast("Приглашение станет доступно после подключения сервиса управления пользователями.")}><Users aria-hidden="true" /> Пригласить участника</button></div></div>
    <section className="admin-overview-strip" aria-label="Сводка проекта">
      {[["Участники проекта", "—"], ["Ожидают проверки", "—"], ["Отчёты за месяц", "—"], ["Требуют внимания", "—"]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>Данные не загружены</small></article>)}
    </section>

    <section className="admin-console">
      <div className="admin-console-heading"><div><span className="eyebrow">КОНТУР ПРОЕКТА</span><h2>Команда и контроль качества</h2></div><span className="admin-role-chip"><ShieldCheck aria-hidden="true" /> Управление проектом</span></div>
      <div className="admin-tabs" role="tablist" aria-label="Разделы администрирования">
        {([{ id: "overview", label: "Сводка" }, { id: "members", label: "Участники" }, { id: "journal", label: "Журнал действий" }] as const).map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>

      {tab === "overview" && <div className="admin-overview-content">
        <div className="admin-feature-list"><article><span className="admin-feature-icon"><Users aria-hidden="true" /></span><div><strong>Управление участниками</strong></div><button className="text-button" type="button" onClick={() => setTab("members")}>Команда <ArrowRight aria-hidden="true" /></button></article>
          <article><span className="admin-feature-icon"><ClipboardCheck aria-hidden="true" /></span><div><strong>Маршрутизация проверок</strong></div><button className="text-button" type="button" onClick={() => onNavigate("review")}>Очередь <ArrowRight aria-hidden="true" /></button></article>
          <article><span className="admin-feature-icon"><FileCheck2 aria-hidden="true" /></span><div><strong>Отчётность и регламент</strong></div><button className="text-button" type="button" onClick={() => onNavigate("reports")}>Шаблон <ArrowRight aria-hidden="true" /></button></article></div>
        <div className="admin-action-card"><span className="admin-action-icon"><History aria-hidden="true" /></span><span className="eyebrow">АУДИТ ИЗМЕНЕНИЙ</span><h3>Журнал действий</h3><button className="secondary-button compact" type="button" onClick={() => setTab("journal")}>Открыть журнал <ArrowRight aria-hidden="true" /></button></div>
      </div>}

      {tab === "members" && <div className="admin-member-content">
        <div className="admin-member-toolbar"><label className="admin-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, почта или подразделение" aria-label="Поиск участников" /></label><label className="admin-role-filter"><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Фильтр участников по роли"><option>Все роли</option><option>Эксперт</option><option>Куратор</option><option>Администратор</option></select></label><span className="count-pill">{filteredMembers.length ? `${filteredMembers.length} участников` : "Нет данных"}</span></div>
        <div className="admin-table-scroll"><table className="admin-members-table"><thead><tr><th>Участник</th><th>Подразделение</th><th>Роль · статус</th><th>Последняя активность</th><th><span className="sr-only">Действия</span></th></tr></thead><tbody>{filteredMembers.map((member) => <tr key={member.email}><td><strong>{member.name}</strong><small>{member.email}</small></td><td>{member.unit}</td><td><span className={`admin-member-status ${member.status === "Активен" ? "is-active" : "is-waiting"}`}>{member.role} · {member.status}</span></td><td>{member.last}</td><td><button className="text-button" type="button" onClick={() => onToast("Карточка участника станет доступна после загрузки данных.")}>Карточка</button></td></tr>)}</tbody></table>{filteredMembers.length === 0 && <div className="empty-state compact-empty"><h3>Список участников пока пуст</h3><p>Сведения о пользователях появятся после подключения источника.</p></div>}</div>
      </div>}

      {tab === "journal" && <div className="admin-journal-content"><div className="admin-journal-title"><div><h3>Журнал действий</h3></div><button className="secondary-button compact" type="button" disabled={!auditEntries.length} onClick={() => onToast("Журнал действий пуст.")}><ArrowDownToLine aria-hidden="true" /> Экспорт</button></div><div className="admin-audit-table"><div className="admin-audit-row is-header"><span>Время</span><span>Участник</span><span>Действие · объект</span><span>Роль</span></div>{auditEntries.map(([time, actor, action, item, role]) => <div className="admin-audit-row" key={`${time}-${item}`}><span>{time}</span><span>{actor}</span><span><strong>{action}</strong><small>{item}</small></span><span>{role}</span></div>)}{auditEntries.length === 0 && <div className="empty-state compact-empty"><h3>Записей пока нет</h3><p>Журнал действий появится после начала работы команды.</p></div>}</div></div>}
    </section>
  </div>
}
