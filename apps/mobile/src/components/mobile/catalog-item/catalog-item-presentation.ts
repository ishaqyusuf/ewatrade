import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type CatalogItem = RouterOutputs["catalog"]["getItem"]
export type StockInContext = { variantId?: string }
export type CatalogItemOverviewProps = {
  item: CatalogItem
  onBack: () => void
  onCreateOrder: () => void
  onCreateSelectedOrder?: (offeringId: string) => void
  /** Absent when this role cannot record stock. The active variant filter is
   * forwarded as an explicit stock-source request. */
  onStockIn?: (context?: StockInContext) => void
  /** Same stock request as Stock in, opened in Use mode for Internal use or
   * Both Products. Absent when this role cannot record stock. */
  onRecordUse?: (context?: StockInContext) => void
  onOpenServiceJobs?: () => void
  storeId?: string
  cachedAt?: string
}
export type CatalogItemScreenProps = {
  item?: CatalogItem
  isOffline: boolean
  isPending: boolean
  errorMessage?: string
  onBack: () => void
  onCreateOrder: () => void
  onCreateSelectedOrder?: (offeringId: string) => void
  onStockIn?: (context?: StockInContext) => void
  onRecordUse?: (context?: StockInContext) => void
  onOpenServiceJobs?: () => void
  storeId?: string
  cachedAt?: string
  onRetry?: () => void
}
