import type { StoredReport } from "./report-storage"

export const PAYER_NAME_MAX = 160

/** Same normalisation the server applies, so the length check matches it. */
export function cleanPayerName(value: string) {
  return Array.from(value.trim())
    .filter((character) => character.charCodeAt(0) >= 32)
    .join("")
}

export function payerNameProblem(value: string) {
  const cleaned = cleanPayerName(value)
  if (!cleaned) return "Enter your name so they can find your transfer."
  if (cleaned.length > PAYER_NAME_MAX)
    return `Use up to ${PAYER_NAME_MAX} characters.`
  return null
}

/** Sale placeholders such as "Walk-in" or "Walk-in customer" are not someone's name. */
const WALK_IN = /^walk[\s-]?in(?:\s+(?:customer|contact))?(?:\s*\(.*\))?$/i

/**
 * The name the payer field starts with when "I have paid" opens. A report this browser started
 * but never finished keeps its name; otherwise the order's saved customer name, never a
 * placeholder. A finished earlier report's name is not reused.
 */
export function initialPayerName(input: {
  record: Pick<StoredReport, "payerName" | "reportToken"> | null
  customerName: string | null
}) {
  const { record } = input
  if (record && !record.reportToken && record.payerName) return record.payerName
  const saved = cleanPayerName(input.customerName ?? "")
  return saved && !WALK_IN.test(saved) ? saved : ""
}
