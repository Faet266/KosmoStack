import { queryRows } from "@/lib/db"
import { areas, type Area } from "@/lib/research"

export type AssistantSource = { title: string; url: string; text: string }
export const clip = (text: string, size: number) => text.replace(/\s+/gu, " ").trim().slice(0, size)

const areaMentions: Record<Area, RegExp> = {
  space: /(?:^|[^\p{L}])(?:космос\p{L}*|космическ\p{L}*|space)(?!\p{L})/iu,
  solar: /(?:^|[^\p{L}])(?:solar|тонкопл[её]ночн\p{L}*|солнечн\p{L}+\s+(?:элемент|батаре|панел)\p{L}*)(?!\p{L})/iu,
  rag: /(?:^|[^\p{L}])(?:rag|retrieval.augmented generation|поиск\p{L}*\s+по\s+документ\p{L}*)(?!\p{L})/iu,
}
export function namedAreas(question: string) {
  return (Object.keys(areas) as Area[]).filter((key) => areaMentions[key].test(question))
}

const generic = /^(?:како[йяеюгм]|каки[хем]|котор|космос|космическ|интерес|порекоменд|рекоменд|материал|публикаци|стать|исследован|област|раздел|мнени|расскаж|объясн|найди|изуч|счита|выбер|выбр|стоит|сам(?!пл)|тво|ваш|мо[йяеюг]|топ|лучш|нов[оы]|сравн|подроб|прочита|почему|посовет|важн|доклад|тем[аеуы]|работ[аеуы]|файл|документ|загруз|отч[её]т|анализ|откры|проект|сайт|покаж|тонкопл|explain|which|interesting|recommend|article|research|paper|material)/iu
const stop = new Set("из на во об от до без по со за не но же ли мы вы у да чем что кто где чего там именно эта эту этой таком смысл плюсы плюсом такое какой сколько это или для по как разница данные зачем есть этот более про при наши нас один два три его её ее ней них она они оно для кто чтобы сразу сначала сейчас пожалуйста мнение космос solar rag space pdf show find compare what where this that from the about are and for how best you would".split(" "))
export const words = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]+/gu) ?? []).slice(0, 200)
export const topicWords = (text: string) => [...new Set(words(text).filter((word) => !stop.has(word) && !generic.test(word)))].slice(0, 14)
export const isFollowUp = (text: string) => /^(?:а\s+)?(?:почему|подробнее|расскажи (?:ещ[её]|об этом)|что (?:в ней|в н[её]м|это значит)|чем (?:он[аи]?|это)|как (?:они|это)|а что насч[её]т|продолжи)/iu.test(text.trim())
export const isOverview = (text: string) => /интерес|порекоменду|посовет|лучши|выбери|выбрать|обзор|что почитать|что прочитать|про что|о ч[её]м|рекомендац|recommend|most interesting|summary|summariz/iu.test(text)

const translations: Array<[RegExp, string]> = [
  [/агровольтаик/u,"agrivoltaics agrivoltaic"], [/сельск|сельхоз/u,"agriculture farming crops"],
  [/урожа/u,"crop yield harvest"], [/орошен|полив|водопотреб|влаг|воды|вода/u,"irrigation water moisture"],
  [/томат|помидор/u,"tomato tomatoes"], [/перец|перц/u,"pepper peppers"],
  [/затен|тен[ьиь]/u,"shade shading"], [/микроклимат/u,"microclimate"], [/опыл/u,"pollinators pollination"],
  [/энергетик|генерац/u,"generation energy"], [/мини-сет/u,"minigrid microgrid"],
  [/экзопланет/u, "exoplanet"], [/атмосфер/u, "atmosphere"], [/спектроскоп/u, "spectroscopy"],
  [/юпитер|^европ[аеуы]/u, "europa"], [/марс/u, "mars"], [/луна|^лун[еуы]|лунн/u, "moon lunar"],
  [/уэбб|вебб/u, "jwst webb"], [/персеверанс/u, "perseverance"], [/артемид/u, "artemis"],
  [/земл[еиюя]/u, "earth"], [/биосигнатур/u, "biosignature"], [/пригодност|обитаем/u, "habitability"],
  [/океан/u, "ocean"], [/лед|льд|лёд/u, "ice icy"], [/выброс|шлейф|гейзер/u, "plume"],
  [/телескоп/u, "telescope"], [/образц/u, "sample"], [/пожар/u, "fire burn"], [/геолог/u, "geology"],
  [/перовскит/u, "perovskite"], [/кестерит/u, "kesterite"], [/эффективност|^кпд/u, "efficiency pce"],
  [/стабил|деградац/u, "stability degradation"], [/точност/u, "precision accuracy"], [/полнот/u, "recall"],
  [/переранжир/u, "reranking"], [/галлюцинац/u, "hallucination"], [/задержк/u, "latency"],
  [/эмбеддинг/u, "embedding"], [/гибрид/u, "hybrid"], [/изотоп/u, "isotope isotopologue"],
]
export function searchWords(terms: string[]) {
  return [...new Set(terms.flatMap((term) => [term, ...translations.flatMap(([pattern, synonyms]) => pattern.test(term) ? synonyms.split(" ") : [])]))].slice(0, 30)
}

