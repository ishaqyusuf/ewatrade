import {
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import type { flattenServiceOfferings } from "./service-utils"

export type ServiceChoice = ReturnType<typeof flattenServiceOfferings>[number]
export type IntakeLine = {
  offeringId: string
  quantity: string
  quoteAmount?: string
  missingName?: string
  missingPrice?: number
  blockedIssue?: string
}
export function quoteAmountMinor(value: string | undefined) {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null
  const amount = Math.round(Number(value) * 100)
  return Number.isSafeInteger(amount) && amount <= 100_000_000 ? amount : null
}
export function serviceCartSummary(
  lines: IntakeLine[],
  offerings: ServiceChoice[],
) {
  let totalMinor = 0
  let unknown = 0
  let needsQuote = false
  let error: string | null = null
  if (new Set(lines.map((line) => line.offeringId)).size !== lines.length)
    return {
      totalMinor: 0,
      unknown: 0,
      needsQuote: false,
      error:
        "Combine repeated service choices into one quantity before continuing.",
    }
  for (const line of lines) {
    const choice = offerings.find((choice) => choice.id === line.offeringId)
    if (!choice) {
      error = "Choose a listed service for every item."
      continue
    }
    const quoted = choice.pricingPolicy === "quote_required"
    needsQuote ||= quoted
    const price = quoted
      ? quoteAmountMinor(line.quoteAmount)
      : choice.fixedPriceMinor
    if (price === null) unknown++
    try {
      const quantity = parseExactDecimal(line.quantity, {
        allowZero: false,
        maxScale: choice.serviceWorkPolicy?.quantityScale ?? 0,
      })
      if (price !== null) {
        const value = multiplyExactDecimals(String(price), quantity)
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
          throw new Error()
        totalMinor += Number(value)
        if (!Number.isSafeInteger(totalMinor)) throw new Error()
      }
    } catch {
      error = "Enter a valid positive quantity for each service."
    }
  }
  return { totalMinor, unknown, needsQuote, error }
}
