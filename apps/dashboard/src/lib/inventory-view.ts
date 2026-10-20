import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"

export type InventoryStockFilter = "all" | "reserved" | "out"
type Balance = {
  storeName?: string
  productId: string
  productName: string
  variantName: string
  inventoryUnitName: string
  custodyType: string
  onHandQuantity: string
  reservedQuantity: string
  availableQuantity: string
}

export function summarizeInventory(rows: readonly Balance[]) {
  const products = new Set<string>()
  const stocked = new Set<string>()
  let reserved = 0
  let out = 0
  for (const row of rows) {
    products.add(row.productId)
    if (compareExactDecimals(row.onHandQuantity, "0") > 0)
      stocked.add(row.productId)
    if (compareExactDecimals(row.reservedQuantity, "0") > 0) reserved++
    if (compareExactDecimals(row.availableQuantity, "0") <= 0) out++
  }
  return {
    products: products.size,
    stocked: stocked.size,
    reserved,
    out,
    balances: rows.length,
  }
}

export function filterInventory<T extends Balance>(
  rows: readonly T[],
  query: string,
  filter: InventoryStockFilter,
): T[] {
  const normalized = query.trim().toLowerCase()
  return rows.filter(
    (row) =>
      (filter === "all" ||
        (filter === "reserved"
          ? compareExactDecimals(row.reservedQuantity, "0") > 0
          : compareExactDecimals(row.availableQuantity, "0") <= 0)) &&
      (!normalized ||
        [
          row.productName,
          row.storeName,
          row.variantName,
          row.inventoryUnitName,
          row.custodyType,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized)),
  )
}

export function initialInventorySource<T extends { balanceSourceId: string }>(
  rows: readonly T[],
  balanceId: string | null,
  productId: string | null,
) {
  if (balanceId)
    return rows.some((row) => row.balanceSourceId === balanceId)
      ? balanceId
      : ""
  return productId && rows.length === 1 ? (rows[0]?.balanceSourceId ?? "") : ""
}

export function formatInventoryQuantity(value: string) {
  const [whole, fraction] = value.split(".")
  return `${(whole ?? "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction === undefined ? "" : `.${fraction}`}`
}
