import { ActionButton } from "@/components/mobile/action-button"
import { CommerceOrderRow } from "@/components/mobile/commerce"
import { FormField } from "@/components/mobile/form-field"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { MobileScreen } from "@/components/mobile/screen"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useOrderVisibility } from "@/hooks/use-order-visibility"
import { useTRPC } from "@/trpc/client"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useDeferredValue, useState } from "react"
import { FlatList } from "react-native-css/components/FlatList"

export function SalesRepOrdersScreen() {
  const router = useRouter()
  const trpc = useTRPC()
  const visibility = useOrderVisibility()
  const [mine, setMine] = useState(false)
  const [search, setSearch] = useState("")
  const query = useDeferredValue(search)
  const orders = useInfiniteQuery(
    trpc.orders.listPage.infiniteQueryOptions(
      { mine, query: query.trim() || undefined, limit: 30 },
      {
        enabled: !visibility.isOffline,
        getNextPageParam: (page) => page.nextCursor,
        retry: false,
      },
    ),
  )
  const rows = orders.data?.pages.flatMap((page) => page.items) ?? []
  return (
    <MobileScreen scroll={false} testID="your-sales-screen">
      <FlatList
        data={rows}
        keyExtractor={(order) => order.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        refreshControl={<QueryRefreshControl />}
        ListHeaderComponent={
          <View className="gap-4 py-4">
            <ActionButton
              variant="ghost"
              icon="ArrowLeft"
              onPress={() => router.back()}
            >
              Back
            </ActionButton>
            <Text className="text-3xl font-bold text-foreground">
              Your sales
            </Text>
            {visibility.query.data?.salesRepOrderVisibility ===
            "ALL_STORE_ORDERS" ? (
              <View className="flex-row gap-2">
                <ActionButton
                  className="flex-1"
                  variant={mine ? "outline" : "default"}
                  onPress={() => setMine(false)}
                >
                  Store
                </ActionButton>
                <ActionButton
                  className="flex-1"
                  variant={mine ? "default" : "outline"}
                  onPress={() => setMine(true)}
                >
                  Mine
                </ActionButton>
              </View>
            ) : null}
            <FormField
              label="Search your sales"
              placeholder="Search your sales"
              variant="search"
              value={search}
              onChangeText={setSearch}
            />
            <ActionButton
              variant="outline"
              onPress={() => router.push("/global-search" as never)}
            >
              Look up an order
            </ActionButton>
            {orders.isError ? (
              <ActionButton
                variant="outline"
                onPress={() => void orders.refetch()}
              >
                Try loading sales again
              </ActionButton>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <CommerceOrderRow
            order={item}
            onPress={() =>
              router.push(`/order/${encodeURIComponent(item.id)}` as never)
            }
          />
        )}
        ListEmptyComponent={
          <Text className="py-6 text-muted-foreground">
            {visibility.isOffline
              ? "Reconnect to load your sales."
              : orders.isPending
                ? "Loading your sales…"
                : "No sales found."}
          </Text>
        }
        ListFooterComponent={
          orders.hasNextPage ? (
            <ActionButton
              variant="outline"
              isLoading={orders.isFetchingNextPage}
              onPress={() => void orders.fetchNextPage()}
            >
              Load more sales
            </ActionButton>
          ) : null
        }
      />
    </MobileScreen>
  )
}
