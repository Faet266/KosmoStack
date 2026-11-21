const label = String.raw`accuracy|precision|recall|f1(?:[- ]?score)?|auroc|auc|bleu|rouge|exact match|mrr|ndcg|hit rate|entity match(?: rate)?|answer relevance|latency|power conversion efficiency|conversion efficiency|open[- ]circuit voltage|short[- ]circuit current(?: density)?|fill[- ]factor|PCE|V\s*oc|J\s*sc|FF|bandgap|T80|КПД|полнота|точность|задержка`
const pair = new RegExp(String.raw`(?<![\p{L}\p{N}])(${label})(?![\p{L}\p{N}])(?:\s*@\s*(\d+))?(?:\s*\(\s*(%|mV|V|ms|mA\s*\/?\s*cm(?:[−-]?2|²)|eV|h)\s*\))?\s*(?:=|:|of|is|was|reached|at|составил[аио]?)?\s*\(?\s*([+-]?(?:\d*[.,]\d+|\d+))\s*(%|mV\b|V\b|ms\b|mA\s*\/?\s*cm(?:[−-]?2|²)|eV\b|h\b|seconds?\b)?`, "dgiu")

export function metricMentions(text) {
  const normalized = text.normalize("NFKC").replace(/[−–]/gu, "-")
  const matches = [...normalized.matchAll(pair)]
  return matches.flatMap((row) => {
    const unit = row[5] || row[3] || null
    const rawValue = row[4]
    if (!unit && /^(?:pce|v\s*oc|j\s*sc|ff|t80)$/iu.test(row[1])) return []
    const names = { pce:"PCE", voc:"Voc", jsc:"Jsc", ff:"FF", mrr:"MRR", ndcg:"NDCG", auc:"AUC", auroc:"AUROC", t80:"T80" }
    const key = row[1].toLowerCase().replace(/\s+/gu,"")
    return [{ metricName: names[key] ?? (key.startsWith("f1") ? "F1" : row[1][0].toUpperCase()+row[1].slice(1)),
      metricK: row[2] ? Number(row[2]) : null, rawValue, unit, offset: row.indices?.[4]?.[0] }]
  })
}
