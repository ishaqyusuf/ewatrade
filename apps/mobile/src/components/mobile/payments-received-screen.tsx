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
import {
  PAYMENTS_RECEIVED_COPY,
  buildPaymentsReceivedPresentation,
} from "./payments-received-presentation"

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
  const currencyTotals = payments.data?.pages[0]?.currencyTotals ?? []
  const presentation = buildPaymentsReceivedPresentation({
    currencyTotals,
    defaultCurrencyCode: payments.data?.pages[0]?.defaultCurrencyCode ?? "NGN",
    isPending: payments.isPending,
    query,
    totalCount,
  })

  return (
    <View className="flex-1">
      <FlatList
        contentContainerClassName="flex-grow px-4 pb-32"
        data={rows}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          payments.isError ? null : (
            <EmptyState
              className="min-h-80 flex-1 justify-center border-b border-border px-0"
              icon="CreditCard"
              message={presentation.emptyMessage}
              title={presentation.emptyTitle}
              variant="flat"
            />
          )
        }
        ListFooterComponent={
          payments.isFetchingNextPage ? (
            <Text className="py-5 text-center text-xs font-semibold text-muted-foreground">
              Loading more payments…
            </Text>
          ) : null
        }
        ListHeaderComponent={
          <View className="gap-5 pb-3">
            <Text className="text-sm leading-5 text-muted-foreground">
              {PAYMENTS_RECEIVED_COPY.purpose}
            </Text>
            {payments.isError ? (
              <StatusBanner
                actionLabel="Try again"
                icon="AlertCircle"
                message={PAYMENTS_RECEIVED_COPY.error}
                onActionPress={() => void payments.refetch()}
                title="Payments unavailable"
                tone="destructive"
              />
            ) : payments.isPending ? null : (
              <View className="gap-2">
                <Text className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground">
                  Workspace total
                </Text>
                <View className="flex-row border-y border-border">
                  <View className="min-w-0 flex-[1.45] py-4 pr-4">
                    <Text className="text-xs text-muted-foreground">
                      Amount received
                    </Text>
                    <Text
                      className="mt-1 text-3xl font-extrabold tracking-tight text-foreground"
                      numberOfLines={1}
                    >
                      {presentation.amountLabel}
                    </Text>
                    {presentation.currencyAmountRows.map((amount) => (
                      <Text
                        className="mt-1 text-xs text-muted-foreground"
                        key={amount}
                      >
                        {amount}
                      </Text>
                    ))}
                  </View>
                  <View className="min-w-0 flex-1 border-l border-border py-4 pl-4">
                    <Text className="text-xs text-muted-foreground">
                      Payments
                    </Text>
                    <Text className="mt-1 text-2xl font-extrabold text-foreground">
                      {totalCount}
                    </Text>
                  </View>
                </View>
              </View>
            )}
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

      {!payments.isPending && !payments.isError && totalCount === 0 ? (
        <View className="mx-4 mb-6 flex-row gap-3 py-3">
          <Icon className="size-sm text-primary" name="Info" />
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-sm font-extrabold text-foreground">
              {PAYMENTS_RECEIVED_COPY.trailTitle}
            </Text>
            <Text className="text-xs leading-5 text-muted-foreground">
              {PAYMENTS_RECEIVED_COPY.trailDetail}
            </Text>
          </View>
        </View>
      ) : null}

      <BottomSearchFooter
        accessibilityLabel="Search received payments"
        alwaysShowSearch
        onChangeText={setQuery}
        placeholder="Search payments..."
        searchVisible={presentation.showSearch}
        totalCount={totalCount}
        value={query}
      />
    </View>
  )
}
