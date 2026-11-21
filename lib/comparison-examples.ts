export const comparisonExamples = [
  { label: "Сопоставимы · Entity Match", left: "D004/R001", right: "D004/R002", expected: "comparable" },
  { label: "Разная глубина · Recall@6 и Recall@3", left: "D020/R001", right: "D020/R002", expected: "incompatible" },
  { label: "Неизвестная шкала · Answer Relevance", left: "D002/R001", right: "D002/R002", expected: "insufficient_data" },
] as const
