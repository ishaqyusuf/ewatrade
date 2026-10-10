import { compareExactDecimals, subtractExactDecimals } from "@ewatrade/utils/exact-decimal"
import { CatalogError } from "./catalog-errors"

type Decimal = { toFixed(): string }
/** Same balance-unit calculation for preview and locked reservation commitment. */
export function reservationCommitImpact(reservation: {
  enteredInventoryUnit: { stockBehavior: string }
  enteredQuantity: Decimal
  canonicalQuantity: Decimal
  balanceSource: { onHandQuantity: Decimal; reservedQuantity: Decimal }
}) {
  const balanceQuantity = reservation.enteredInventoryUnit.stockBehavior === "PACKAGED_STOCK"
    ? reservation.enteredQuantity.toFixed()
    : reservation.canonicalQuantity.toFixed()
  const resultingOnHand = subtractExactDecimals(reservation.balanceSource.onHandQuantity.toFixed(), balanceQuantity)
  const resultingReserved = subtractExactDecimals(reservation.balanceSource.reservedQuantity.toFixed(), balanceQuantity)
  if (compareExactDecimals(resultingOnHand, "0") < 0 || compareExactDecimals(resultingReserved, "0") < 0)
    throw new CatalogError("INSUFFICIENT_STOCK", "The reserved stock is no longer available for commitment.")
  return { balanceQuantity, resultingOnHand, resultingReserved }
}
