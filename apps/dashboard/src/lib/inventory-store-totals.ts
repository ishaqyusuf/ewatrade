import { addExactDecimals } from "@ewatrade/utils/exact-decimal"
type StoreBalance = {
  balanceSourceId: string
  productId: string
  variantId: string
  inventoryUnitId: string
  configurationVersionId: string
  custodyType: string
  custodyReferenceId: string | null
  storeId: string
  storeName: string
  onHandQuantity: string
  reservedQuantity: string
  availableQuantity: string
}
export function groupInventoryStores<T extends StoreBalance>(
  rows: readonly T[],
): Array<T & { storeBalances: T[] }> {
  const groups = new Map<string, T & { storeBalances: T[] }>()
  for (const row of rows) {
    const key = JSON.stringify([
      row.productId,
      row.variantId,
      row.inventoryUnitId,
      row.configurationVersionId,
      row.custodyType,
      row.custodyReferenceId,
    ])
    const existing = groups.get(key)
    const available =
      row.custodyType === "TRANSIT" ? "0" : row.availableQuantity
    if (existing) {
      existing.storeBalances.push(row)
      existing.onHandQuantity = addExactDecimals(
        existing.onHandQuantity,
        row.onHandQuantity,
      )
      existing.reservedQuantity = addExactDecimals(
        existing.reservedQuantity,
        row.reservedQuantity,
      )
      existing.availableQuantity = addExactDecimals(
        existing.availableQuantity,
        available,
      )
      existing.storeName = Array.from(
        new Set(existing.storeBalances.map((balance) => balance.storeName)),
      ).join(", ")
    } else
      groups.set(key, {
        ...row,
        balanceSourceId: `stores:${key}`,
        storeId: "",
        availableQuantity: available,
        storeBalances: [row],
      })
  }
  return Array.from(groups.values())
}
