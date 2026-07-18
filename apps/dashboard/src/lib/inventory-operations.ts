import { canOperatePos, normalizeRole } from "@ewatrade/auth/roles"

export const LOW_STOCK_FALLBACK_THRESHOLD = 5

export type InventoryStockState = "available" | "low" | "out"

export type InventoryUnitRow = {
  availableQuantity: number
  currencyCode: string
  isDefault: boolean
  onHandQuantity: number
  priceMinor: number
  productId: string
  productName: string
  productSlug: string
  productStatus: string
  reorderPoint: number | null
  reservedQuantity: number
  sku: string | null
  state: InventoryStockState
  unitId: string
  unitName: string
}

export type InventoryProductForRows = {
  currencyCode: string
  id: string
  name: string
  slug: string
  status: string
  variants: Array<{
    id: string
    inventoryItem: {
      onHandQuantity: number
      reorderPoint: number | null
      reservedQuantity: number
    } | null
    isDefault: boolean
    name: string
    priceMinor: number
    sku: string | null
  }>
}

export type InventoryFilters = {
  search?: string
  state?: InventoryStockState | ""
}

export type StockMovementRow = {
  direction: "in" | "out"
  externalId: string
  happenedAt: string
  id: string
  note: string | null
  onHandQuantity: number | null
  previousOnHandQuantity: number | null
  product: {
    id: string
    name: string
  }
  quantity: number
  relatedUnit: {
    id: string
    name: string
    quantity: number
  } | null
  signedQuantity: number
  sourceName: string | null
  type:
    | "conversion_in"
    | "conversion_out"
    | "opening_stock"
    | "sale"
    | "sale_reversal"
    | "staff_assignment"
    | "staff_return"
    | "stock_adjustment"
    | "stock_intake"
  unit: {
    id: string
    name: string
  }
}

export function canOperateInventory(role: string | null | undefined) {
  const normalizedRole = normalizeRole(role)

  return normalizedRole ? canOperatePos(normalizedRole) : false
}

export function getAvailableQuantity(input: {
  onHandQuantity: number
  reservedQuantity: number
}) {
  return Math.max(input.onHandQuantity - input.reservedQuantity, 0)
}

export function getStockState(input: {
  onHandQuantity: number
  reorderPoint: number | null
  reservedQuantity: number
}): InventoryStockState {
  const availableQuantity = getAvailableQuantity(input)

  if (input.onHandQuantity <= 0 || availableQuantity <= 0) return "out"

  const lowStockThreshold = input.reorderPoint ?? LOW_STOCK_FALLBACK_THRESHOLD

  return availableQuantity <= lowStockThreshold ? "low" : "available"
}

export function mapInventoryRows(products: InventoryProductForRows[]) {
  return products.flatMap((product) =>
    product.variants.map((variant) => {
      const onHandQuantity = variant.inventoryItem?.onHandQuantity ?? 0
      const reservedQuantity = variant.inventoryItem?.reservedQuantity ?? 0
      const reorderPoint = variant.inventoryItem?.reorderPoint ?? null
      const availableQuantity = getAvailableQuantity({
        onHandQuantity,
        reservedQuantity,
      })

      return {
        availableQuantity,
        currencyCode: product.currencyCode,
        isDefault: variant.isDefault,
        onHandQuantity,
        priceMinor: variant.priceMinor,
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        productStatus: product.status,
        reorderPoint,
        reservedQuantity,
        sku: variant.sku,
        state: getStockState({
          onHandQuantity,
          reorderPoint,
          reservedQuantity,
        }),
        unitId: variant.id,
        unitName: variant.name,
      } satisfies InventoryUnitRow
    }),
  )
}

export function filterInventoryRows(
  rows: InventoryUnitRow[],
  filters: InventoryFilters,
) {
  const search = filters.search?.trim().toLowerCase() ?? ""
  const state = filters.state ?? ""

  return rows.filter((row) => {
    const matchesState = state ? row.state === state : true
    const matchesSearch = search
      ? [
          row.productName,
          row.productSlug,
          row.productStatus,
          row.sku ?? "",
          row.unitName,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)
      : true

    return matchesState && matchesSearch
  })
}

export function formatMovementType(type: StockMovementRow["type"]) {
  switch (type) {
    case "conversion_in":
      return "Conversion in"
    case "conversion_out":
      return "Conversion out"
    case "opening_stock":
      return "Opening stock"
    case "sale":
      return "Sale"
    case "sale_reversal":
      return "Sale reversal"
    case "staff_assignment":
      return "Staff assignment"
    case "staff_return":
      return "Staff return"
    case "stock_adjustment":
      return "Stock adjustment"
    case "stock_intake":
      return "Stock intake"
  }
}

export function formatSignedQuantity(value: number) {
  if (value > 0) return `+${value}`

  return value.toString()
}
