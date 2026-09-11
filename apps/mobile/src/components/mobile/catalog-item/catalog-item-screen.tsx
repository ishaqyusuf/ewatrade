import { ClassicCatalogItemScreen } from "@/components/mobile/appearances/classic/catalog-item-screen"
import { MarketDayCatalogItemScreen } from "@/components/mobile/appearances/market-day/catalog-item-screen"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"

export function CatalogItemScreen({
  catalogItemId,
}: { catalogItemId: string }) {
  const router = useRouter()
  const trpc = useTRPC()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const isMarketDay = useMobileDesign("catalog-item") === "market-day"
  const Screen = isMarketDay
    ? MarketDayCatalogItemScreen
    : ClassicCatalogItemScreen
  const itemQuery = useQuery(
    trpc.catalog.getItem.queryOptions(
      { itemId: catalogItemId },
      { enabled: Boolean(catalogItemId) && !isOffline, retry: false },
    ),
  )
  const goBack = () => {
    if (router.canGoBack()) router.back()
    else router.replace("/catalog")
  }
  return (
    <Screen
      item={itemQuery.data}
      isOffline={isOffline}
      isPending={Boolean(catalogItemId) && itemQuery.isPending}
      errorMessage={itemQuery.error?.message}
      onBack={goBack}
      onRetry={
        catalogItemId && !isOffline
          ? () => {
              void itemQuery.refetch()
            }
          : undefined
      }
      onCreateOrder={() => {
        if (!itemQuery.data) return
        router.push({
          params: { catalogItemId: itemQuery.data.id },
          pathname: "/create-sale-modal",
        })
      }}
    />
  )
}
