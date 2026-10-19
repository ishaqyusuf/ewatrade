import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { generalInventoryQuantityValue } from "./general-inventory-balances"

type OfferingStock = {
  availableOfferingQuantity: string
  offeringUnitName: string
  offeringName: string
  variantName: string
}
function label(value: string, max: number) {
  if (value.length <= max) return value
  let result = ""
  for (const { segment } of new Intl.Segmenter("en", {
    granularity: "grapheme",
  }).segment(value)) {
    if (result.length + segment.length > max - 1) break
    result += segment
  }
  return `${result}…`
}
/** Offering quantity is in the saved entered selling unit, never the balance pool unit. */
export function generalOfferingStockAnswer(
  stock: OfferingStock | null,
  storeName: string,
  asOf = new Date().toISOString(),
): GeneralAnswer {
  if (
    !stock ||
    !stock.offeringUnitName ||
    !stock.offeringName ||
    !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(stock.availableOfferingQuantity)
  ) {
    return {
      id: `stock_${crypto.randomUUID()}`,
      title: "Offering stock",
      value: "Unavailable",
      scope: label(storeName, 500),
      asOf,
      detail:
        "Configured offering quantity and its selling unit are unavailable. No zero stock or balance-unit conversion has been inferred.",
    }
  }
  const quantity = generalInventoryQuantityValue(
    stock.availableOfferingQuantity,
    stock.offeringUnitName,
  )
  const labelsShortened =
    quantity.shortened ||
    stock.offeringName.length > 120 ||
    stock.variantName.length > 120
  return {
    id: `stock_${crypto.randomUUID()}`,
    title: label(`Stock · ${stock.offeringName}`, 160),
    value: quantity.value,
    scope: label(storeName, 500),
    asOf,
    detail: `${labelsShortened ? "Some offering/unit labels are shortened; open the original offering for full names. " : ""}Offering ${label(stock.offeringName, 120)} · variant ${label(stock.variantName || "not recorded", 120)}. Available configured selling units after reservations, using the offering's entered unit. Shared-pool quantities retain canonical rounding to the permitted selling precision. Not inventory value, a page total or balance-pool units. Missing or unconfigured stock is unavailable, not zero.`,
  }
}
