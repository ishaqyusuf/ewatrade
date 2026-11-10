import {
  EXACT_QUANTITY_MAX_SCALE,
  addExactDecimals,
  compareExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "./exact-decimal"

export type ShipmentStatus =
  | "DRAFT"
  | "EXPECTED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CLOSED_SHORT"
  | "CANCELLED"

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  DRAFT: "Draft",
  EXPECTED: "On the way",
  PARTIALLY_RECEIVED: "Part arrived",
  RECEIVED: "Arrived",
  CLOSED_SHORT: "Closed short",
  CANCELLED: "Cancelled",
}

/** Stock History category for every arrival recorded from a shipment. */
export const SHIPMENT_RECEIPT_CATEGORY = "Shipment"

export const SHIPMENT_SOURCE_CURRENCIES = ["CNY", "USD", "NGN"] as const

/** Foreign currencies in the shipment, each needing its own naira rate. */
export function shipmentRateCurrencies(
  lines: Array<{ sourceCurrencyCode: string }>,
  freightCurrencyCode: string,
  bookCurrencyCode: string,
) {
  return [
    ...new Set([
      ...lines.map((line) => line.sourceCurrencyCode),
      freightCurrencyCode,
    ]),
  ].filter((code) => code !== bookCurrencyCode)
}

function roundedMinor(decimal: string) {
  const [whole = "0", fraction = ""] = decimal.replace("-", "").split(".")
  let value = BigInt(whole)
  if ((fraction[0] ?? "0") >= "5") value += BigInt(1)
  return decimal.startsWith("-") ? -value : value
}

function scaledProduct(left: string, right: string) {
  const a = parseExactDecimal(left)
  const b = parseExactDecimal(right)
  const [aw = "0", af = ""] = a.split(".")
  const [bw = "0", bf = ""] = b.split(".")
  const scale = af.length + bf.length
  const product = BigInt(aw + af) * BigInt(bw + bf)
  if (!scale) return product.toString()
  const digits = product.toString().padStart(scale + 1, "0")
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
}

/**
 * Whole minor units for a minor-unit decimal such as T1's landed unit cost
 * ("1424312.166666"), rounded half away from zero.
 */
export function shipmentRoundedMinor(minor: string | number) {
  const text = String(minor).trim()
  const negative = text.startsWith("-")
  const [whole = "0", fraction = ""] = text.replace(/^[-+]/, "").split(".")
  let value = BigInt(whole || "0")
  if ((fraction[0] ?? "0") >= "5") value += BigInt(1)
  return (negative && value !== BigInt(0) ? -value : value).toString()
}

/** Unreceived cost per outstanding unit, rounded to the minor unit. */
export function shipmentUnreceivedUnitMinor(
  unreceivedCostMinor: string,
  outstandingQuantity: string,
) {
  if (compareExactDecimals(outstandingQuantity, "0") <= 0) return null
  const [whole = "0", fraction = ""] = outstandingQuantity.split(".")
  const scale = BigInt(10) ** BigInt(fraction.length)
  const numerator = BigInt(unreceivedCostMinor) * scale * BigInt(2)
  const denominator = BigInt(whole + fraction) * BigInt(2)
  return ((numerator + denominator / BigInt(2)) / denominator).toString()
}

/**
 * Signed landed-cost change so each unreceived unit costs `targetUnitMinor`.
 * T1 applies adjustments to the unreceived quantity only.
 */
export function shipmentAdjustmentMinor(input: {
  targetUnitMinor: string
  outstandingQuantity: string
  unreceivedCostMinor: string
}) {
  const target = roundedMinor(
    scaledProduct(input.targetUnitMinor, input.outstandingQuantity),
  )
  return (target - BigInt(input.unreceivedCostMinor)).toString()
}

/** Naira text such as "4,600" or "4600.5" to minor units; null when invalid. */
export function shipmentMajorToMinor(value: string) {
  const match = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(
    value.replace(/,/g, "").trim(),
  )
  if (!match?.[1]) return null
  return (
    BigInt(match[1]) * BigInt(100) +
    BigInt((match[2] ?? "").padEnd(2, "0"))
  ).toString()
}

/** Unfinished/invalid form input must never reach exact arithmetic or a receipt. */
export function shipmentArrivalQuantity(
  value: string,
  outstandingQuantity: string,
) {
  try {
    const quantity = parseExactDecimal(value.trim() || "0", {
      maxScale: EXACT_QUANTITY_MAX_SCALE,
    })
    if (compareExactDecimals(quantity, outstandingQuantity) > 0)
      return { ok: false as const, error: "over" as const }
    return {
      ok: true as const,
      quantity,
      remaining: subtractExactDecimals(outstandingQuantity, quantity),
    }
  } catch {
    return { ok: false as const, error: "invalid" as const }
  }
}

/** Keep the stepper exact, including the last fraction of an inventory unit. */
export function shipmentArrivalStep(
  value: string,
  outstandingQuantity: string,
  by: 1 | -1,
) {
  const current = shipmentArrivalQuantity(value, outstandingQuantity)
  const next = addExactDecimals(current.ok ? current.quantity : "0", String(by))
  if (compareExactDecimals(next, "0") < 0) return "0"
  return compareExactDecimals(next, outstandingQuantity) > 0
    ? outstandingQuantity
    : next
}

/** Preflight all entered prices before the first revisioned Catalog command. */
export function shipmentPriceChanges(
  rows: Array<{
    name: string
    value: string
    offering: { id: string; revision: number; priceMinor: number } | null
  }>,
) {
  const changes = new Map<
    string,
    { offeringId: string; expectedRevision: number; priceMinor: number }
  >()
  for (const { name, value, offering } of rows) {
    if (!value.trim()) continue
    const minor = shipmentMajorToMinor(value)
    if (minor === null || BigInt(minor) > BigInt(100_000_000))
      return {
        ok: false as const,
        error: `Enter a valid selling price for ${name} (up to 1,000,000).`,
      }
    if (!offering)
      return {
        ok: false as const,
        error: `Choose a fixed-price Catalog offering for ${name}.`,
      }
    const priceMinor = Number(minor)
    const existing = changes.get(offering.id)
    if (existing && existing.priceMinor !== priceMinor)
      return {
        ok: false as const,
        error: `Use the same selling price for repeated item ${name}.`,
      }
    // Retain unchanged entries until all repeated rows have been checked.
    changes.set(offering.id, {
      offeringId: offering.id,
      expectedRevision: offering.revision,
      priceMinor,
    })
  }
  const changed = [...changes.values()].filter(
    (change) =>
      rows.find((row) => row.offering?.id === change.offeringId)?.offering
        ?.priceMinor !== change.priceMinor,
  )
  return changed.length
    ? { ok: true as const, changes: changed }
    : { ok: false as const, error: "Enter at least one new price." }
}
