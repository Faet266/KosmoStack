"use client"

import { RagControlCheck } from "@/components/rag-control-check"
import useSWR from "swr"
import { ArrowDownToLine, ArrowUpRight } from "lucide-react"
import type { QualityReport } from "@/lib/quality-report"

const marks: Record<string, string> = {
  complete: "Завершено", needs_review: "Нужна проверка", not_assessable: "Оценка недоступна",
  failed: "Ошибка", skipped: "Пропущено", not_run: "Не запускалось",
}
const countNames = {
  publications: "Публикации", configurations: "Конфигурации", datasets: "Датасеты", tasks: "Задачи",
  experiments: "Эксперименты", results: "Результаты", issues: "Замечания",
} as const
const stageNames: Record<string, string> = {
  participant1: "Извлечение страниц", participant2: "Научный снимок", local_validation: "Локальная проверка",
  neutral_handoff: "Выгрузка", supplied_checker: "Внешний чекер", independent_evaluation: "Оценка по эталону",
}
const artifacts = [
  ["coverage", "Покрытие"], ["pipeline", "Протокол прогона"], ["validation", "Локальная проверка"],
  ["checker", "Отчёт чекера"], ["evaluation", "Оценка по эталону"],
]
const examples: Record<string, string> = {
  unknown_scale: "Уточнить шкалу в заголовке или методике",
  visual_region: "Сверить число с изображением страницы",
  quote: "Сверить полную цитату",
}

