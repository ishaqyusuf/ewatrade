import type { CatalogUnitRelationDirection } from "@ewatrade/utils"

export type AdvancedOptionGroup = { id: string; name: string; values: string }
export type AdvancedVariantDraft = {
  barcode: string
  enabled: boolean
  price: string
  quantity: string
  quoteRequired: boolean
  sku: string
  storeIds: string[]
  unitPrices: Record<string, string>
}
export type AdvancedUnitDraft = {
  id: string
  name: string
  price: string
  referenceId: string
  relationCount: string
  relationDirection: CatalogUnitRelationDirection
  stockBehavior: "alternate_transaction" | "packaged_stock"
  transactionScale: number
}
