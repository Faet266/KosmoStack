import { encodeCsv } from "@/lib/csv"

export type PassportField = {
  name: string
  table: string
  type: string
  unit: string
  required: string
  rule: string
  example: string
}

export function createPassportCsv(fields: PassportField[]) {
  const headers = ["Поле", "Таблица", "Тип", "Единица", "Обязательное", "Правило интерпретации", "Пример"]
  const rows = fields.map((field) => [field.name, field.table, field.type, field.unit, field.required, field.rule, field.example])
  return encodeCsv(headers, rows)
}
