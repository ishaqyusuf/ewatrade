import { majorToMinor, parseExactDecimal } from "@ewatrade/utils"

export function isCatalogVariantPriceReady(value: string) {
  const normalized = value.trim()
  if (!normalized) return false

  try {
    parseExactDecimal(normalized, { maxScale: 2 })
    return majorToMinor(normalized) !== null
  } catch {
    return false
  }
}

export function isCatalogVariantQuantityReady(value: string, maxScale: number) {
  const normalized = value.trim()
  if (!normalized) return false

  try {
    return parseExactDecimal(normalized, { maxScale }) !== undefined
  } catch {
    return false
  }
}
