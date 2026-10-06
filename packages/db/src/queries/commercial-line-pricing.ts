import {
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"

export class OrderLinePricingError extends Error {}

function money(
  value: number | null | undefined,
  label: string,
  positive = false,
): number {
  if (
    value === null ||
    value === undefined ||
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > 100_000_000
  )
    throw new OrderLinePricingError(
      `${label} must be ${positive ? "a positive" : "a non-negative"} minor-unit amount.`,
    )
  return value
}

export function resolveCommercialLinePrice(input: {
  policy: "fixed" | "order_total" | "quote_required"
  kind: "product_unit" | "service"
  quantity: string
  fixedPriceMinor: number | null
  enteredTotalMinor?: number
  expectedFixedPriceMinor?: number
  approvedQuotePriceMinor?: number
  trustedUnitPriceMinor?: number
}) {
  const quantity = parseExactDecimal(input.quantity, {
    allowZero: false,
    maxScale: 6,
  })
  if (input.policy === "order_total") {
    if (
      input.kind !== "product_unit" ||
      input.fixedPriceMinor !== null ||
      input.trustedUnitPriceMinor !== undefined ||
      input.approvedQuotePriceMinor !== undefined ||
      input.expectedFixedPriceMinor !== undefined
    )
      throw new OrderLinePricingError(
        "Order-time pricing requires an explicitly configured Product choice without a saved or per-unit price.",
      )
    return {
      unitPriceMinor: null,
      totalMinor: money(
        input.enteredTotalMinor,
        "Total price for this item",
        true,
      ),
    }
  }
  if (input.enteredTotalMinor !== undefined)
    throw new OrderLinePricingError(
      "This choice does not allow entering an item total during order.",
    )
  let unitPriceMinor: number
  if (input.trustedUnitPriceMinor !== undefined) {
    unitPriceMinor = money(
      input.trustedUnitPriceMinor,
      "Trusted snapshot price",
    )
  } else if (input.policy === "fixed") {
    unitPriceMinor = money(input.fixedPriceMinor, "Fixed-price Offering price")
    if (
      input.expectedFixedPriceMinor !== undefined &&
      input.expectedFixedPriceMinor !== unitPriceMinor
    )
      throw new OrderLinePricingError(
        "The Offering price changed before Order confirmation.",
      )
  } else {
    if (input.kind !== "service")
      throw new OrderLinePricingError(
        "Quote-required pricing is available only for Services.",
      )
    unitPriceMinor = money(input.approvedQuotePriceMinor, "Approved quote")
  }
  const exactTotal = multiplyExactDecimals(String(unitPriceMinor), quantity)
  if (!/^\d+$/.test(exactTotal))
    throw new OrderLinePricingError(
      "The item total must resolve to an exact minor-unit amount.",
    )
  return { unitPriceMinor, totalMinor: money(Number(exactTotal), "Item total") }
}
