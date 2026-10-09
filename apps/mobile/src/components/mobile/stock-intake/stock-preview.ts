import {
  addExactDecimals,
  divideExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
export function stepExactQuantity(value: string, direction: 1 | -1) {
  try {
    const current = parseExactDecimal(value || "0", { maxScale: 6 })
    const next =
      direction === 1
        ? addExactDecimals(current, "1")
        : subtractExactDecimals(current, "1")
    return next.startsWith("-") ? "0" : next
  } catch {
    return value
  }
}
export function stockAfter(
  onHand: string,
  quantity: string,
  mode: string,
  direction: string,
) {
  try {
    const q = parseExactDecimal(quantity, { maxScale: 6 })
    const next =
      mode === "count"
        ? q
        : mode === "custody" ||
            (mode === "adjustment" && direction === "decrease")
          ? subtractExactDecimals(onHand, q)
          : addExactDecimals(onHand, q)
    return next.startsWith("-") ? null : next
  } catch {
    return null
  }
}
export function suggestedTargetQuantity(
  quantity: string,
  sourceFactor: string,
  targetFactor: string,
  scale: number,
) {
  try {
    if (quantity.length > 40) return ""
    return divideExactDecimals(
      multiplyExactDecimals(
        parseExactDecimal(quantity, { allowZero: false, maxScale: 6 }),
        sourceFactor,
      ),
      targetFactor,
      Math.min(6, scale),
    )
  } catch {
    return ""
  }
}
