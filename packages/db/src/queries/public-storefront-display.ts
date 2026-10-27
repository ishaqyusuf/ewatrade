import { normalizeWhatsAppPhone } from "@ewatrade/customer-messages"
import {
  addExactDecimals,
  compareExactDecimals,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"

export type PublicAvailability = "OUT_OF_STOCK" | "MADE_TO_ORDER" | null

type Balance = {
  inventoryUnitId: string
  onHandQuantity: { toString(): string }
  reservedQuantity: { toString(): string }
}

/** Compare like units only. No balance history means unknown, not sold out. */
export function publicStockAvailability(
  balances: Balance[],
): PublicAvailability {
  if (!balances.length) return null
  const available = new Map<string, string>()
  for (const balance of balances) {
    const free = subtractExactDecimals(
      balance.onHandQuantity.toString(),
      balance.reservedQuantity.toString(),
    )
    available.set(
      balance.inventoryUnitId,
      addExactDecimals(available.get(balance.inventoryUnitId) ?? "0", free),
    )
  }
  return [...available.values()].some(
    (quantity) => compareExactDecimals(quantity, "0") > 0,
  )
    ? null
    : "OUT_OF_STOCK"
}

export type PublicStockState =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "unknown"

/**
 * Coarse public stock state. No balance history is `unknown` (never presented as
 * stock). A business low-stock level marks `low_stock`; quantities stay private.
 */
export function publicStockState(
  balances: Balance[],
  lowStockLevel: { toString(): string } | null | undefined,
): PublicStockState {
  if (!balances.length) return "unknown"
  if (publicStockAvailability(balances) === "OUT_OF_STOCK")
    return "out_of_stock"
  if (lowStockLevel === null || lowStockLevel === undefined) return "in_stock"
  const level = lowStockLevel.toString()
  if (compareExactDecimals(level, "0") <= 0) return "in_stock"
  const free = new Map<string, string>()
  for (const balance of balances)
    free.set(
      balance.inventoryUnitId,
      addExactDecimals(
        free.get(balance.inventoryUnitId) ?? "0",
        subtractExactDecimals(
          balance.onHandQuantity.toString(),
          balance.reservedQuantity.toString(),
        ),
      ),
    )
  const most = [...free.values()].reduce((max, value) =>
    compareExactDecimals(value, max) > 0 ? value : max,
  )
  return compareExactDecimals(most, level) <= 0 ? "low_stock" : "in_stock"
}

export function publicItemAvailability(
  options: { availability: PublicAvailability }[],
): PublicAvailability {
  if (
    options.length &&
    options.every((option) => option.availability === "OUT_OF_STOCK")
  )
    return "OUT_OF_STOCK"
  if (options.some((option) => option.availability === "MADE_TO_ORDER"))
    return "MADE_TO_ORDER"
  return null
}

/** A quoted or differently denominated option prevents claiming a minimum price. */
export function publicOptionPrice(
  options: { priceMinor: number | null; currencyCode: string }[],
  fallbackCurrency: string,
) {
  const currencyCode = options[0]?.currencyCode ?? fallbackCurrency
  const fixed =
    options.length > 0 &&
    options.every(
      (option) =>
        option.priceMinor !== null && option.currencyCode === currencyCode,
    )
  const prices = fixed
    ? options.flatMap((option) =>
        option.priceMinor === null ? [] : [option.priceMinor],
      )
    : []
  return {
    currencyCode,
    priceMinor: prices.length ? Math.min(...prices) : null,
    isFromPrice:
      prices.length > 1 && Math.min(...prices) !== Math.max(...prices),
  }
}

/** Only the selected Store's public support contact; never an owner/assistant phone. */
export function publicStorefrontWhatsAppPhone(input: {
  supportPhone?: string | null
  countryCode?: string | null
  messagesEnabled: boolean
  isQaPreview: boolean
}) {
  if (!input.messagesEnabled || input.isQaPreview || !input.supportPhone)
    return null
  return (
    normalizeWhatsAppPhone(input.supportPhone, input.countryCode ?? undefined)
      ?.phoneE164 ?? null
  )
}

/** Offerings often repeat their variant's label (e.g. a laundry garment). */
export function publicStorefrontOptionName(
  variantName: string,
  offeringName: string,
  isDefault: boolean,
) {
  const normalize = (name: string) =>
    name.trim().replace(/\s+/g, " ").toLowerCase()
  return isDefault || normalize(variantName) === normalize(offeringName)
    ? offeringName
    : `${variantName} · ${offeringName}`
}
