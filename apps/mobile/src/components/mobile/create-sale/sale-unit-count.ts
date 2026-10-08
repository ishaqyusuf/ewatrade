import { addExactDecimals, compareExactDecimals } from "@ewatrade/utils"

export function saleUnitCount(quantities: readonly (string | undefined)[]) {
  if (quantities.some((value) => !value || !/^\d+(\.\d+)?$/.test(value)))
    return "—"
  try {
    return quantities.reduce<string>(
      (sum, value) => addExactDecimals(sum, value ?? "0"),
      "0",
    )
  } catch {
    return "—"
  }
}

export function stepSaleQuantity(quantity: string, direction: 1 | -1) {
  try {
    const next = addExactDecimals(quantity || "0", String(direction))
    return compareExactDecimals(next, "0") <= 0 ? "0" : next
  } catch {
    return direction === 1 ? "1" : "0"
  }
}
