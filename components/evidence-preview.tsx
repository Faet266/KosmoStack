"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { TranslateExcerpt } from "@/components/translate-excerpt"
import { ArrowDownToLine, ExternalLink, Eye, FileText, ScanLine, X, ZoomIn } from "lucide-react"
import { extractionStatusLabel, metricLabel, recordValue, reviewStatusLabel, sourceMethodLabel, type ResultRecord, type SourceBbox } from "@/lib/result-data"

type EvidencePreviewProps = {
  record: ResultRecord | null
  loading?: boolean
  sourceConnected: boolean
  onClose: () => void
  onToast: (message: string) => void
}

type ImageRegion = { id: string; label: string; bbox: SourceBbox; className: string }
type SourcePageResponse = { fragments?: Array<{ fragment_id: string; bbox?: unknown }> }

async function sourcePageFetcher(url: string): Promise<SourcePageResponse> {
  const response = await fetch(url, { cache: "no-store" })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error ?? "Не удалось загрузить фрагменты страницы.")
  return payload as SourcePageResponse
}

function asBbox(value: unknown): SourceBbox | null {
  if (!Array.isArray(value) || value.length !== 4) return null
  const values = value.map(Number)
  return values.every(Number.isFinite) ? values as SourceBbox : null
}

function unionBboxes(boxes: SourceBbox[]): SourceBbox | null {
  if (!boxes.length) return null
  return [Math.min(...boxes.map((box) => box[0])), Math.min(...boxes.map((box) => box[1])), Math.max(...boxes.map((box) => box[2])), Math.max(...boxes.map((box) => box[3]))]
}

function bboxToImageStyle(bbox: SourceBbox, matrix: ResultRecord["sourcePixelToPdfMatrix"], size: ResultRecord["sourceImageSize"]) {
  if (!matrix || !size) return null
  const [a, b, c, d, e, f] = matrix
  const determinant = a * d - b * c
  if (Math.abs(determinant) < 1e-9) return null
  const [x0, y0, x1, y1] = bbox
  const points = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([pdfX, pdfY]) => {
    const x = pdfX - e
    const y = pdfY - f
    return [(d * x - c * y) / determinant, (-b * x + a * y) / determinant]
  })
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const width = Math.max(...xs) - left
  const height = Math.max(...ys) - top
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  return { left: `${left / size[0] * 100}%`, top: `${top / size[1] * 100}%`, width: `${width / size[0] * 100}%`, height: `${height / size[1] * 100}%` }
}

function cropAround(box: NonNullable<ReturnType<typeof bboxToImageStyle>>, [imageWidth, imageHeight]: NonNullable<ResultRecord["sourceImageSize"]>) {
  const [x, y, w, h] = [box.left, box.top, box.width, box.height].map((value) => Number.parseFloat(value) / 100)
  if (x < 0 || y < 0 || x + w > 1 || y + h > 1) return null
  const width = Math.min(1, Math.max(.28, w * 2.1))
  const height = Math.min(1, Math.max(.12, h * 2.1, width * imageWidth / (imageHeight * 2.6)))
  const left = Math.min(1 - width, Math.max(0, x + w / 2 - width / 2))
  const top = Math.min(1 - height, Math.max(0, y + h / 2 - height / 2))
  return {
    frame: { aspectRatio: (width * imageWidth) / (height * imageHeight) },
    image: { left: `${-left / width * 100}%`, top: `${-top / height * 100}%`, width: `${100 / width}%`, height: `${100 / height}%` },
    highlight: {
      left: `${(x - left) / width * 100}%`, top: `${(y - top) / height * 100}%`,
      width: `${w / width * 100}%`, height: `${h / height * 100}%`,
    },
  }
}

function verificationLabel(status: string | null) {
  if (status === "verified") return "Подтверждено при сверке источника"
  if (status === "needs_review") return "Нужна визуальная проверка"
  if (status === "unverified") return "Не подтверждено вручную"
  return "Статус сверки не указан"
}

