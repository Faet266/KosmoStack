import { areas, isArea } from "@/lib/research"
import { queryRows } from "@/lib/db"
import { ownedAreas, workspaceDocuments } from "@/lib/personal-store"
import { passportExport, type OfficialExport } from "@/lib/official-export-data"

const fields = [
  ["publication_id","Идентификатор публикации внутри области","строка","Сохраняется вместе с областью"],
  ["title","Название","строка","Берётся из публикации или имени загруженного файла"],
  ["source","Адрес оригинала или локального PDF","URL","Ссылка на первоисточник"],
  ["page","Номер страницы PDF","целое > 0","Отсутствует для аннотации без PDF"],
  ["source_fragment","Фрагмент, который можно сверить","текст","Цитата или извлечённый текст"],
  ["status","Тип доказательства","категория","Подтверждённые данные, утверждение авторов или автоматический кандидат различаются"],
]
const numeric = [
  ["metric_name","Название показателя","строка","Указывается при явной привязке числа"],
  ["raw_value","Исходная запись числа","строка","Сохраняется для проверки"],
  ["unit","Единица из источника","строка","Пустая шкала требует сверки"],
]
const solar = [
  ["PCE","КПД","%","Подтвердить прибор и режим измерения"],
  ["Voc","Напряжение холостого хода","В или мВ","Сохраняется исходная единица"],
  ["Jsc","Плотность тока короткого замыкания","мА/см²","Проверить режим и обозначение"],
  ["FF","Фактор заполнения","%","Сравнить только при установленных условиях"],
]
const section = (title: string, rows: string[][]) => ({
  title, table:{ headers:["Поле","Назначение","Тип или единица","Правило"],rows,widths:[22,27,19,32] },
})

export async function areaPassport(scope:string, owner:string):Promise<OfficialExport|null> {
  const personal = await ownedAreas(owner)
  const custom = personal.find((area)=>area.id===scope)
  if (scope !== "all" && !isArea(scope) && !custom) return null
  if (scope === "rag") return passportExport()
  const ids = scope === "all" ? ["solar","space"] : isArea(scope) ? [scope] : []
  const report:OfficialExport = { title: scope==="all" ? "Паспорт всех исследовательских областей" :
    "Паспорт данных · "+(isArea(scope)?areas[scope].label:custom?.name), code:scope==="all"?"all-areas-passport":"area-passport",
    summary:"Поля, единицы, источники и правила использования данных.", sections:[] }
  if (scope==="all") {
    try { report.sections.push(...passportExport().sections.map((item)=>({...item,title:"RAG · "+item.title}))) }
    catch { report.sections.push({title:"RAG",paragraphs:["Научный корпус пока не импортирован."]}) }
  }
  for (const id of ids) {
    if (id!=="space" && id!=="solar") continue
    const [count] = await queryRows<{articles:number;pdf:number}>(`
      SELECT count(*)::int articles,count(pdf_url)::int pdf FROM research_articles WHERE area=$1`,[id])
    report.sections.push({...section(areas[id].label,[...fields,...(id==="solar"?[...numeric,...solar]:[])]),
      paragraphs:["Публикаций: "+count.articles+". PDF: "+count.pdf+".",
        id==="solar"?"Каталог хранит автоматических кандидатов из PDF. Условия эксперимента сверяются по первоисточнику.":
          "Материалы NASA NTRS и Crossref. Записи аннотаций содержат заявленные авторами выводы и ссылки."]})
  }
  for (const area of scope==="all"?personal:custom?[custom]:[]) {
    const documents = await workspaceDocuments(owner,area.id)
    report.sections.push({...section(area.name,[...fields,...numeric,["tags","Теги, извлечённые при анализе","список строк","Применяются для фильтрации"]]),
      paragraphs:["Личная область. Документов: "+documents.length+". Числа распознаются автоматически."]})
  }
  return report
}
