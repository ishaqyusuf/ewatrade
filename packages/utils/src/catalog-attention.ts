import { subtractExactDecimals } from "./exact-decimal"

/** Problems the Catalog flags on an item, in the order they are checked. */
export const CATALOG_ATTENTION_KINDS = [
  "out_of_stock",
  "no_price",
  "not_counted",
] as const
export type CatalogAttention = (typeof CATALOG_ATTENTION_KINDS)[number]

/** The parts of a serialized Catalog item the attention rule reads. */
export type CatalogAttentionItem = {
  kind: "product" | "service"
  variants: Array<{
    id: string
    isDefault: boolean
    offerings: Array<{
      fixedPriceMinor: number | null
      pricingPolicy: string
      productUnit?: { inventoryUnitId: string } | null
    }>
  }>
  product?: {
    currentUnitConfiguration?: {
      units: Array<{ id: string; stockBehavior: string }>
    } | null
    stockBalances: Array<{
      inventoryUnitId: string
      kind: string
      onHandQuantity: string
      reservedQuantity: string
      storeId: string
      variantId: string
    }>
  } | null
}

/** The item's main sale option: its default variant's first offering. */
function mainOffering(item: CatalogAttentionItem) {
  const variant =
    item.variants.find((candidate) => candidate.isDefault) ?? item.variants[0]
  return { offering: variant?.offerings[0], variant }
}

/** "Quote" and fixed prices count as priced; anything else has no price. */
export function catalogItemHasPrice(item: CatalogAttentionItem) {
  const { offering } = mainOffering(item)
  return (
    (offering?.pricingPolicy === "fixed" &&
      offering.fixedPriceMinor !== null) ||
    offering?.pricingPolicy === "quote_required"
  )
}

/**
 * The stock balance the Catalog shows for the main offering in one Store:
 * packaged stock for packaged units, the shared pool otherwise.
 */
export function catalogItemStockBalance<Item extends CatalogAttentionItem>(
  item: Item,
  storeId?: string,
): {
  available: string
  balance: NonNullable<Item["product"]>["stockBalances"][number]
} | null {
  const { offering, variant } = mainOffering(item)
  const offeringUnit = item.product?.currentUnitConfiguration?.units.find(
    (unit) => unit.id === offering?.productUnit?.inventoryUnitId,
  )
  const balance = item.product?.stockBalances.find(
    (candidate) =>
      candidate.storeId === storeId &&
      candidate.variantId === variant?.id &&
      (offeringUnit?.stockBehavior === "packaged_stock"
        ? candidate.kind === "packaged_stock" &&
          candidate.inventoryUnitId === offeringUnit.id
        : candidate.kind === "shared_pool"),
  ) as NonNullable<Item["product"]>["stockBalances"][number] | undefined
  return balance
    ? {
        balance,
        available: subtractExactDecimals(
          balance.onHandQuantity,
          balance.reservedQuantity,
        ),
      }
    : null
}

/**
 * The one problem shown for an item in a Store, or undefined. A missing price
 * wins; products then need a stock count, then stock above zero.
 */
export function catalogItemAttention(
  item: CatalogAttentionItem,
  storeId?: string,
): CatalogAttention | undefined {
  if (!catalogItemHasPrice(item)) return "no_price"
  if (item.kind === "service") return undefined
  const stock = catalogItemStockBalance(item, storeId)
  if (!stock) return "not_counted"
  return Number(stock.available) <= 0 ? "out_of_stock" : undefined
}
