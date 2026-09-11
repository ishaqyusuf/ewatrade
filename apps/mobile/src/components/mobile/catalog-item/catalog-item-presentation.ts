import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type CatalogItem = RouterOutputs["catalog"]["getItem"]
export type CatalogItemOverviewProps = {
  item: CatalogItem
  onBack: () => void
  onCreateOrder: () => void
}
export type CatalogItemScreenProps = {
  item?: CatalogItem
  isOffline: boolean
  isPending: boolean
  errorMessage?: string
  onBack: () => void
  onCreateOrder: () => void
  onRetry?: () => void
}