export function EvidencePreview({ record, loading, sourceConnected, onClose, onToast }: EvidencePreviewProps) {
  const [showContext, setShowContext] = useState(false)
  const [viewMode, setViewMode] = useState<"page" | "text">("page")
  const [zoom, setZoom] = useState(false)
  const [imageUnavailable, setImageUnavailable] = useState(false)

  useEffect(() => {
    if (!record) return
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [record, onClose])

  const sourcePageKey = record && sourceConnected && showContext && record.sourcePageUrl && record.sourceRowFragmentIds.length ? record.sourcePageUrl : null
  const { data: sourcePage, error: sourcePageError, isLoading: isLoadingSourcePage } = useSWR(sourcePageKey, sourcePageFetcher, { revalidateOnFocus: false })
  const sourceRowFragmentIds = new Set(record?.sourceRowFragmentIds ?? [])
  const fragmentsRowBbox = sourcePage?.fragments
    ? unionBboxes(sourcePage.fragments.filter((fragment) => sourceRowFragmentIds.has(fragment.fragment_id)).map((fragment) => asBbox(fragment.bbox)).filter((value): value is SourceBbox => value !== null))
    : null
  const sourceRowBbox = record?.sourceRowBbox ?? fragmentsRowBbox

  const regions = useMemo<ImageRegion[]>(() => {
    if (!record) return []
    const value = record.sourceBbox ? [{ id: "value", label: record.sourceEvidenceStatus === "visual_region" ? "Область на скане" : "Значение", bbox: record.sourceBbox, className: "is-value" }] : []
    if (!showContext) return value
    const row = sourceRowBbox ? [{ id: "row", label: "Строка из связанных page fragments", bbox: sourceRowBbox, className: "is-row" }] : []
    const headers = record.sourceHeaders.flatMap((header, index) => header.bbox ? [{ id: `header-${index}`, label: header.text ?? `Заголовок ${index + 1}`, bbox: header.bbox, className: "is-header" }] : [])
    return [...row, ...headers, ...value]
  }, [record, showContext, sourceRowBbox])

  if (!record) return null

  const hasEvidence = record.extractionStatus === "extracted" && Boolean(record.sourceFragment)
  const hasPdf = Boolean(record.sourcePdfUrl)
  const showPageImage = Boolean(sourceConnected && record.sourceImageUrl && !imageUnavailable)
  const box = record.sourceBbox && bboxToImageStyle(record.sourceBbox, record.sourcePixelToPdfMatrix, record.sourceImageSize)
  const focus = box && record.sourceImageSize && cropAround(box, record.sourceImageSize)
  const overlays = regions.map((region) => ({ ...region, style: bboxToImageStyle(region.bbox, record.sourcePixelToPdfMatrix, record.sourceImageSize) }))
  const canRenderOverlay = overlays.length > 0 && overlays.every((region) => region.style !== null)
  const exportEvidence = () => {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, sourceProfile: "rag-domain-1.1", record }, null, 2)], { type: "application/json;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${record.id.replace("/", "-")}-evidence.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    onToast("Метаданные записи и доказательства сохранены в JSON.")
  }

  return <div className="modal-backdrop evidence-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="evidence-dialog" role="dialog" aria-modal="true" aria-labelledby="evidence-title">
      <header className="evidence-dialog-header"><div className="evidence-title-group"><span className="evidence-icon"><FileText aria-hidden="true" /></span><div><span className="eyebrow">ИСТОЧНИК · {record.publicationId}</span><h2 id="evidence-title">Доказательство · {record.id}</h2></div></div><div className="evidence-head-actions"><button type="button" className="secondary-button compact" disabled={loading} onClick={exportEvidence}><ArrowDownToLine aria-hidden="true" /> Экспорт JSON</button><button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть доказательство"><X /></button></div></header>

      {loading ? <p className="ws-evidence-loading" role="status">Загружаем доказательство…</p> : <div className="evidence-layout"><aside className="evidence-details">
        <div className="evidence-status"><span className={`status-dot status-${record.reviewStatus === "verified" ? "verified" : record.reviewStatus === "pending" ? "pending" : "unreviewed"}`} />{reviewStatusLabel(record.reviewStatus)} · {record.origin === "cited" ? "Cited" : record.origin === "primary" ? "Primary" : "Не классифицировано"}</div>
        <h3>{metricLabel(record)}</h3><p className="evidence-subtext">{record.paperTitle}</p>
        {!record.metricUnit && <p className="source-note" role="status">Единица или шкала неизвестна. Сравнение чисел недоступно.</p>}
        <div className="evidence-value-card"><span>Исходное значение</span><strong>{recordValue(record)}</strong>{record.normalizedValue !== null && <small>Нормализовано: {record.normalizedValue}{record.normalizedUnit ? ` ${record.normalizedUnit}` : ""}</small>}</div>
        <dl className="evidence-meta"><div><dt>Публикация</dt><dd>{record.publicationId}{record.year ? ` · ${record.year}` : ""}</dd></div><div><dt>DOI</dt><dd>{record.doi ?? "Не указан"}</dd></div><div><dt>Страница PDF</dt><dd>{record.page ?? "Не установлена"}</dd></div><div><dt>Система</dt><dd>{record.model ?? "Не указана"}</dd></div><div><dt>Набор · задача</dt><dd>{[record.dataset, record.task].filter(Boolean).join(" · ") || "Не указаны"}</dd></div><div><dt>Протокол</dt><dd>{record.protocol ?? "Не указан"}</dd></div><div><dt>Конфигурация</dt><dd>{record.configuration ?? "Не указана"}</dd></div><div><dt>Retriever · generator · embedding</dt><dd>{[record.retriever, record.generator, record.embedding].filter(Boolean).join(" · ") || "Не указаны"}</dd></div><div><dt>Версия и разбиение набора</dt><dd>{[record.datasetVersion, record.split].filter(Boolean).join(" · ") || "Не указаны"}</dd></div><div><dt>Направление · размер выборки</dt><dd>{[record.metricDirection, record.sampleSize].filter((value) => value != null).join(" · ") || "Не указаны"}</dd></div><div><dt>Покрытие · сверка цитаты</dt><dd>{record.coverageStatus === "partial" ? "Частичное" : "Не установлено"} · {record.quoteStatus === "found_in_cached_page" ? "Цитата найдена в кеше" : record.quoteStatus === "needs_visual_review" ? "Нужна визуальная сверка" : "Совпадение не проверено"}</dd></div><div><dt>Замечания</dt><dd>{record.issueIds.join(", ") || "Нет связанных замечаний"}</dd></div><div><dt>Агрегация</dt><dd>{record.aggregation ?? "Не указана"}</dd></div><div><dt>Глубина поиска top_k</dt><dd>{record.topK ?? "Не указана"}</dd></div><div><dt>Раздел · таблица</dt><dd>{[record.section, record.table, record.figure].filter(Boolean).join(" · ") || "Не указаны"}</dd></div><div><dt>Метод извлечения</dt><dd>{sourceMethodLabel(record.extractionMethod)}</dd></div><div><dt>Сверка</dt><dd>{verificationLabel(record.sourceVerificationStatus)}</dd></div><div><dt>Публикация результата</dt><dd>{record.origin === "cited" ? `Цитируемый: ${record.sourceRow.cited_publication_id || "источник цитаты не указан"}` : record.origin === "primary" ? "Первичный результат статьи" : "Автоматически не классифицировано"}</dd></div><div><dt>Документ корпуса</dt><dd>{record.sourceDocumentId ?? "Не привязан"}</dd></div><div><dt>Фрагмент</dt><dd>{record.sourceRef ?? "Ссылка на фрагмент отсутствует"}</dd></div><div><dt>bbox · PDF points</dt><dd>{record.sourceBbox?.join(", ") ?? "Координаты значения не переданы"}</dd></div><div><dt>Система координат</dt><dd>{record.sourceCoordinateSystem ?? "Не передана"}</dd></div></dl>

        <div className="evidence-chain"><span className="eyebrow">ИСХОДНОЕ → НОРМАЛИЗОВАННОЕ</span><div className="chain-step"><span>01</span><div><strong>Raw value</strong><code>{record.rawValue ?? "Не указано"}{record.sourceRow.raw_unit ? ` ${record.sourceRow.raw_unit}` : ""}</code></div></div><div className="chain-step"><span>02</span><div><strong>Правило</strong><p>{record.normalizationRule ?? "Правило преобразования не передано в приложенном снимке."}</p></div></div><div className="chain-step"><span>03</span><div><strong>Normalized</strong><code>{record.normalizedValue ?? "Не нормализовано"}{record.normalizedUnit ? ` ${record.normalizedUnit}` : ""}</code></div></div></div>
      </aside>

      <div className="source-panel"><div className="source-toolbar"><div><strong>Источник</strong><span>{record.page ? `PDF · страница ${record.page}` : "Страница не определена"} · {record.table ?? record.blockType ?? "фрагмент"}</span></div><div className="source-toggle" role="group" aria-label="Режим просмотра источника"><button type="button" className={viewMode === "page" ? "selected" : ""} onClick={() => setViewMode("page")}><Eye aria-hidden="true" /> Оригинал</button><button type="button" className={viewMode === "text" ? "selected" : ""} onClick={() => setViewMode("text")}><ScanLine aria-hidden="true" /> Фрагмент</button></div></div>
        <div className="source-bbox"><span>Способ · статус чтения</span><code>{sourceMethodLabel(record.extractionMethod)} · {verificationLabel(record.sourceVerificationStatus)}</code></div>
        {showPageImage && focus && viewMode === "page" && <div className="ws-actions">
          <button type="button" className="ws-button" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>
            <ZoomIn aria-hidden="true" /> {zoom ? "Скрыть увеличенный фрагмент" : "Увеличить выделение"}
          </button>
        </div>}
        {showPageImage && focus && zoom && viewMode === "page" && <figure>
          <div className="ws-proof-crop" style={focus.frame}>
            <img src={record.sourceImageUrl!} alt={`Увеличенный фрагмент страницы ${record.page}`} style={focus.image} />
            <span className="source-highlight is-value" style={focus.highlight} aria-hidden="true" />
          </div>
          <figcaption className="ws-proof-caption">{record.sourceEvidenceStatus === "visual_region" ? "Область для визуальной сверки" : "Фрагмент со значением"} · стр. {record.page}</figcaption>
        </figure>}
        <div className="source-workspace">
          {viewMode === "page" ? showPageImage ? <div className="source-page-frame"><div className="source-page-image-wrap"><img src={record.sourceImageUrl ?? undefined} alt={`Оригинальная страница ${record.page ?? ""} PDF ${record.publicationId}`} onError={() => setImageUnavailable(true)} />{canRenderOverlay && overlays.map((region) => region.style && <span key={region.id} className={`source-highlight ${region.className}`} style={region.style} aria-label={region.label} title={region.label} />)}</div></div> : hasPdf ? <div className="source-page-frame"><iframe className="source-pdf-embed" src={`${record.sourcePdfUrl}#page=${record.page ?? 1}`} title={`PDF ${record.paperTitle}, страница ${record.page ?? 1}`} /></div> : <div className="source-unavailable" role="status"><div className="empty-icon"><FileText aria-hidden="true" /></div><h3>{sourceConnected ? "Страница не найдена в source run" : "Источник недоступен"}</h3><p>{sourceConnected ? "API доступен, но изображение этой страницы отсутствует или не прошло проверку целостности." : "Для этой записи не удалось загрузить оригинал."}</p><p>Цитата и координаты ниже взяты из настоящих метаданных участника 2; они не заменяют оригинал.</p>{record.sourcePageUrl && <code>{record.sourcePageUrl}</code>}</div> : <div className="ocr-fragment"><div className="ocr-label"><ScanLine aria-hidden="true" /> Фрагмент выгрузки</div>{hasEvidence ? <blockquote>{record.sourceFragment}</blockquote> : <p>В снимке нет подтверждённой цитаты. Пустое значение не трактуется как 0.</p>}{record.sourceRecognizedText && <p>Распознавание OCR: <code>{record.sourceRecognizedText}</code></p>}{(record.extractionMethod === "ocr" || record.sourceEvidenceStatus === "visual_region") && <div className="unreadable-callout">OCR — гипотеза распознавания; требуется визуальная проверка по оригинальному изображению.</div>}{record.sourceVerificationStatus === "unverified" && <div className="unreadable-callout">Фрагмент помечен как непроверенный. Не трактуйте его как подтверждённую цитату.</div>}</div>}
        </div>
        {viewMode === "text" && record.sourceFragment && <TranslateExcerpt text={record.sourceFragment} />}
        <div className="source-bottom"><span><span className={`status-dot ${sourceConnected ? "status-extracted" : "status-pending"}`} />{showPageImage ? "Изображение оригинальной страницы" : hasPdf ? "Оригинал PDF" : "Оригинал недоступен"}</span><div className="source-bottom-actions">{viewMode === "page" && showPageImage && <button type="button" className="text-button" onClick={() => { const next = !showContext; setShowContext(next); onToast(next ? "Показаны доступные bbox значения, строки и заголовков." : "Оставлена подсветка значения.") }} disabled={!record.sourcePixelToPdfMatrix || !record.sourceImageSize || (!record.sourceRowBbox && !record.sourceRowFragmentIds.length && !record.sourceHeaders.some((header) => header.bbox))}><ScanLine aria-hidden="true" />{showContext ? "Только значение" : "Показать строку и заголовки"}</button>}{showPageImage && record.sourceImageUrl && <a className="text-button" href={record.sourceImageUrl} target="_blank" rel="noreferrer">Увеличить страницу</a>}{record.sourcePdfUrl && <a className="text-button" href={`${record.sourcePdfUrl}#page=${record.page ?? 1}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> Открыть PDF</a>}</div></div>
        {viewMode === "page" && showContext && isLoadingSourcePage && <div className="source-note">Загружаю page fragments, чтобы выделить исходную строку…</div>}
        {viewMode === "page" && showContext && sourcePageError && <div className="source-note">Связанные page fragments недоступны; исходное значение и переданные заголовки остаются показанными.</div>}
        {viewMode === "page" && showContext && !isLoadingSourcePage && !sourcePageError && !sourceRowBbox && !record.sourceHeaders.some((header) => header.bbox) && <div className="source-note">В source run нет bbox строки или заголовков; подсветка ограничена ячейкой значения.</div>}
        {viewMode === "page" && record.sourceBbox && !record.sourcePixelToPdfMatrix && <div className="source-note">Bbox указана в PDF points, но матрица преобразования пикселей отсутствует; подсветка не вычисляется приблизительно.</div>}
        {viewMode === "page" && record.sourceBbox && record.sourcePixelToPdfMatrix && !record.sourceImageSize && <div className="source-note">Размер изображения страницы не передан; подсветка по координатам недоступна.</div>}
        {!hasEvidence && <div className="source-note">Для этого значения нет пригодного source fragment. Статус: {extractionStatusLabel(record.extractionStatus)}.</div>}
      </div></div>}
    </section>
  </div>
}
