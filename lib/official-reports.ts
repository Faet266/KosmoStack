import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Paragraph,
  Packer,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import JSZip from "jszip"

export type FindingStatus = "Соответствует" | "Замечание" | "Не проверено"

export type InspectionFinding = {
  criterion: string
  status: FindingStatus
  evidence: string
}

export type InspectionReport = {
  number: string
  date: string
  organization: string
  department: string
  subject: string
  reviewer: string
  conclusion: string
  findings: InspectionFinding[]
}

export const initialInspectionReport: InspectionReport = {
  number: "КС-ВП-2026-001",
  date: "20.11.2026",
  organization: "Проектная группа KosmoStack",
  department: "Экспертная группа · учебный макет",
  subject: "Карточка результата научной публикации",
  reviewer: "Эксперт проекта",
  conclusion: "Итоговое заключение заполняется ответственным экспертом после проверки источника.",
  findings: [
    {
      criterion: "Идентификация проверяемого документа",
      status: "Не проверено",
      evidence: "Укажите название публикации, DOI или регистрационный номер.",
    },
    {
      criterion: "Полнота сведений о метрике и протоколе",
      status: "Не проверено",
      evidence: "Сверьте определение метрики, набор данных, разбиение и условия эксперимента.",
    },
    {
      criterion: "Подтверждение результата первичным источником",
      status: "Не проверено",
      evidence: "Укажите страницу, таблицу и фрагмент, подтверждающий значение.",
    },
  ],
}

const NAVY = "17344F"
const TEXT = "202B35"
const MUTED = "536575"
const PALE = "EAF0F5"
const BORDER = "B7C5D2"
const FONT = "Times New Roman"
const PAGE_WIDTH = 16838
const PAGE_HEIGHT = 11906
const PAGE_MARGIN = { top: 850, right: 936, bottom: 850, left: 936 }
const TABLE_WIDTHS = [3900, 1800, 9260]
const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  left: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  right: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: BORDER },
}

const normalRun = (text: string, options: { bold?: boolean; color?: string; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: options.size ?? 28, color: options.color ?? TEXT, bold: options.bold })

const bodyParagraph = (text: string, options: { bold?: boolean; color?: string; size?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({
    children: [normalRun(text, options)],
    alignment: options.alignment,
    spacing: { after: 150, line: 360 },
  })

const labeledParagraph = (label: string, value: string) =>
  new Paragraph({
    children: [normalRun(`${label}: `, { bold: true, color: NAVY }), normalRun(value || "Не заполнено")],
    spacing: { after: 100, line: 360 },
  })

function summarizeFindings(findings: InspectionFinding[]) {
  const counts: Record<FindingStatus, number> = {
    "Соответствует": 0,
    "Замечание": 0,
    "Не проверено": 0,
  }

  for (const finding of findings) counts[finding.status] += 1

  return {
    ...counts,
    total: findings.length,
    reviewed: counts["Соответствует"] + counts["Замечание"],
  }
}

function recommendationLines(findings: InspectionFinding[]) {
  if (!findings.length) return ["Добавить критерии проверки и подтверждения из источников перед утверждением отчёта."]
  const openFindings = findings.filter((finding) => finding.status !== "Соответствует")
  if (!openFindings.length) return ["Сохранить ссылки на первичные источники и передать отчёт на утверждение."]

  return openFindings.map((finding) => finding.status === "Замечание"
    ? `Устранить замечание по критерию «${finding.criterion || "без названия"}» и зафиксировать подтверждение.`
    : `Проверить критерий «${finding.criterion || "без названия"}» по первичному источнику и заполнить основание.`)
}

function createWordCell(text: string, index: number, header = false, rowIndex = 0) {
  return new TableCell({
    width: { size: TABLE_WIDTHS[index], type: WidthType.DXA },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    borders: TABLE_BORDERS,
    shading: {
      type: ShadingType.CLEAR,
      fill: header ? NAVY : rowIndex % 2 ? PALE : "FFFFFF",
    },
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || "—", font: FONT, size: 20, color: header ? "FFFFFF" : TEXT, bold: header })],
        spacing: { line: 260 },
      }),
    ],
  })
}

