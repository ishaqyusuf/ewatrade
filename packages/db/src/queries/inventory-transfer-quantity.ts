import { compareExactDecimals, parseExactDecimal, subtractExactDecimals } from "@ewatrade/utils/exact-decimal"
import { CatalogError } from "./catalog"

/** Quantity plan for one acknowledged receipt or return of remaining transit stock. */
export function planStockTransferTransition(input: {
  dispatchedQuantity: string
  inTransitQuantity: string
  quantity?: string
  transactionScale: number
  transition: "receive" | "cancel"
}) {
  const dispatched = parseExactDecimal(input.dispatchedQuantity, { allowZero: false, maxScale: input.transactionScale })
  const remainingBefore = parseExactDecimal(input.inTransitQuantity, { allowZero: true, maxScale: input.transactionScale })
  if (compareExactDecimals(remainingBefore, dispatched) > 0)
    throw new CatalogError("INVALID_STOCK_OPERATION", "Transit stock exceeds the dispatched quantity.")
  if (remainingBefore === "0")
    throw new CatalogError("INVALID_STOCK_OPERATION", "This transfer has no remaining stock in transit.")
  const quantity = parseExactDecimal(input.quantity ?? remainingBefore, { allowZero: false, maxScale: input.transactionScale })
  if (compareExactDecimals(quantity, remainingBefore) > 0)
    throw new CatalogError("INSUFFICIENT_STOCK", "The acknowledged quantity exceeds remaining transit stock.")
  if (input.transition === "cancel" && compareExactDecimals(quantity, remainingBefore) !== 0)
    throw new CatalogError("INVALID_STOCK_OPERATION", "Cancellation must return all remaining transit stock.")
  const remainingAfter = subtractExactDecimals(remainingBefore, quantity)
  return {
    quantity,
    remainingBefore,
    remainingAfter,
    terminal: remainingAfter === "0",
    status: remainingAfter !== "0" ? "IN_TRANSIT" as const : input.transition === "receive" ? "RECEIVED" as const : "CANCELLED" as const,
  }
}
