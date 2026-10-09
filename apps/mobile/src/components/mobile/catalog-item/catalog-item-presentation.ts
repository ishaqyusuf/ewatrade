import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type CatalogItem = RouterOutputs["catalog"]["getItem"]
export type CatalogItemOverviewProps = {
  item: CatalogItem
  onBack: () => void
  onCreateOrder: () => void
  onCreateSelectedOrder?: (offeringId: string) => void
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
  storeId?: string
  cachedAt?: string
  onRetry?: () => void
}
