import { queryRows } from "@/lib/db"
import { getFullAnalysis } from "@/lib/db-analysis"
import { getLocalDocument, listLocalDocuments } from "@/lib/local-documents"
import { getQualityReport } from "@/lib/quality-report"
import { readPassport } from "@/lib/official-export-data"
import { compareRagRecords } from "@/lib/rag-compare"
import { ensureRagImported, getRagResult } from "@/lib/rag-store"
import type { Area } from "@/lib/research"

import {
  isFollowUp, isOverview, namedAreas, relevantExcerpt, researchEvidence, searchWords, topicWords, uploadedEvidence,
  type AssistantSource,
} from "@/lib/assistant-retrieval"
const navText = "Каталог RAG: поиск, фильтры, выбор двух записей, источники и пакет из семи CSV. Страницы публикаций: PDF и извлечённый текст. Сравнение: выберите пару, сайт покажет вердикт и условия. Очередь проверки: решения и история. Загрузка и анализ PDF: извлечение текста, OCR, результаты и протокол. Паспорт: поля научной схемы. Проверки и метрики: отчёт качества. Кнопка «Экспорт» предлагает DOCX, ODT, CSV и PDF для анализа, метрик, паспорта и сравнения, а под ответом ассистента есть «Скачать ответ». В каталогах Solar, RAG и Космос доступны поиск по тегам, первоисточники, перевод цитат и BibTeX."

async function resultEvidence(ids: string[]) {
  return (await Promise.all(ids.map(async (key): Promise<AssistantSource | null> => {
    const result = await getRagResult(key)
    if (!result) return null
    const r = result.record
    return {
      title: r.id + " · " + (r.metricName ?? r.paperTitle), url: r.sourcePdfUrl + "#page=" + r.page,
      text: JSON.stringify({ value: r.rawValue, unit: r.sourceRow.raw_unit || r.metricUnit, normalizedValue: r.normalizedValue,
        metricK: r.metricK, dataset: r.dataset, configuration: r.configuration, protocol: r.protocol,
        quote: r.sourceFragment, status: r.sourceVerificationStatus }),
    }
  }))).filter((source): source is AssistantSource => source !== null)
}

