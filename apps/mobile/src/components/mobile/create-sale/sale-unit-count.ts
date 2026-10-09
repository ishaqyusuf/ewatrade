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

/** "1 item · 1 unit", "3 items · 7 units"; units may be "—" when unknown. */
export function saleItemsLabel(lines: number, units: string) {
  const unitWord = units === "1" ? "unit" : "units"
  return `${lines} ${lines === 1 ? "item" : "items"} · ${units} ${unitWord}`
}

export function stepSaleQuantity(
  quantity: string | undefined,
  direction: 1 | -1,
) {
  try {
    const next = addExactDecimals(quantity || "0", String(direction))
    return compareExactDecimals(next, "0") <= 0 ? "0" : next
  } catch {
    return direction === 1 ? "1" : "0"
  }
}
