export function encodeCsv(headers: readonly string[], rows: readonly (readonly unknown[])[], exact = false) {
  const escapeCell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value)
    const leadingContent = text.replace(/^[\u0000-\u0020]+/u, "")
    const formulaLike = /^[=+@]/u.test(leadingContent)
      || (leadingContent.startsWith("-") && Number.isNaN(Number(leadingContent)))
    const safeText = !exact && formulaLike ? `'${text}` : text
    return `"${safeText.replaceAll('"', '""')}"`
  }

  return `${exact ? "" : "\uFEFF"}${[headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`
}

export function downloadBlobFile(blob: Blob, filename: string) {
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

export function downloadCsvFile(content: string, filename: string) {
  downloadBlobFile(new Blob([content], { type: "text/csv;charset=utf-8" }), filename)
}