export async function assistantSources(input: {
  question: string; area?: Area; view: string; documentId?: string; previousQuestion?: string; extraTerms?: string[]
}) {
  const { question, area, view, previousQuestion = "", extraTerms } = input
  const explicitAreas = namedAreas(question)
  const followUp = isFollowUp(question)
  const previousAreas = followUp ? namedAreas(previousQuestion) : []
  const scoped = explicitAreas.length > 0 ? explicitAreas : previousAreas
  const terms = topicWords(followUp ? question + " " + previousQuestion : question)
  const overview = isOverview(question) || (followUp && isOverview(previousQuestion))
  const ids = [...new Set(question.toUpperCase().match(/\bD[0-9]{3}\/R[0-9]{3,}\b/gu) ?? [])].slice(0, 2)
  const corpusIds = ids.length ? [] : [...new Set((followUp ? question + " " + previousQuestion : question).toUpperCase().match(/\bD[0-9]{3}\b/gu) ?? [])].slice(0, 2)
  const uploadQuestion = /pdf|загруз|файл|ocr/iu.test(question)
  const howTo = /(?:^|[^\p{L}])(?:как\s+(?:откры|экспорт|выгруз|скача|загру|найти раздел|перейти|сравни)|где\s+(?:найти|открыть|посмотреть))/iu.test(question)
  const passportQuestion = /паспорт[ауеом]*\s+данных/iu.test(question) || view === "passport" && !scoped.length
  const reviewQuestion = /очеред[ьи]\s+проверк|открыты[хе]\s+замечани/iu.test(question) || view === "review" && !scoped.length
  const siteReport = /отч[её]т\s+качества|проверки\s+и\s+метрики/iu.test(question)
  const researchAreas: Area[] = scoped.length ? scoped : area ? [area] : corpusIds.length ? ["solar", "rag"] : ["space", "solar", "rag"]
  let documentId = input.documentId
  const sources: AssistantSource[] = []
  let knowledgeCount = 0
  if (!documentId && uploadQuestion && !howTo && !corpusIds.length && !scoped.length) {
    const documents = await listLocalDocuments()
    const fold = (text: string) => text.toLowerCase().normalize("NFKC")
    const named = documents.find((document) => fold(question).includes(fold(document.name)))
    if (named) documentId = named.id
    else if (/последн|свежезагруж|только что/iu.test(question) || documents.length === 1) documentId = documents[0]?.id
  }
  if (ids.length === 2) {
    const verdict = await compareRagRecords(ids[0], ids[1]).catch(() => null)
    if (verdict) sources.push({ title: `Сравнение ${ids.join(" и ")}`, url: "/?view=compare&area=rag",
      text: JSON.stringify({ pair: ids, status: verdict.status, differences: verdict.differences, missing: verdict.missing, change: verdict.change }) })
  }
  if (ids.length) sources.push(...await resultEvidence(ids))
  const metricNames = searchWords(terms).filter((term) => /^(?:recall|precision|accuracy|ndcg|mrr|f1|latency|bleu|rouge|map|em)$/iu.test(term))
  const metricIntent = metricNames.length > 0 || (corpusIds.length > 0 && /метрик|результат|значени/iu.test(question))
  if (!documentId && !ids.length && !howTo && !siteReport && !passportQuestion && researchAreas.includes("rag") && metricIntent) {
    await ensureRagImported()
    const depth = /@\s*(\d{1,6})/u.exec(question)?.[1] ?? null
    const rows = await queryRows<{ id: string }>(`
      SELECT p.corpus_id || '/' || split_part(r.id,'/',4) AS id
      FROM results r JOIN publications p ON p.id=r.publication_id
      WHERE p.domain='rag' AND p.split='dev'
        AND (cardinality($1::text[])=0 OR p.corpus_id=ANY($1::text[]))
        AND (cardinality($2::text[])=0 OR to_tsvector('simple',lower(r.metric_name)) @@ to_tsquery('simple',array_to_string($2::text[],' | ')))
        AND ($3::int IS NULL OR r.metric_k=$3)
      ORDER BY (r.extraction_status='extracted') DESC,(r.review_status='verified') DESC,r.id LIMIT 4`,
    [corpusIds, metricNames, depth])
    sources.push(...await resultEvidence(rows.map((row) => row.id)))
  }
  knowledgeCount = sources.length
  if (documentId) {
    const document = await getLocalDocument(documentId)
    if (!document) throw new Error("Выбранный PDF не найден.")
    const data = await getFullAnalysis(documentId)
    const url = `/api/documents/${encodeURIComponent(documentId)}`
    if (!data?.pages.length) sources.push({ title: document.name, url: url + "/file",
      text: "PDF загружен. Готового анализа в базе пока нет. Проверьте состояние на вкладке загрузки." })
    else {
      const counts = new Map<string, number>()
      for (const item of data.allCandidates) if (item.metricName) counts.set(item.metricName, (counts.get(item.metricName) ?? 0) + 1)
      sources.push({ title: "Протокол · " + document.name, url: url + "/report", text: JSON.stringify({
        статус: data.publication.processing_status, страницВсего: data.publication.page_count,
        страницОбработано: data.pages.filter((p) => p.status !== "skipped" && p.status !== "error").length, ocr: data.pages.filter((p) => p.extractionMethod === "ocr").length,
        pageErrors: data.pages.filter((p) => p.error).map((p) => ({ page: p.page, error: p.error })).slice(0, 10),
        numericCandidates: data.totalCandidates, classifiedCandidates: data.classifiedCandidates,
        metrics: [...counts],
        sampleCandidates: data.allCandidates.filter((item) => item.metricName).slice(0, 8)
          .map((item) => ({ metric: item.metricName, value: item.rawValue, unit: item.unit, page: item.page })),
      }) })
      const search = searchWords([...terms, ...(extraTerms ?? [])])
      const countWords = (text: string) => {
        const lower = text.toLowerCase()
        return search.filter((term) => lower.includes(term)).length
      }
      const countOnly = /сколько страниц|количество страниц|статус анализа/iu.test(question)
      const pages = data.pages.filter((page) => page.text)
      const ranked = [...pages].sort((a, b) => countWords(b.text) - countWords(a.text))
      const conclusion = [...pages].reverse().find((page) =>
        /(?:^|\n|\s)(?:conclusions?|заключение|выводы)(?:\s|:)/iu.test(page.text) && page.text.length > 400)
      const relevant = countOnly ? [] : [...new Set(
        overview || !search.length ? [pages[0], ...ranked.filter((page) => countWords(page.text) > 0).slice(0, 2), conclusion, ...pages] :
          [...ranked.filter((page) => countWords(page.text) > 0).slice(0, 3), pages[0], conclusion, ...pages],
      )].filter((page): page is (typeof data.pages)[number] => Boolean(page)).slice(0, 5)
      for (const p of relevant) sources.push({ title: `${document.name} · стр. ${p.page}`, url: url + "/file#page=" + p.page,
        text: (p.extractionMethod === "ocr" ? "Текст OCR. " : "Текст PDF. ") + relevantExcerpt(p.text, p === conclusion ? ["conclusion", "заключение", "выводы", ...search] : search, 1100) })
    }
    knowledgeCount = sources.length
  } else if (!ids.length && !howTo && !siteReport && !passportQuestion && !reviewQuestion && (scoped.length || view !== "reports")) {
    const broad = Boolean(corpusIds.length) || (overview && !terms.length) || (scoped.length > 0 && !terms.length)
    const [research, uploads] = await Promise.all([
      uploadQuestion && scoped.length === 0 && !corpusIds.length ? [] :
        researchEvidence({ areas: researchAreas, terms, broad, ids: corpusIds, extraTerms }),
      !corpusIds.length && (uploadQuestion || !area && !scoped.length) ? uploadedEvidence([...terms, ...(extraTerms ?? [])]) : [],
    ])
    sources.push(...(uploadQuestion ? [...uploads, ...research] : [...research, ...uploads]))
    knowledgeCount = sources.length
  }
  if (!documentId && (!scoped.length || uploadQuestion) && (view === "runs" || view === "reports" || /pdf|загруз|файл|ocr/iu.test(question))) {
    const docs = await queryRows<{ filename: string; page_count: number; processing_status: string; ocr: number; candidates: number }>(`
      SELECT p.filename,p.page_count,p.processing_status,
        (SELECT count(*)::int FROM pages WHERE publication_id=p.id AND extraction_method='ocr') AS ocr,
        (SELECT count(*)::int FROM numeric_candidates WHERE publication_id=p.id) AS candidates
      FROM publications p WHERE p.corpus_id IS NULL AND p.id NOT LIKE 'private-%' ORDER BY p.updated_at DESC LIMIT 8`)
    if (docs.length) sources.unshift({ title: "Протоколы последних PDF", url: "/?view=runs", text: JSON.stringify(docs) })
  }
  if (!documentId && (siteReport || !scoped.length && (!area || area === "rag") && (view === "reports" || /отч[её]т|качеств[оеау]\s+(?:корпус|извлечен)|оценк[аиу]\s+по\s+эталону/iu.test(question)))) {
    const report = await getQualityReport()
    sources.unshift({ title: "Отчёт качества RAG dev", url: "/?view=reports&area=rag", text: JSON.stringify({
      status: report.status, counts: report.counts, foundQuotes: report.localValidation.foundQuotes,
      visualChecks: report.localValidation.visualChecks, unknownScale: report.localValidation.unknownScale,
      assessment: report.evaluation.metrics, assessmentStatus: report.evaluation.status, review: report.sourceReview,
    }) })
  }
  if (!documentId && !ids.length && !corpusIds.length && passportQuestion) {
    const passport = readPassport()
    const tables = [...new Set(passport.fields.map((field) => field.table))]
    const fields = passport.fields.filter((field) => terms.some((term) => field.name.includes(term)))
    sources.unshift({
      title: "Паспорт научных данных", url: "/?view=passport&area=rag",
      text: JSON.stringify({ version: passport.version, fieldCount: passport.fields.length, tables,
        fields: fields.slice(0, 6), purpose: "Паспорт фиксирует состав, смысл, типы, кратность и правила заполнения полей семи CSV корпуса RAG." }),
    })
  }
  if (!documentId && !ids.length && !corpusIds.length && reviewQuestion) {
    await ensureRagImported()
    const [counts, items] = await Promise.all([
      queryRows("SELECT i.status,count(*)::int AS count FROM issues i JOIN publications p ON p.id=i.publication_id WHERE p.domain='rag' AND p.split='dev' GROUP BY i.status"),
      queryRows(`SELECT p.corpus_id AS publication,i.check_name,i.description,i.page_number FROM issues i
        JOIN publications p ON p.id=i.publication_id WHERE p.domain='rag' AND p.split='dev' AND i.status='open'
        ORDER BY i.id LIMIT 4`),
    ])
    sources.unshift({ title: "Очередь проверки источников RAG", url: "/?view=review&area=rag", text: JSON.stringify({ counts, examples: items }) })
  }
  if (!sources.length || howTo || view === "reports") {
    sources.push({ title: "Разделы KosmoStack", url: uploadQuestion ? "/?view=runs" : area ? "/research/" + area : "/", text: navText })
  }
  return { sources: sources.slice(0, 9), needsTranslation: knowledgeCount === 0 && sources.length === 1 && !howTo && !siteReport && !passportQuestion && !reviewQuestion && !ids.length && !corpusIds.length && terms.some((term) => /[а-яё]/iu.test(term)) }
}