export function relevantExcerpt(body: string, terms: string[], limit: number) {
  const clean = body.replace(/\s+/gu, " ").trim()
  if (clean.length <= limit) return clean
  const lower = clean.toLowerCase()
  const matches = terms.flatMap((term) => {
    const at = lower.indexOf(term)
    return at < 0 ? [] : [at]
  })
  const location = matches.sort((a, b) => a - b)
    .sort((a, b) => locationScore(b) - locationScore(a))[0] ?? 0
  function locationScore(offset: number) {
    return matches.filter((match) => match >= offset - 110 && match < offset + limit - 160).length
  }
  const start = location > 170 ? clean.lastIndexOf(" ", location - 125) + 1 : 0
  const end = clean.lastIndexOf(" ", start + limit)
  return (start ? "…" : "") + clean.slice(start, end > start ? end : start + limit) + "…"
}

type ResearchHit = {
  area: Area; article_id: string; title: string; year: number | null; provider: string; body: string
  source_url: string; location: string; page: number | null; score: number; tags: string[]
}

const spaceTopics: Array<[RegExp, string]> = [
  [/exoplanet|jwst|james webb/u, "exoplanets"],
  [/europa|jupiter/u, "europa"],
  [/perseverance|jezero|mars|martian/u, "mars"],
  [/artemis|lunar|\bmoon\b/u, "moon"],
  [/landsat|earth observation|remote sensing/u, "earth"],
]

function primaryTopic(row: ResearchHit) {
  if (row.area === "space") return spaceTopics.find(([pattern]) => pattern.test(row.title.toLowerCase()))?.[1] ?? ""
  return row.tags[0] ?? ""
}

