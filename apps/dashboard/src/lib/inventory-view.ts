import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"

export type InventoryStockFilter = "all" | "reserved" | "out" | "low"
export type InventoryStockStatus =
  | "in_stock"
  | "low"
  | "out"
  | "transit"
  | "staff"
type Balance = {
  kind?: string
  lowStockLevel?: string | null
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

/**
 * Summary tiles count products, not stock lines. Only stock kept in a store
 * counts: stock on the way or held by staff is not ready to sell.
 */
export function summarizeInventory(rows: readonly Balance[]) {
  const products = new Set<string>()
  const sellable = new Set<string>()
  const held = new Set<string>()
  const low = new Set<string>()
  for (const row of rows) {
    if (row.custodyType !== "STORE") continue
    products.add(row.productId)
    if (compareExactDecimals(row.availableQuantity, "0") > 0)
      sellable.add(row.productId)
    if (compareExactDecimals(row.reservedQuantity, "0") > 0)
      held.add(row.productId)
    if (getInventoryStatus(row) === "low") low.add(row.productId)
  }
  return {
    products: products.size,
    sellable: sellable.size,
    held: held.size,
    low: low.size,
    out: products.size - sellable.size,
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
          : getInventoryStatus(row) === filter)) &&
      (!normalized ||
        [row.productName, row.storeName, row.variantName, row.inventoryUnitName]
          .join(" ")
          .toLowerCase()
          .includes(normalized)),
  )
}

/**
 * What a shop owner needs from one stock line: can it be sold, is it running
 * low, or where is it. The Product's low-stock level is in its main unit, so
 * it applies to loose stock (shared pool), not to packs kept separately.
 */
export function getInventoryStatus(row: {
  custodyType: string
  availableQuantity: string
  kind?: string
  lowStockLevel?: string | null
}): InventoryStockStatus {
  if (row.custodyType === "TRANSIT") return "transit"
  if (row.custodyType === "STAFF" || row.custodyType === "SESSION")
    return "staff"
  if (compareExactDecimals(row.availableQuantity, "0") <= 0) return "out"
  if (
    row.lowStockLevel != null &&
    row.kind !== "PACKAGED_STOCK" &&
    compareExactDecimals(row.availableQuantity, row.lowStockLevel) <= 0
  )
    return "low"
  return "in_stock"
}

export const inventoryStatusLabels: Record<InventoryStockStatus, string> = {
  in_stock: "In stock",
  low: "Running low",
  out: "Out of stock",
  transit: "On the way",
  staff: "With staff",
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

const IRREGULAR_UNIT_PLURALS: Record<string, string> = {
  piece: "pieces",
  box: "boxes",
  child: "children",
  person: "people",
  foot: "feet",
  tooth: "teeth",
  mouse: "mice",
  goose: "geese",
}

/**
 * Unit names are saved in the singular ("Egg", "Box of 100"). Plain English
 * plural for display until units store their own plural name: the first word
 * changes ("Boxes of 100"); short codes such as "kg" or "KG" stay as typed.
 */
export function pluralizeUnitName(unitName: string) {
  const trimmed = unitName.trim()
  const match = /^([A-Za-z]+)(.*)$/.exec(trimmed)
  if (!match) return trimmed
  const [, word = "", rest = ""] = match
  if (word.length <= 2 || word === word.toUpperCase()) return trimmed
  const lower = word.toLowerCase()
  if (/s$/.test(lower) && !/(ss|us)$/.test(lower)) return trimmed
  let plural = IRREGULAR_UNIT_PLURALS[lower]
  if (!plural) {
    if (/(s|x|z|ch|sh)$/.test(lower)) plural = `${lower}es`
    else if (/[^aeiou]y$/.test(lower)) plural = `${lower.slice(0, -1)}ies`
    else plural = `${lower}s`
  }
  const cased =
    word[0] === word[0]?.toUpperCase()
      ? `${plural[0]?.toUpperCase()}${plural.slice(1)}`
      : plural
  return `${cased}${rest}`
}

/** "1,230 eggs", "1 tray", "3 boxes of 100": the unit follows the number, in the plural when needed. */
export function formatStockQuantity(value: string, unitName: string) {
  const one = compareExactDecimals(value, "1") === 0
  const unit = one ? unitName.trim() : pluralizeUnitName(unitName)
  const word = /^[A-Z][a-z]/.test(unit)
    ? `${unit[0]?.toLowerCase()}${unit.slice(1)}`
    : unit
  return `${formatInventoryQuantity(value)} ${word}`
}
