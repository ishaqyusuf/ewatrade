import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { LIST_PAGE_SIZE, shouldFetchNextListPage } from "@/lib/list-pagination"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useDeferredValue, useMemo, useState } from "react"
import { FlatList } from "react-native"

function formatPaymentDate(value: Date | string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))
}

function label(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function PaymentsReceivedScreen() {
  const router = useRouter()
  const trpc = useTRPC()
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query.trim())
  const payments = useInfiniteQuery(
    trpc.orders.payments.infiniteQueryOptions(
      {
        limit: LIST_PAGE_SIZE,
        query: deferredQuery || undefined,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const rows = useMemo(
    () => payments.data?.pages.flatMap((page) => page.items) ?? [],
    [payments.data?.pages],
  )
  const totalCount = payments.data?.pages[0]?.totalCount ?? 0

  return (
    <View className="flex-1">
      <FlatList
        contentContainerClassName="flex-grow px-4 pb-32"
        data={rows}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            className="flex-1 justify-center"
            icon="CreditCard"
            message={
              payments.isPending
                ? "Loading received payments."
                : query
                  ? "Try an order number, customer, reference, or receiver."
                  : "Payments recorded against orders will appear here."
            }
            title={
              payments.isPending
                ? "Loading payments"
                : query
                  ? "No matching payments"
                  : "No payments received"
            }
          />
        }
        ListFooterComponent={
          payments.isFetchingNextPage ? (
            <Text className="py-5 text-center text-xs font-semibold text-muted-foreground">
              Loading more payments…
            </Text>
          ) : null
        }
        ListHeaderComponent={
          <View className="gap-4 pb-3">
            <Text className="text-sm leading-5 text-muted-foreground">
              {totalCount} {totalCount === 1 ? "payment" : "payments"} received
              across this workspace.
            </Text>
            {payments.isError ? (
              <StatusBanner
                actionLabel="Try again"
                icon="AlertCircle"
                message={payments.error.message}
                onActionPress={() => void payments.refetch()}
                tone="destructive"
              />
            ) : null}
          </View>
        }
        onEndReached={() => {
          if (
            shouldFetchNextListPage({
              hasNextPage: payments.hasNextPage,
              isFetchingNextPage: payments.isFetchingNextPage,
            })
          ) {
            void payments.fetchNextPage()
          }
        }}
        onEndReachedThreshold={0.35}
        renderItem={({ item }) => (
          <Pressable
            accessibilityLabel={`Open order ${item.order.orderNumber}`}
            accessibilityRole="button"
            className="min-h-20 flex-row items-center gap-3 border-b border-border py-4 active:bg-accent"
            haptic
            onPress={() =>
              router.push(`/order/${encodeURIComponent(item.order.id)}`)
            }
            transition
          >
            <View className="size-11 items-center justify-center rounded-full bg-muted">
              <Icon className="size-sm text-primary" name="CreditCard" />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <View className="flex-row items-center justify-between gap-3">
                <Text
                  className="min-w-0 flex-1 font-extrabold text-foreground"
                  numberOfLines={1}
                >
                  {item.order.orderNumber}
                </Text>
                <Text className="font-extrabold tabular-nums text-foreground">
                  {formatMinorMoney(item.amountMinor, item.order.currencyCode)}
                </Text>
              </View>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {item.order.customerName ?? "Walk-in customer"} ·{" "}
                {label(item.method)}
              </Text>
              <Text className="text-xs font-semibold text-muted-foreground">
                Received by {item.recordedBy?.name ?? "Unknown team member"} ·{" "}
                {formatPaymentDate(item.recordedAt)}
              </Text>
            </View>
            <Icon
              className="size-sm text-muted-foreground"
              name="ChevronRight"
            />
          </Pressable>
        )}
      />

      <BottomSearchFooter
        accessibilityLabel="Search received payments"
        alwaysShowSearch
        onChangeText={setQuery}
        placeholder="Search payments..."
        totalCount={totalCount}
        value={query}
      />
    </View>
  )
}
