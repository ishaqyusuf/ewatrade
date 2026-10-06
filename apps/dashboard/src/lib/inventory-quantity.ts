import {
  EXACT_CANONICAL_MAX_SCALE,
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"

export type InventoryQuantityUnit = {
  id: string
  name: string
  factor: string
  transactionScale: number
  stockBehavior: string
}
export type InventoryQuantityBalance = {
  productId: string
  configurationVersionId: string
  inventoryUnitId: string
  inventoryUnitName: string
  inventoryUnitFactor: string
  inventoryUnitTransactionScale: number
  kind: string
}
type QuantityConfiguration = {
  id: string
  productId: string
  status: string
  units: InventoryQuantityUnit[]
}

export function inventoryQuantityUnits(
  balance: InventoryQuantityBalance | undefined,
  configuration: QuantityConfiguration | undefined,
  allowConversion: boolean,
): InventoryQuantityUnit[] {
  if (!balance) return []
  const base = {
    id: balance.inventoryUnitId,
    name: balance.inventoryUnitName,
    factor: balance.inventoryUnitFactor,
    transactionScale: balance.inventoryUnitTransactionScale,
    stockBehavior:
      balance.kind === "PACKAGED_STOCK" ? "packaged_stock" : "canonical_shared",
  }
  if (
    !allowConversion ||
    balance.kind !== "SHARED_POOL" ||
    configuration?.status !== "current" ||
    configuration.id !== balance.configurationVersionId ||
    configuration.productId !== balance.productId
  )
    return [base]
  return [
    base,
    ...configuration.units.filter(
      (unit) =>
        unit.id !== base.id && unit.stockBehavior === "alternate_transaction",
    ),
  ]
}

export function inventoryQuantityTotal(
  quantity: string,
  unit: InventoryQuantityUnit,
  balance: InventoryQuantityBalance,
  allowZero = false,
) {
  const enteredQuantity = parseExactDecimal(quantity, {
    allowZero,
    maxScale: unit.transactionScale,
  })
  return {
    enteredQuantity,
    balanceQuantity:
      balance.kind === "SHARED_POOL"
        ? multiplyExactDecimals(
            enteredQuantity,
            unit.factor,
            EXACT_CANONICAL_MAX_SCALE,
          )
        : enteredQuantity,
  }
}