export async function createInspectionDocx(report: InspectionReport) {
  const findings = report.findings.length ? report.findings : [{
    criterion: "Критерии не внесены",
    status: "Не проверено" as const,
    evidence: "Добавьте результаты и подтверждения перед утверждением отчёта.",
  }]
  const rows = [
    new TableRow({ children: ["Критерий проверки", "Результат", "Основание / комментарий"].map((text, index) => createWordCell(text, index, true)) }),
    ...findings.map((finding, rowIndex) =>
      new TableRow({
        children: [finding.criterion, finding.status, finding.evidence].map((text, index) => createWordCell(text, index, false, rowIndex)),
      }),
    ),
  ]
  const summary = summarizeFindings(report.findings)
  const recommendations = recommendationLines(report.findings)

  const doc = new Document({
    creator: "KosmoStack · рабочий шаблон",
    title: `Отчёт о проверке ${report.number}`,
    description: "Официально оформляемый шаблон экспертной проверки. Заполните и утвердите по регламенту организации.",
    styles: {
      default: {
        document: { run: { font: FONT, size: 28, color: TEXT }, paragraph: { spacing: { line: 360 } } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: PAGE_MARGIN,
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [normalRun("Рабочий шаблон · проверьте реквизиты и источники перед подписанием", { size: 18, color: MUTED })],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          bodyParagraph("KOSMOSTACK · ПРОЕКТНЫЙ КОНТУР ВИНИТИ РАН × СФУ", { bold: true, color: NAVY, size: 20, alignment: AlignmentType.CENTER }),
          bodyParagraph("ОТЧЁТ О ПРОВЕРКЕ", { bold: true, color: NAVY, size: 32, alignment: AlignmentType.CENTER }),
          bodyParagraph(`№ ${report.number || "____________"} · ${report.date || "____________"}`, { alignment: AlignmentType.CENTER }),
          bodyParagraph("", { size: 14 }),
          bodyParagraph("1. РЕКВИЗИТЫ ПРОВЕРКИ", { bold: true, color: NAVY }),
          labeledParagraph("Номер отчёта", report.number),
          labeledParagraph("Дата", report.date),
          labeledParagraph("Организация", report.organization),
          labeledParagraph("Подразделение", report.department),
          labeledParagraph("Проверяемый объект", report.subject),
          labeledParagraph("Ответственный эксперт", report.reviewer),
          bodyParagraph("2. РЕЗУЛЬТАТЫ ПРОВЕРКИ", { bold: true, color: NAVY }),
          new Table({
            rows,
            width: { size: TABLE_WIDTHS.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
            columnWidths: TABLE_WIDTHS,
            borders: TABLE_BORDERS,
          }),
          bodyParagraph("3. СВОДКА РЕЗУЛЬТАТОВ", { bold: true, color: NAVY }),
          bodyParagraph(`Всего критериев: ${summary.total} · соответствует: ${summary["Соответствует"]} · замечание: ${summary["Замечание"]} · не проверено: ${summary["Не проверено"]}`, { bold: true, color: NAVY, size: 22 }),
          bodyParagraph(`Проверено критериев: ${summary.reviewed} из ${summary.total}. Это доля заполненных проверок, а не показатель точности модели.`, { color: MUTED, size: 20 }),
          bodyParagraph("4. ИТОГОВОЕ ЗАКЛЮЧЕНИЕ", { bold: true, color: NAVY }),
          labeledParagraph("Итоговое заключение", report.conclusion || "Не заполнено."),
          bodyParagraph("5. РЕКОМЕНДАЦИИ И СЛЕДУЮЩИЕ ДЕЙСТВИЯ", { bold: true, color: NAVY }),
          ...recommendations.map((recommendation) => bodyParagraph(`• ${recommendation}`, { size: 22 })),
          bodyParagraph("6. МЕТОДИКА И ОГРАНИЧЕНИЯ", { bold: true, color: NAVY }),
          bodyParagraph("Сверяйте извлечённые значения с указанной публикацией, страницей и таблицей. Не восстанавливайте отсутствующие сведения по догадке; неопределённость фиксируйте в основании проверки."),
          bodyParagraph("Статус «Не проверено» не является подтверждением результата. Итоговые оценки и официальные выводы требуют проверки человеком и утверждения по регламенту организации.", { color: MUTED, size: 20 }),
          bodyParagraph("7. ПОДПИСИ", { bold: true, color: NAVY }),
          bodyParagraph("Ответственный эксперт: ____________________________    Дата: ________________"),
          bodyParagraph("Утверждающее лицо: _______________________________    Дата: ________________"),
          bodyParagraph("Рабочая форма для проектного использования. Заполните реквизиты, ссылки на источники и подписи перед официальным выпуском.", { size: 18, color: MUTED }),
        ],
      },
    ],
  })

  return Packer.toBlob(doc)
}

function escapeXml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function odtParagraph(value: string, style = "Body") {
  return `<text:p text:style-name="${style}">${escapeXml(value || "—")}</text:p>`
}

function odtCell(value: string, header = false, style = "Cell") {
  return `<table:table-cell table:style-name="${header ? "HeaderCell" : style}" office:value-type="string">${odtParagraph(value, header ? "CellHeaderText" : "CellText")}</table:table-cell>`
}

export async function createInspectionOdt(report: InspectionReport) {
  const zip = new JSZip()
  zip.file("mimetype", "application/vnd.oasis.opendocument.text", { compression: "STORE" })
  const findings = report.findings.length ? report.findings : [{
    criterion: "Критерии не внесены",
    status: "Не проверено" as const,
    evidence: "Добавьте результаты и подтверждения перед утверждением отчёта.",
  }]
  const summary = summarizeFindings(report.findings)
  const recommendations = recommendationLines(report.findings)
  const findingsRows = [
    ["Критерий проверки", "Результат", "Основание / комментарий"].map((value) => odtCell(value, true)).join(""),
    ...findings.map((finding, index) =>
      [finding.criterion, finding.status, finding.evidence].map((value) => odtCell(value, false, index % 2 ? "AlternateCell" : "Cell")).join(""),
    ),
  ].map((cells) => `<table:table-row>${cells}</table:table-row>`).join("")

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3">
<office:automatic-styles>
<style:style style:name="Title" style:family="paragraph"><style:paragraph-properties fo:text-align="center" fo:margin-bottom="0.08in"/><style:text-properties style:font-name="Times New Roman" fo:font-size="16pt" fo:font-weight="bold" fo:color="#${NAVY}"/></style:style>
<style:style style:name="Subtitle" style:family="paragraph"><style:paragraph-properties fo:text-align="center" fo:margin-bottom="0.18in"/><style:text-properties style:font-name="Times New Roman" fo:font-size="11pt" fo:color="#${TEXT}"/></style:style>
<style:style style:name="Section" style:family="paragraph"><style:paragraph-properties fo:margin-top="0.14in" fo:margin-bottom="0.08in"/><style:text-properties style:font-name="Times New Roman" fo:font-size="14pt" fo:font-weight="bold" fo:color="#${NAVY}"/></style:style>
<style:style style:name="Summary" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.09in" fo:padding="0.08in" fo:background-color="#${PALE}"/><style:text-properties style:font-name="Times New Roman" fo:font-size="11pt" fo:font-weight="bold" fo:color="#${NAVY}"/></style:style>
<style:style style:name="Body" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.06in" fo:line-height="150%"/><style:text-properties style:font-name="Times New Roman" fo:font-size="14pt" fo:color="#${TEXT}"/></style:style>
<style:style style:name="Meta" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.04in" fo:line-height="150%"/><style:text-properties style:font-name="Times New Roman" fo:font-size="14pt" fo:color="#${TEXT}"/></style:style>
<style:style style:name="CellText" style:family="paragraph"><style:paragraph-properties fo:line-height="125%"/><style:text-properties style:font-name="Times New Roman" fo:font-size="10pt" fo:color="#${TEXT}"/></style:style>
<style:style style:name="CellHeaderText" style:family="paragraph"><style:paragraph-properties fo:line-height="125%"/><style:text-properties style:font-name="Times New Roman" fo:font-size="10pt" fo:font-weight="bold" fo:color="#FFFFFF"/></style:style>
<style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:background-color="#FFFFFF" fo:border="0.5pt solid #${BORDER}" fo:padding="0.08in"/></style:style>
<style:style style:name="AlternateCell" style:family="table-cell"><style:table-cell-properties fo:background-color="#${PALE}" fo:border="0.5pt solid #${BORDER}" fo:padding="0.08in"/></style:style>
<style:style style:name="HeaderCell" style:family="table-cell"><style:table-cell-properties fo:background-color="#${NAVY}" fo:border="0.5pt solid #${NAVY}" fo:padding="0.08in"/></style:style>
<style:style style:name="ReportTable" style:family="table"><style:table-properties table:align="margins"/></style:style>
<style:style style:name="ReportColumn" style:family="table-column"><style:table-column-properties style:column-width="2.8in"/></style:style>
<style:style style:name="ResultColumn" style:family="table-column"><style:table-column-properties style:column-width="1.4in"/></style:style>
<style:style style:name="EvidenceColumn" style:family="table-column"><style:table-column-properties style:column-width="5.8in"/></style:style>
</office:automatic-styles>
<office:body><office:text>
${odtParagraph("KOSMOSTACK · ПРОЕКТНЫЙ КОНТУР ВИНИТИ РАН × СФУ", "Subtitle")}
${odtParagraph("ОТЧЁТ О ПРОВЕРКЕ", "Title")}
${odtParagraph(`№ ${report.number || "____________"} · ${report.date || "____________"}`, "Subtitle")}
${odtParagraph("1. РЕКВИЗИТЫ ПРОВЕРКИ", "Section")}
${odtParagraph(`Номер отчёта: ${report.number || "Не заполнено"}`, "Meta")}
${odtParagraph(`Дата: ${report.date || "Не заполнено"}`, "Meta")}
${odtParagraph(`Организация: ${report.organization || "Не заполнено"}`, "Meta")}
${odtParagraph(`Подразделение: ${report.department || "Не заполнено"}`, "Meta")}
${odtParagraph(`Проверяемый объект: ${report.subject || "Не заполнено"}`, "Meta")}
${odtParagraph(`Ответственный эксперт: ${report.reviewer || "Не заполнено"}`, "Meta")}
${odtParagraph("2. РЕЗУЛЬТАТЫ ПРОВЕРКИ", "Section")}
<table:table table:name="Результаты проверки" table:style-name="ReportTable"><table:table-column table:style-name="ReportColumn"/><table:table-column table:style-name="ResultColumn"/><table:table-column table:style-name="EvidenceColumn"/>${findingsRows}</table:table>
${odtParagraph("3. СВОДКА РЕЗУЛЬТАТОВ", "Section")}
${odtParagraph(`Всего критериев: ${summary.total} · соответствует: ${summary["Соответствует"]} · замечание: ${summary["Замечание"]} · не проверено: ${summary["Не проверено"]}`, "Summary")}
${odtParagraph(`Проверено критериев: ${summary.reviewed} из ${summary.total}. Это доля заполненных проверок, а не показатель точности модели.`, "Body")}
${odtParagraph("4. ИТОГОВОЕ ЗАКЛЮЧЕНИЕ", "Section")}
${odtParagraph(`Итоговое заключение: ${report.conclusion || "Не заполнено."}`, "Body")}
${odtParagraph("5. РЕКОМЕНДАЦИИ И СЛЕДУЮЩИЕ ДЕЙСТВИЯ", "Section")}
${recommendations.map((recommendation) => odtParagraph(`• ${recommendation}`, "Body")).join("")}
${odtParagraph("6. МЕТОДИКА И ОГРАНИЧЕНИЯ", "Section")}
${odtParagraph("Сверяйте извлечённые значения с указанной публикацией, страницей и таблицей. Не восстанавливайте отсутствующие сведения по догадке; неопределённость фиксируйте в основании проверки.", "Body")}
${odtParagraph("Статус «Не проверено» не является подтверждением результата. Итоговые оценки и официальные выводы требуют проверки человеком и утверждения по регламенту организации.", "Meta")}
${odtParagraph("7. ПОДПИСИ", "Section")}
${odtParagraph("Ответственный эксперт: ____________________________    Дата: ________________", "Body")}
${odtParagraph("Утверждающее лицо: _______________________________    Дата: ________________", "Body")}
${odtParagraph("Рабочая форма для проектного использования. Заполните реквизиты, ссылки на источники и подписи перед официальным выпуском.", "Meta")}
</office:text></office:body></office:document-content>`

  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3"><office:font-face-decls><style:font-face style:name="Times New Roman" svg:font-family="&apos;Times New Roman&apos;" style:font-family-generic="roman" style:font-pitch="variable"/></office:font-face-decls><office:styles><style:default-style style:family="paragraph"><style:paragraph-properties fo:line-height="150%"/><style:text-properties style:font-name="Times New Roman" fo:font-size="14pt" fo:color="#${TEXT}"/></style:default-style></office:styles><office:automatic-styles><style:page-layout style:name="PageLayout"><style:page-layout-properties fo:page-width="11.69in" fo:page-height="8.27in" style:print-orientation="landscape" fo:margin-top="0.55in" fo:margin-bottom="0.55in" fo:margin-left="0.65in" fo:margin-right="0.65in"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Standard" style:page-layout-name="PageLayout"/></office:master-styles></office:document-styles>`
  const meta = `<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><dc:title>${escapeXml(`Отчёт о проверке ${report.number}`)}</dc:title><dc:creator>KosmoStack</dc:creator><dc:language>ru-RU</dc:language></office:meta></office:document-meta>`
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>`

  zip.file("content.xml", content)
  zip.file("styles.xml", styles)
  zip.file("meta.xml", meta)
  zip.folder("META-INF")?.file("manifest.xml", manifest)
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.oasis.opendocument.text" })
}
