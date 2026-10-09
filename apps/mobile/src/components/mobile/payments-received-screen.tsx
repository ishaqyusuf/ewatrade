import { EmptyState } from "@/components/mobile/empty-state"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { LIST_PAGE_SIZE, shouldFetchNextListPage } from "@/lib/list-pagination"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useDeferredValue, useMemo, useState } from "react"
import { FlatList } from "react-native"
import { FormField } from "./form-field"
import { HeroCard } from "./green-till/hero-card"
import { ListCard, RecordRow, SectionHeader } from "./green-till/kit"
import { loadedPaymentTotals, paymentDay, paymentTint } from "./payment-display"
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
  const offline = useOperationalModeStore((s) => s.isOfflineMode)
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
        enabled: !offline,
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
        contentContainerClassName="flex-grow px-[18px] pb-12"
        data={rows}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          payments.isPending && !offline ? (
            <Skeleton className="h-40 rounded-[20px]" />
          ) : payments.data ? (
            <EmptyState
              icon="CreditCard"
              message={presentation.emptyMessage}
              title={presentation.emptyTitle}
            />
          ) : null
        }
        ListFooterComponent={
          payments.isFetchingNextPage ? (
            <Skeleton className="mt-3 h-20 rounded-[20px]" />
          ) : null
        }
        ListHeaderComponent={
          <View className="gap-4 pb-4">
            {offline ? (
              <StatusBanner
                title="Offline"
                message={
                  payments.data
                    ? `Saved payments · as of ${new Date(payments.dataUpdatedAt).toLocaleString()}. Reconnect to search or load more.`
                    : "Reconnect to load received payments."
                }
                tone="warning"
              />
            ) : null}
            {payments.isError ? (
              <StatusBanner
                actionLabel={offline ? undefined : "Try again"}
                icon="AlertCircle"
                message={PAYMENTS_RECEIVED_COPY.error}
                onActionPress={() => void payments.refetch()}
                title="Payments unavailable"
                tone="destructive"
              />
            ) : null}
            {payments.isPending && !offline ? (
              <Skeleton className="h-48 rounded-[22px]" />
            ) : (
              <HeroCard
                label={
                  deferredQuery
                    ? "Matching payments · all time"
                    : "Received · all time"
                }
                amount={payments.data ? presentation.amountLabel : "—"}
                sub={
                  payments.data
                    ? presentation.currencyAmountRows.join(" · ") ||
                      PAYMENTS_RECEIVED_COPY.purpose
                    : "Received total unavailable"
                }
                stats={[
                  {
                    label: "Payments",
                    value: payments.data ? String(totalCount) : "—",
                  },
                ]}
              />
            )}
            <FormField
              label="Search received payments"
              variant="search"
              leadingIcon="Search"
              placeholder="Customer, order or reference"
              value={query}
              onChangeText={setQuery}
              editable={!offline}
              helper={
                offline ? "Search is available when connected." : undefined
              }
            />
          </View>
        }
        onEndReached={() => {
          if (
            !offline &&
            shouldFetchNextListPage({
              hasNextPage: payments.hasNextPage,
              isFetchingNextPage: payments.isFetchingNextPage,
            })
          )
            void payments.fetchNextPage()
        }}
        onEndReachedThreshold={0.35}
        renderItem={({ item, index }) => {
          const day = paymentDay(item.recordedAt)
          const firstInDay =
            index === 0 || paymentDay(rows[index - 1].recordedAt) !== day
          return (
            <View className="gap-2">
              {firstInDay ? (
                <SectionHeader
                  title={day}
                  trailing={
                    <Text className="max-w-[55%] text-right text-xs text-muted-foreground">
                      Loaded:{" "}
                      {loadedPaymentTotals(
                        rows.filter(
                          (row) => paymentDay(row.recordedAt) === day,
                        ),
                      ).join(" · ")}
                    </Text>
                  }
                />
              ) : null}
              <ListCard>
                <RecordRow
                  stackDetails
                  title={item.order.customerName || "Walk-in customer"}
                  meta={`${item.order.orderNumber} · ${label(item.method)} · ${item.recordedBy?.name ?? "Unknown receiver"} · ${formatPaymentDate(item.recordedAt)}`}
                  avatar={{
                    icon:
                      item.method === "CASH"
                        ? "Wallet"
                        : item.method === "BANK_TRANSFER"
                          ? "RefreshCw"
                          : "CreditCard",
                    tint: paymentTint(item.method),
                  }}
                  amount={formatMinorMoney(
                    item.amountMinor,
                    item.order.currencyCode,
                  )}
                  onPress={() =>
                    router.push(`/order/${encodeURIComponent(item.order.id)}`)
                  }
                />
              </ListCard>
            </View>
          )
        }}
      />
    </View>
  )
}
