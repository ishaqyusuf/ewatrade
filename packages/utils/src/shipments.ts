import { compareExactDecimals, parseExactDecimal } from "./exact-decimal"

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
