"use client"

import { ArrowRight } from "lucide-react"
import { ThemeButton, useWorkspaceTheme } from "@/components/workspace-theme"
import type { activeLogin } from "@/lib/auth-store"

export function LoginForm({ next, current, editing, error }: {
  next: string; current: ReturnType<typeof activeLogin>; editing: boolean; error?: string
}) {
  const { light } = useWorkspaceTheme()
  const challenge = editing ? null : current
  const editLink = "/login?" + new URLSearchParams({ edit: "1", next })
  return <main className={"evidence-workspace ws-auth " + (light ? "theme-light" : "theme-dark")}>
    <div className="ws-auth-theme"><ThemeButton /></div>
    <section className="ws-panel ws-page ws-auth-panel" aria-labelledby="login-title">
      <div className="ws-auth-brand"><img src="/kosmostack-emblem.png" width={116} height={116} alt="Эмблема команды KosmoStack" /></div>
      <header className="ws-stack"><h1 id="login-title">Вход в KosmoStack</h1>
        <p>Укажите ФИО и почту. Код для локального входа появится на этой странице.</p>
      </header>
      <form className="ws-stack" method="post" action={challenge ? "/api/auth/verify" : "/api/auth/code"}>
        <input type="hidden" name="next" value={next} />
        <label className="ws-field"><span>ФИО</span><input name="fullName" type="text" defaultValue={current?.fullName}
          autoComplete="name" required maxLength={120} placeholder="Фамилия Имя Отчество" readOnly={!!challenge} /></label>
        <label className="ws-field"><span>Электронная почта</span><input name="email" type="email" defaultValue={current?.email}
          autoComplete="email" required maxLength={254} placeholder="name@example.com" readOnly={!!challenge} /></label>
        <div className="ws-stack ws-auth-code-field">
          <label className="ws-field"><span>Код подтверждения</span>
            <input name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
              disabled={!challenge} required={!!challenge} aria-describedby="local-code-hint" />
          </label>
          <div id="local-code-hint" role="status">
            {challenge ? <div className="ws-auth-local-code"><span>Код для входа</span><strong>{challenge.code}</strong><small>Действует до 10 минут</small></div>
              : <p>Нажмите «Получить код».</p>}
          </div>
        </div>
        {error && <p className="ws-feedback ws-text-warn" role="alert">{error}</p>}
        <button className="ws-button ws-primary" type="submit">
          {challenge ? "Войти" : "Получить код"}<ArrowRight aria-hidden="true" />
        </button>
        {challenge && <div className="ws-row">
          <a className="ws-button" href={editLink}>Изменить данные</a>
          <button className="ws-button" type="submit" formAction="/api/auth/code" formNoValidate>Новый код</button>
        </div>}
      </form>
    </section>
  </main>
}
