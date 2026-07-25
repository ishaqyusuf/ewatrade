import { CatalogItemOverview } from "@/components/mobile/catalog-item-overview"
import { EmptyState } from "@/components/mobile/empty-state"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { MobileScreen } from "@/components/mobile/screen"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"

export function CatalogItemScreen({
  catalogItemId,
}: {
  catalogItemId: string
}) {
  const router = useRouter()
  const trpc = useTRPC()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const itemQuery = useQuery(
    trpc.catalog.getItem.queryOptions(
      { itemId: catalogItemId },
      { enabled: Boolean(catalogItemId) && !isOffline, retry: false },
    ),
  )

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace("/catalog")
  }

  if (itemQuery.data) {
    return (
      <CatalogItemOverview
        item={itemQuery.data}
        onBack={goBack}
        onCreateOrder={() =>
          router.push({
            params: { catalogItemId: itemQuery.data.id },
            pathname: "/create-sale-modal",
          })
        }
      />
    )
  }

  return (
    <MobileScreen
      contentClassName="gap-6 px-4 pb-12"
      refreshControl={<QueryRefreshControl />}
      scroll
    >
      <View className="min-h-11 flex-row items-center gap-3">
        <Pressable
          accessibilityLabel="Back to catalog"
          accessibilityRole="button"
          className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
          haptic
          onPress={goBack}
        >
          <Icon className="size-base text-foreground" name="ArrowLeft" />
        </Pressable>
        <Text className="text-3xl font-extrabold tracking-tight text-foreground">
          Catalog overview
        </Text>
      </View>
      <View className="flex-1 items-center justify-center py-16">
        <EmptyState
          icon="Warehouse"
          message={
            isOffline
              ? "Reconnect to load this Product or Service."
              : itemQuery.isPending
                ? "Loading the latest Catalog details."
                : (itemQuery.error?.message ?? "Catalog item not found.")
          }
          title={
            isOffline
              ? "Overview unavailable offline"
              : itemQuery.isPending
                ? "Loading overview"
                : "Overview unavailable"
          }
        />
      </View>
    </MobileScreen>
  )
}
