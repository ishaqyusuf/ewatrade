/** One CSV cell; text that a spreadsheet would run as a formula is prefixed with '. */
export function reportCsvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ""
  const text = String(value)
  const safe =
    !/^-?\d+(\.\d+)?$/.test(text) && /^[\s]*[=+@-]/.test(text)
      ? `'${text}`
      : text
  return /[",\n\r]/.test(safe) || safe !== text
    ? `"${safe.replaceAll('"', '""')}"`
    : safe
}

export function reportCsv(
  rows: Array<Array<string | number | null | undefined>>,
) {
  return rows.map((row) => row.map(reportCsvCell).join(",")).join("\r\n")
}

/** "1284500.00" from kobo, so spreadsheets keep exact naira and kobo. */
export function reportCsvMoney(minor: number) {
  const sign = minor < 0 ? "-" : ""
  const absolute = Math.abs(minor)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`
}

/** Starts a browser download of `text` as a UTF-8 CSV with a byte-order mark for Excel. */
export function downloadReportCsv(fileName: string, text: string) {
  const url = URL.createObjectURL(
    new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }),
  )
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
