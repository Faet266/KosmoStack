export const clean = (value) => typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, " ").trim() : ""
const plain = (value) => clean(value).replace(/<[^>]+>/gu,"")
const unique = (values) => [...new Map(values.filter(Boolean).map((value) => [value.toLowerCase(), value])).values()]
const doi = (value) => clean(value).replace(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/iu,"").toLowerCase()
const orcid = (value) => clean(value).replace(/^https?:\/\/orcid\.org\//iu,"")

export function normalAuthor(raw, givenValue, familyValue, affiliations = [], identifier = "") {
  const name = plain(raw)
  const paired = /^([^,]+),\s+([^,]+)$/u.exec(name)
  const family = plain(familyValue) || (paired ? paired[1] : "")
  const given = plain(givenValue) || (paired ? paired[2] : "")
  const initials = (given.match(/(?:^|[\s.-])(\p{L})/gu) ?? []).map((part)=>part.trim().replace(/[.-]/gu,"").toUpperCase()+".").join(" ")
  return { name: name || [given, family].filter(Boolean).join(" "), given, family, initials,
    organizations: unique(affiliations.map(plain)), orcid: orcid(identifier) }
}

function dateParts(parts) {
  if (!parts?.length || !Number.isInteger(parts[0]) || parts[0]<1800 || parts[0]>2099) return ""
  const [year,month,day] = parts
  return [year,month >=1 && month<=12 ? String(month).padStart(2,"0") : "",
    month>=1 && month<=12 && day>=1 && day<=31 ? String(day).padStart(2,"0") : ""].filter(Boolean).join("-")
}
function sourceDate(value) {
  return dateParts(clean(value).match(/^\d{4}(?:-\d{2}(?:-\d{2})?)?/u)?.[0]?.split("-").map(Number))
}
function joinedAuthors(authors) {
  const people = new Map()
  for (const author of authors) if (author.name) {
    const key=author.name.toLowerCase()
    const before=people.get(key)
    people.set(key,before ? {...before,organizations:unique([...before.organizations,...author.organizations])} : author)
  }
  return [...people.values()]
}

export function nasaCitation(item) {
  const authors = joinedAuthors((item.authorAffiliations ?? []).slice().sort((a,b)=>(a.sequence??0)-(b.sequence??0))
    .map(({meta})=>normalAuthor(meta?.author?.name,meta?.author?.given,meta?.author?.family,
      [meta?.organization?.name], meta?.author?.orcid)))
  const issue = item.publications?.[0]
  const date = sourceDate(issue?.publicationDate) || sourceDate(item.meetings?.[0]?.startDate)
  return {
    authors, date,
    organizations:unique([...authors.flatMap((person)=>person.organizations),plain(item.center?.name)]),
    publisher:plain(issue?.publisher), publication:plain(issue?.publicationName ?? issue?.name ?? item.meetings?.[0]?.name),
    volume:clean(issue?.volume), issue:clean(issue?.issue), doi:doi(issue?.doi??item.doi),
    identifiers:[
      {label:"NASA NTRS",value:String(item.id)},
      ...unique((item.otherReportNumbers??[]).map((entry)=>clean(typeof entry==="object"?entry.number??entry.value:entry).replace(/^report number:\s*/iu,"")))
        .map((value)=>({label:"Номер отчёта",value})),
    ],
  }
}

export function crossrefCitation(item) {
  const authors=joinedAuthors((item.author??[]).map((author)=>normalAuthor(author.name,author.given,author.family,
    (author.affiliation??[]).map((affiliation)=>affiliation.name),author.ORCID)))
  const parts = item.published?.["date-parts"]?.[0] ?? item["published-print"]?.["date-parts"]?.[0] ?? item["published-online"]?.["date-parts"]?.[0]
  return { authors, date:dateParts(parts), organizations:unique(authors.flatMap((author)=>author.organizations)),
    publisher:plain(item.publisher),publication:plain(item["container-title"]?.[0]),volume:clean(item.volume),issue:clean(item.issue),
    page:clean(item.page),doi:doi(item.DOI), identifiers:[
      ...unique((item.ISSN??[]).map(clean)).map((value)=>({label:"ISSN",value})),
      ...(item["article-number"] ? [{label:"Номер статьи",value:clean(item["article-number"])}]:[]),
    ] }
}
