import { ClassicCatalogItemScreen } from "@/components/mobile/appearances/classic/catalog-item-screen"
import { MarketDayCatalogItemScreen } from "@/components/mobile/appearances/market-day/catalog-item-screen"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { LIST_PAGE_SIZE } from "@/lib/list-pagination"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
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
  const availability = useQuery(
    trpc.tenant.featureAvailability.queryOptions(undefined, {
      enabled: !isOffline,
      retry: false,
    }),
  )
  const savedCatalog = useInfiniteQuery(
    trpc.catalog.listItemsPage.infiniteQueryOptions(
      { limit: LIST_PAGE_SIZE },
      { enabled: false, getNextPageParam: (page) => page.nextCursor },
    ),
  )
  const item =
    itemQuery.data ??
    (isOffline
      ? savedCatalog.data?.pages
          .flatMap((page) => page.items)
          .find((entry) => entry.id === catalogItemId)
      : undefined)
  const cachedTime = itemQuery.data
    ? itemQuery.dataUpdatedAt
    : savedCatalog.dataUpdatedAt
  const createOrder = (offeringId?: string) => {
    if (!item) return
    router.push({
      params: { catalogItemId: item.id, ...(offeringId ? { offeringId } : {}) },
      pathname: "/create-sale-modal",
    })
  }
  const goBack = () => {
    if (router.canGoBack()) router.back()
    else router.replace("/catalog")
  }
  return (
    <Screen
      item={item}
      storeId={availability.data?.storeId}
      cachedAt={
        isOffline && cachedTime
          ? new Date(cachedTime).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })
          : undefined
      }
      onCreateSelectedOrder={createOrder}
      isOffline={isOffline}
      isPending={
        Boolean(catalogItemId) &&
        (itemQuery.isPending || availability.isPending)
      }
      errorMessage={itemQuery.error?.message}
      onBack={goBack}
      onRetry={
        catalogItemId && !isOffline
          ? () => {
              void itemQuery.refetch()
            }
          : undefined
      }
      onCreateOrder={() => createOrder()}
    />
  )
}
