"use client"

import { useState } from "react"
import { ArrowDownToLine, FileText, LoaderCircle } from "lucide-react"
import {
  createInspectionDocx,
  createInspectionOdt,
  initialInspectionReport,
  type InspectionFinding,
  type InspectionReport,
} from "@/lib/official-reports"

type InspectionReportToolsProps = {
  onToast: (message: string) => void
}

type ExportFormat = "docx" | "odt"

const exportFormats: Array<{ id: ExportFormat; label: string; description: string }> = [
  { id: "docx", label: "Word · DOCX", description: "Редактируемый документ" },
  { id: "odt", label: "LibreOffice · ODT", description: "Открытый формат" },
]

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.style.display = "none"
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function makeFilename(number: string, extension: ExportFormat) {
  const safeNumber = number.trim().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "") || "report"
  return `kosmostack-inspection-${safeNumber}.${extension}`
}

export function InspectionReportTools({ onToast }: InspectionReportToolsProps) {
  const [report, setReport] = useState<InspectionReport>(initialInspectionReport)
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [error, setError] = useState("")

  const updateReport = (field: keyof Omit<InspectionReport, "findings">, value: string) => {
    setReport((current) => ({ ...current, [field]: value }))
  }

  const updateFinding = (index: number, update: Partial<InspectionFinding>) => {
    setReport((current) => ({
      ...current,
      findings: current.findings.map((finding, findingIndex) => findingIndex === index ? { ...finding, ...update } : finding),
    }))
  }

  const exportDocument = async (format: ExportFormat) => {
    setBusy(format)
    setError("")
    try {
      const blob = format === "docx"
        ? await createInspectionDocx(report)
        : await createInspectionOdt(report)
      download(blob, makeFilename(report.number, format))
      onToast(`Подготовлен официальный шаблон ${format.toUpperCase()}. Заполните реквизиты по регламенту организации.`)
    } catch {
      setError(`Не удалось создать файл ${format.toUpperCase()}. Повторите экспорт или проверьте поля отчёта.`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="inspection-workspace" aria-labelledby="inspection-template-title">
      <div className="inspection-workspace-heading">
        <div>
          <span className="eyebrow">DOCX · ODT</span>
          <h2 id="inspection-template-title">Отчёт о проверке</h2>
        </div>
      </div>

      <div className="inspection-layout">
        <div className="inspection-editor">
          <div className="inspection-form-grid">
            <label><span>Номер отчёта</span><input value={report.number} onChange={(event) => updateReport("number", event.target.value)} /></label>
            <label><span>Дата составления</span><input value={report.date} onChange={(event) => updateReport("date", event.target.value)} /></label>
            <label className="form-span-all"><span>Организация</span><input value={report.organization} onChange={(event) => updateReport("organization", event.target.value)} /></label>
            <label className="form-span-all"><span>Подразделение</span><input value={report.department} onChange={(event) => updateReport("department", event.target.value)} /></label>
            <label className="form-span-all"><span>Проверяемый объект</span><input value={report.subject} onChange={(event) => updateReport("subject", event.target.value)} /></label>
            <label className="form-span-all"><span>Ответственный эксперт</span><input value={report.reviewer} onChange={(event) => updateReport("reviewer", event.target.value)} /></label>
            <label className="form-span-all"><span>Итоговое заключение</span><textarea value={report.conclusion} onChange={(event) => updateReport("conclusion", event.target.value)} rows={3} /></label>
          </div>

          <section className="inspection-findings-editor" aria-labelledby="inspection-findings-title">
            <div className="inspection-findings-heading">
              <div><h3 id="inspection-findings-title">Критерии проверки</h3><p>Заполните подтверждение для каждого результата — оно попадёт в таблицу экспорта.</p></div>
              <span><FileText aria-hidden="true" />{report.findings.length} критерия</span>
            </div>
            <div className="inspection-findings-list">
              {report.findings.map((finding, index) => <article className="inspection-finding-card" key={index}>
                <div className="inspection-finding-fields">
                  <label><span>Критерий {index + 1}</span><input value={finding.criterion} onChange={(event) => updateFinding(index, { criterion: event.target.value })} /></label>
                  <label><span>Статус</span><select value={finding.status} onChange={(event) => updateFinding(index, { status: event.target.value as InspectionFinding["status"] })}><option>Соответствует</option><option>Замечание</option><option>Не проверено</option></select></label>
                  <label className="inspection-finding-evidence"><span>Основание / комментарий</span><textarea rows={3} value={finding.evidence} onChange={(event) => updateFinding(index, { evidence: event.target.value })} /></label>
                </div>
              </article>)}
            </div>
          </section>

          {error && <p className="document-error" role="alert">{error}</p>}
          <div className="inspection-export-grid" aria-label="Экспорт отчёта">
            {exportFormats.map((format) => <button key={format.id} className="export-format-button" type="button" onClick={() => exportDocument(format.id)} disabled={busy !== null}>
              <span className="export-format-icon"><ArrowDownToLine aria-hidden="true" /></span>
              <span><strong>{format.label}</strong><small>{format.description}</small></span>
              {busy === format.id && <LoaderCircle className="document-spinner" aria-label="Подготавливается файл" />}
            </button>)}
          </div>
        </div>

        <article className="official-document-preview" aria-label="Предпросмотр официального отчёта">
          <div className="document-preview-top"><span>KOSMOSTACK · ВИНИТИ РАН × СФУ</span><span>ФОРМА КС-01</span></div>
          <h3>ОТЧЁТ<br />О ПРОВЕРКЕ</h3>
          <div className="document-preview-number">№ {report.number || "____________"} · {report.date || "____________"}</div>
          <div className="document-preview-rule" />
          <span className="document-section-label">1. РЕКВИЗИТЫ</span>
          <div className="document-preview-fields">
            <p><strong>Организация</strong>{report.organization || "Не заполнено"}</p>
            <p><strong>Подразделение</strong>{report.department || "Не заполнено"}</p>
            <p><strong>Объект проверки</strong>{report.subject || "Не заполнено"}</p>
            <p><strong>Эксперт</strong>{report.reviewer || "Не заполнено"}</p>
          </div>
          <span className="document-section-label">2. РЕЗУЛЬТАТЫ</span>
          <div className="document-preview-table"><span>Критерий проверки</span><span>Статус</span>{report.findings.map((finding, index) => <div className="document-preview-row" key={index}><span>{finding.criterion}</span><strong>{finding.status}</strong></div>)}</div>
          <span className="document-section-label">3. СВОДКА</span>
          <div className="document-preview-summary" aria-label="Сводка статусов критериев">
            <span><strong>{report.findings.filter((finding) => finding.status === "Соответствует").length}</strong>Соответствует</span>
            <span><strong>{report.findings.filter((finding) => finding.status === "Замечание").length}</strong>Замечание</span>
            <span><strong>{report.findings.filter((finding) => finding.status === "Не проверено").length}</strong>Не проверено</span>
          </div>
          <span className="document-section-label">4. ИТОГОВОЕ ЗАКЛЮЧЕНИЕ</span>
          <p className="document-preview-conclusion">{report.conclusion || "Не заполнено"}</p>
          <div className="document-preview-signature"><span>Эксперт: _____________________</span><span>Дата: ______________</span></div>
          <small>Рабочая форма. Утвердить по регламенту организации.</small>
        </article>
      </div>
    </section>
  )
}