export async function researchEvidence(input: { areas: Area[]; terms: string[]; broad: boolean; ids: string[]; extraTerms?: string[] }) {
  const terms = searchWords([...input.terms, ...(input.extraTerms ?? [])])
  const rows = await queryRows<ResearchHit>(String.raw`
    WITH topics AS (
      SELECT t.* FROM research_tags t WHERE t.area=ANY($1::text[]) AND EXISTS (
        SELECT 1 FROM unnest(ARRAY[t.key,t.label]||t.aliases) label
        WHERE regexp_split_to_array(lower(label COLLATE "pg_c_utf8"),'[^[:alnum:]-]+') && $2::text[])
    ), expansion AS (
      SELECT DISTINCT word FROM (
        SELECT unnest($2::text[]) word UNION ALL
        SELECT regexp_split_to_table(lower(alias COLLATE "pg_c_utf8"),'[^[:alnum:]-]+')
        FROM topics CROSS JOIN LATERAL unnest(aliases) alias
      ) terms WHERE length(word)>1 AND word NOT IN ('the','and','of','in','to','for','on')
    ), q AS (
      SELECT to_tsquery('simple',coalesce(string_agg(quote_literal(word),' | '),'')) exact,
        to_tsquery('english',coalesce(string_agg(quote_literal(word),' | '),'')) english,
        to_tsquery('russian',coalesce(string_agg(quote_literal(word),' | '),'')) russian FROM expansion
    ), hits AS (
      SELECT a.area,a.id article_id,a.title,a.year,a.provider,f.location,f.source_url,f.page,f.body,f.id,
        9*ts_rank(f.search_vector,q.exact)
        + 3*ts_rank(to_tsvector('english',f.body),q.english)
        + 3*ts_rank(to_tsvector('russian',f.body),q.russian)
        + 9*ts_rank(to_tsvector('simple',lower(a.title COLLATE "pg_c_utf8")),q.exact) AS relevance,
        CASE f.location WHEN 'abstract' THEN 0 WHEN 'page' THEN coalesce(f.page,2)*0.04+0.10 ELSE 0.50 END AS penalty
      FROM research_fragments f JOIN research_articles a ON (a.area,a.id)=(f.area,f.article_id) CROSS JOIN q
      WHERE a.area=ANY($1::text[]) AND (cardinality($4::text[])=0 OR upper(a.id)=ANY($4::text[]))
        AND f.location IN ('abstract','page','result') AND length(f.body)>80
    ), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY area,article_id ORDER BY
        CASE WHEN $3 THEN penalty ELSE penalty/6-relevance END,id) AS position
      FROM hits WHERE $3 OR relevance>0
    )
    SELECT area,article_id,title,year,provider,location,source_url,page,
      CASE WHEN $3 THEN left(body,3200)
           WHEN $5 THEN left(body,4800)
           ELSE ts_headline('simple',body,q.exact,'StartSel=⟦, StopSel=⟧, MaxWords=155, MinWords=85, MaxFragments=1') END body,
      relevance::float score,
      ARRAY(SELECT tag FROM research_tag_matches m WHERE m.area=r.area AND m.article_id=r.article_id
        GROUP BY tag ORDER BY max(CASE WHEN m.fragment_id=r.id THEN 1 ELSE 0 END) DESC,tag) tags
    FROM ranked r CROSS JOIN q WHERE position <= CASE WHEN $5 THEN 4 ELSE 1 END
    ORDER BY CASE WHEN $3 THEN penalty ELSE penalty/6-relevance END,
      CASE WHEN $3 AND location='abstract' THEN least(char_length(body),1400) ELSE 0 END DESC,
      (year IS NULL),year DESC,article_id,position
    LIMIT 120`, [input.areas, terms, input.broad, input.ids, Boolean(input.ids.length)])
  const picked: ResearchHit[] = []
  const seenTopics = new Set<string>()
  const seenAreas = new Set<Area>()
  const remaining = rows.slice()
  if (input.broad && !input.ids.length) {
    const specificity = (row: ResearchHit) => Number(/perseverance|jezero|clipper|transmission spectroscopy|landsat|artemis/iu.test(row.title))
    remaining.sort((a, b) => specificity(b) - specificity(a))
  }
  const limit = input.ids.length ? 5 : input.broad ? 5 : 4
  while (picked.length < limit && remaining.length) {
    const index = input.broad && !input.ids.length ? remaining.findIndex((row) => {
      const topic = primaryTopic(row)
      return !seenAreas.has(row.area) || (topic && !seenTopics.has(row.area + "/" + topic))
    }) : 0
    const [row] = remaining.splice(index < 0 ? 0 : index, 1)
    seenTopics.add(row.area + "/" + primaryTopic(row))
    seenAreas.add(row.area)
    picked.push(row)
  }
  return picked.map((row): AssistantSource => ({
    title: row.title + (row.page ? " · стр. " + row.page : ""), url: row.source_url,
    text: `Область: ${areas[row.area].label}. ${row.year ?? ""} ${row.provider}. ${row.location === "abstract" ? "Аннотация" : "Фрагмент"}: ${input.broad
      ? clip(row.body, input.ids.length ? 1100 : 650)
      : relevantExcerpt(row.body.replace(/[⟦⟧]/gu, ""), terms, 900)}`,
  }))
}

export async function uploadedEvidence(terms: string[]) {
  const search = searchWords(terms)
  if (!search.length) return []
  const rows = await queryRows<{ id: string; filename: string; page_number: number; extraction_method: string; body: string }>(String.raw`
    WITH q AS (
      SELECT to_tsquery('simple',string_agg(quote_literal(word),' | ')) exact,
        to_tsquery('english',string_agg(quote_literal(word),' | ')) english,
        to_tsquery('russian',string_agg(quote_literal(word),' | ')) russian FROM unnest($1::text[]) word
    ), hits AS (
      SELECT p.id,p.filename,f.page_number,f.extraction_method,f.text_content,
        5*ts_rank(to_tsvector('simple',lower(f.text_content COLLATE "pg_c_utf8")),q.exact)
        + 3*ts_rank(to_tsvector('english',f.text_content),q.english)
        + 3*ts_rank(to_tsvector('russian',f.text_content),q.russian) score
      FROM publications p JOIN pages f ON f.publication_id=p.id CROSS JOIN q
      WHERE p.corpus_id IS NULL AND p.id NOT LIKE 'private-%' AND length(f.text_content)>50
    ), ranked AS (
      SELECT *,row_number() OVER (PARTITION BY id ORDER BY score DESC,page_number) AS position
      FROM hits WHERE score>0
    )
    SELECT id,filename,page_number,extraction_method,
      ts_headline('simple',text_content,q.exact,'StartSel=⟦, StopSel=⟧, MaxWords=130, MinWords=80, MaxFragments=1') body
    FROM ranked CROSS JOIN q WHERE position<=2 ORDER BY score DESC,id,page_number LIMIT 2`, [search])
  return rows.map((row): AssistantSource => ({
    title: row.filename + " · стр. " + row.page_number,
    url: "/api/documents/" + encodeURIComponent(row.id) + "/file#page=" + row.page_number,
    text: (row.extraction_method === "ocr" ? "Текст OCR. " : "Текст PDF. ") + relevantExcerpt(row.body.replace(/[⟦⟧]/gu, ""), search, 720),
  }))
}

