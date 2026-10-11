import {
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import { CatalogError } from "./catalog-errors"

/** The same exact quantity arithmetic is used by review and canonical execution. */
export function productReturnQuantityImpact(input: {
  quantity: string
  fulfilledQuantities: string[]
  returnedQuantities: string[]
}) {
  const quantity = parseExactDecimal(input.quantity, { allowZero: false, maxScale: 6 })
  const sum = (values: string[]) => values.reduce((total, value) => addExactDecimals(total, value), "0")
  const fulfilledQuantity = sum(input.fulfilledQuantities)
  const returnedQuantity = sum(input.returnedQuantities)
  const returnableBefore = subtractExactDecimals(fulfilledQuantity, returnedQuantity)
  if (compareExactDecimals(quantity, returnableBefore) > 0) {
    throw new CatalogError("INVALID_ORDER", "Return quantity exceeds fulfilled quantity not already returned.")
  }
  return {
    quantity, fulfilledQuantity, returnedQuantity, returnableBefore,
    returnableAfter: subtractExactDecimals(returnableBefore, quantity),
  }
}

/** Only RESTOCK calls this; other dispositions do not change physical stock. */
export function productReturnStockImpact(input: {
  quantity: string
  unitFactor: string
  balanceKind: "SHARED_POOL" | "PACKAGED_STOCK"
  onHandQuantity: string
}) {
  if (compareExactDecimals(input.unitFactor, "0") <= 0)
    throw new CatalogError("INVALID_ORDER", "Return unit factor must be positive.")
  const quantity = parseExactDecimal(input.quantity, { allowZero: false, maxScale: 6 })
  const canonicalQuantity = multiplyExactDecimals(quantity, input.unitFactor)
  const balanceQuantity = input.balanceKind === "SHARED_POOL" ? canonicalQuantity : quantity
  return {
    canonicalQuantity, balanceQuantity,
    onHandBefore: input.onHandQuantity,
    onHandAfter: addExactDecimals(input.onHandQuantity, balanceQuantity),
  }
}
