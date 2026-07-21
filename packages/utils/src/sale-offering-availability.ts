import { compareExactDecimals } from "./exact-decimal"

type SaleOfferingAvailabilityInput = {
  fixedPriceMinor: number | null
  kind: "product_unit" | "service"
  onHandQuantity?: string
  reservedQuantity?: string
}

export function getSaleOfferingDisabledReasons({
  fixedPriceMinor,
  kind,
  onHandQuantity,
  reservedQuantity,
}: SaleOfferingAvailabilityInput) {
  const reasons: string[] = []

  if (fixedPriceMinor === null) reasons.push("Price not set")

  if (
    kind === "product_unit" &&
    compareExactDecimals(onHandQuantity ?? "0", reservedQuantity ?? "0") <= 0
  ) {
    reasons.push("Out of stock")
  }

  return reasons
}