export function RagQualityReport({ onReview }: { onReview: (id?: string) => void }) {
  const { data, error, mutate } = useSWR<QualityReport>("/api/rag/quality", async (url: string) => {
    const response = await fetch(url)
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error)
    return payload
  }, { revalidateOnFocus: false })
  if (error) return <div className="ws-panel ws-row"><p role="alert">{error.message}</p><button className="ws-button" type="button" onClick={() => void mutate()}>Повторить загрузку</button></div>
  if (!data) return <p className="ws-feedback" role="status">Загружаем отчёт качества…</p>
  const {
    counts, localValidation: local, checker, evaluation, origins, bindings, slices, partialDocuments, review,
  } = data
  return <>
    <RagControlCheck />
    <div className="ws-grid ws-four" aria-label="Сводка качества">
      {([
        [counts.results, "Научные записи"],
        [local.foundQuotes, "Цитаты найдены в кеше"],
        [local.visualChecks, "Цитаты требуют сверки"],
        [local.unknownScale, "Записи без шкалы"],
      ] as const).map(([value, label]) => <div className="ws-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
    <div className="ws-grid ws-two">
      <section className="ws-panel ws-stack">
        <header className="ws-row"><h2>Проверки источников</h2><span className="ws-chip ws-attention">{marks[data.status] ?? data.status}</span></header>
        <dl className="ws-key-values">
          <div><dt>Ошибки структуры</dt><dd>{local.structuralErrors}</dd></div>
          <div><dt>Предупреждения</dt><dd>{local.warnings.length}</dd></div>
          <div><dt>Частичное покрытие</dt><dd>{partialDocuments} из {counts.publications} публикаций</dd></div>
          <div><dt>Внешний чекер</dt><dd>{marks[checker.status] ?? checker.status}{checker.exitCode !== null ? ` · код ${checker.exitCode}` : ""}</dd></div>
          {checker.quotes && <div><dt>Цитаты по внешнему чекеру</dt><dd>{checker.quotes.matched} из {checker.quotes.requested}</dd></div>}
          <div><dt>Решения по источникам</dt><dd>{data.sourceReview.reviewed} из {data.sourceReview.total} задач</dd></div>
          <div><dt>Подтверждено замечаний</dt><dd>{review.confirmed} из {review.reviewed} рассмотренных</dd></div>
        </dl>
        <div className="ws-actions"><button className="ws-button" type="button" onClick={() => onReview()}>Открыть очередь проверки <ArrowUpRight aria-hidden="true" /></button>
          <button className="ws-button" type="button" onClick={() => void mutate()}>Обновить</button></div>
      </section>
      <section className="ws-panel ws-stack">
        <header className="ws-row"><h2>Оценка по эталону</h2><span className="ws-chip">{marks[evaluation.status] ?? evaluation.status}</span></header>
        <p>{evaluation.metrics ? "Результат сопоставления с dev_gold." : "В доступном dev_gold нет пригодных пар для расчёта метрик."}</p>
        <dl className="ws-score-grid">
          {(["tp", "fp", "fn", "precision", "recall", "f1"] as const).map((metric) => <div key={metric}>
            <dt>{({ tp: "TP", fp: "FP", fn: "FN", precision: "Precision", recall: "Recall", f1: "F1" })[metric]}</dt>
            <dd>{evaluation.metrics?.[metric] ?? "—"}</dd>
          </div>)}
        </dl>
        <details className="ws-details"><summary>Выборка и знаменатели</summary>
          <dl className="ws-key-values">
            <div><dt>Строки выгрузки с полным контекстом</dt><dd>{evaluation.totals.prediction_assessable} из {evaluation.totals.prediction_rows_total}</dd></div>
            <div><dt>Строки эталона с полным контекстом</dt><dd>{evaluation.totals.gold_assessable} из {evaluation.totals.gold_rows_total}</dd></div>
            <div><dt>Независимость эталона</dt><dd>{evaluation.independent ? "Подтверждена" : "Не установлена"}</dd></div>
          </dl>
        </details>
      </section>
    </div>
    {!!data.examples.length && <section className="ws-panel ws-stack">
      <h2>Примеры для сверки</h2>
      <div className="ws-list">{data.examples.map((entry) => <button className="ws-list-button" type="button" key={entry.reason}
        onClick={() => onReview(`${entry.publicationId}/${entry.id}`)}>
        <span>{entry.publicationId}/{entry.id} · стр. {entry.page}</span><small>{examples[entry.reason]}</small>
      </button>)}</div>
    </section>}
    <section className="ws-panel ws-stack">
      <h2>Подробности и файлы</h2>
      <details className="ws-details"><summary>Состав корпуса и типы источников</summary>
        <div className="ws-grid ws-two">
          <dl className="ws-key-values">{Object.entries(countNames).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{counts[key as keyof typeof counts]}</dd></div>)}</dl>
          <dl className="ws-key-values">
            <div><dt>Первичные / цитируемые</dt><dd>{origins.primary} / {origins.cited}</dd></div>
            <div><dt>Числовой фрагмент / область</dt><dd>{bindings.value_fragment ?? 0} / {bindings.visual_region ?? 0}</dd></div>
            <div><dt>Текст PDF / OCR / прочее</dt><dd>{slices.byPageType.text} / {slices.byPageType.scan} / {slices.byPageType.unknown}</dd></div>
            <div><dt>Таблица / текст / рисунок / неизвестно</dt><dd>{slices.bySource.table} / {slices.bySource.text} / {slices.bySource.figure} / {slices.bySource.unknown}</dd></div>
          </dl>
        </div>
      </details>
      <details className="ws-details"><summary>Предупреждения, этапы и версия</summary>
        <dl className="ws-key-values">{data.stages.map(({ name, status }) => <div key={name}><dt>{stageNames[name] ?? name}</dt><dd>{marks[status] ?? status}</dd></div>)}</dl>
        <ul>{local.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        <p>Схема {data.schemaVersion} · handoff {data.handoffVersion}</p><code className="ws-break">{data.datasetSha}</code>
      </details>
      <div className="ws-actions">
        {artifacts.map(([id, label]) => <a key={id} className="ws-button" href={`/api/rag/artifacts/${id}`}><ArrowDownToLine aria-hidden="true" /> {label}</a>)}
      </div>
    </section>
  </>
}
