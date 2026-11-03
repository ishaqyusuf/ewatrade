/** Date choices for the printable customer statement (Workshop customers-pages 07). */
export const STATEMENT_PDF_PRESETS = [
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "last3Months", label: "Last 3 months" },
  { key: "thisYear", label: "This year" },
  { key: "custom", label: "Custom" },
] as const

export type StatementPdfPreset = (typeof STATEMENT_PDF_PRESETS)[number]["key"]

/** A local calendar day as YYYY-MM-DD. */
export function localDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * The local dates a preset covers, both inclusive. Running periods end today;
 * "Last month" and "Last 3 months" end on the last day of last month.
 */
export function statementPdfRange(
  preset: Exclude<StatementPdfPreset, "custom">,
  today = new Date(),
) {
  const year = today.getFullYear()
  const month = today.getMonth()
  const endOfLastMonth = new Date(year, month, 0)
  switch (preset) {
    case "thisMonth":
      return {
        from: localDay(new Date(year, month, 1)),
        through: localDay(today),
      }
    case "lastMonth":
      return {
        from: localDay(new Date(year, month - 1, 1)),
        through: localDay(endOfLastMonth),
      }
    case "last3Months":
      return {
        from: localDay(new Date(year, month - 3, 1)),
        through: localDay(endOfLastMonth),
      }
    case "thisYear":
      return { from: localDay(new Date(year, 0, 1)), through: localDay(today) }
  }
}

export function pdfBytes(base64: string) {
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}
