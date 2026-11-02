import { EmptyState } from "@/components/mobile/empty-state"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useBottomSearchScroll } from "@/hooks/use-bottom-search-scroll"
import { useColors } from "@/hooks/use-color"
import { LIST_PAGE_SIZE, shouldFetchNextListPage } from "@/lib/list-pagination"
import { cn } from "@/lib/utils"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { formatMinorMoney } from "@ewatrade/utils"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { useLocalSearchParams, useRouter } from "expo-router"
import { useDeferredValue, useMemo, useState } from "react"
import { FlatList } from "react-native"
import { ClassicOrdersFilterRow } from "./appearances/classic/orders-screen"
import { BottomSearchFooter } from "./bottom-search-footer"
import { HeroCard } from "./green-till/hero-card"
import { RecordRow, RowDivider } from "./green-till/kit"
import {
  exactPaymentTotals,
  loadedPaymentTotals,
  paymentDay,
  paymentDayWindow,
  paymentTint,
} from "./payment-display"
import {
  type PaymentMethodFilter,
  paymentMethodChips,
  paymentMethodFilter,
  paymentMethodLabel,
  paymentMethodStats,
} from "./payment-methods"
import {
  PAYMENTS_RECEIVED_COPY,
  buildPaymentsReceivedPresentation,
} from "./payments-received-presentation"
import { SearchFold, useSearchFold } from "./search-fold"

function paymentTime(value: Date | string) {
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** "Today", "Yesterday", "6 Oct" (with the year when it is not this year). */
function dayHeading(value: Date | string) {
  const at = new Date(value)
  const now = new Date()
  const start = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((start(now) - start(at)) / 86_400_000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  })
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
  const colors = useColors()
  const trpc = useTRPC()
  // Reports' "Received" rows open this list on their method.
  const params = useLocalSearchParams<{ method?: string }>()
  const [method, setMethod] = useState<PaymentMethodFilter | "all">(
    () => (params.method && paymentMethodFilter(params.method)) || "all",
  )
  // Saved pages only cover the last method loaded online, so offline shows all.
  const activeMethod = offline ? "all" : method
  const methods = activeMethod === "all" ? undefined : [activeMethod]
  const [query, setQuery] = useState("")
  const [footerHeight, setFooterHeight] = useState(88)
  const scrollHide = useBottomSearchScroll()
  const searchFold = useSearchFold(query)
  const deferredQuery = useDeferredValue(query.trim())
  const payments = useInfiniteQuery(
    trpc.orders.payments.infiniteQueryOptions(
      {
        limit: LIST_PAGE_SIZE,
        methods,
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
  // Chip counts cover every method for the search, whichever chip is picked.
  const methodTotals = useQuery(
    trpc.orders.paymentTotals.queryOptions(
      { query: deferredQuery || undefined },
      { enabled: !offline, retry: false },
    ),
  )
  const methodChips = paymentMethodChips(
    methodTotals.data?.currencyTotals ?? [],
    activeMethod,
  )
  const methodName =
    activeMethod === "all" ? null : paymentMethodLabel(activeMethod)
  // "cash payments", but "POS payments".
  const methodWord =
    methodName && methodName !== "POS" ? methodName.toLowerCase() : methodName
  const today = paymentDay(new Date())
  const todayRows = rows.filter((row) => paymentDay(row.recordedAt) === today)
  // Today's line and a day that runs onto the next page come from the server,
  // so they never stop at the payments loaded so far.
  // biome-ignore lint/correctness/useExhaustiveDependencies: The window moves when the day changes.
  const todayWindow = useMemo(() => paymentDayWindow(new Date()), [today])
  const todayTotals = useQuery(
    trpc.orders.paymentTotals.queryOptions(
      { ...todayWindow, methods },
      {
        enabled: !offline && !deferredQuery,
        retry: false,
      },
    ),
  )
  const lastRecordedAt = rows.at(-1)?.recordedAt
  const lastDay = lastRecordedAt ? paymentDay(lastRecordedAt) : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: One window per loaded last day.
  const lastDayWindow = useMemo(
    () => (lastRecordedAt ? paymentDayWindow(lastRecordedAt) : null),
    [lastDay],
  )
  const lastDayTotals = useQuery(
    trpc.orders.paymentTotals.queryOptions(
      { ...lastDayWindow, methods, query: deferredQuery || undefined },
      {
        enabled: Boolean(!offline && lastDayWindow && payments.hasNextPage),
        retry: false,
      },
    ),
  )
  const dayTotals = useMemo(() => {
    const byDay = new Map<string, typeof rows>()
    for (const row of rows) {
      const day = paymentDay(row.recordedAt)
      byDay.set(day, [...(byDay.get(day) ?? []), row])
    }
    return new Map(
      [...byDay].map(([day, list]) => [
        day,
        day === lastDay && payments.hasNextPage
          ? lastDayTotals.data
            ? exactPaymentTotals(lastDayTotals.data.currencyTotals).join(" · ")
            : `Loaded · ${loadedPaymentTotals(list).join(" · ")}`
          : loadedPaymentTotals(list).join(" · "),
      ]),
    )
  }, [rows, lastDay, lastDayTotals.data, payments.hasNextPage])
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
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: footerHeight + 24,
          paddingHorizontal: 18,
        }}
        onScroll={scrollHide.onScroll}
        scrollEventThrottle={16}
        data={rows}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          payments.isError ? null : payments.isPending && !offline ? (
            <ListSkeleton count={6} label="Loading payments" variant="ledger" />
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
          ) : rows.length ? (
            <View className="mt-4 flex-row gap-2 px-0.5">
              <Icon
                className="mt-0.5 size-[14px]"
                color={colors.mutedForeground}
                name="Info"
              />
              <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
                Refunds stay with their orders and are not counted in this list.
              </Text>
            </View>
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
            <SearchFold folded={searchFold.folded}>
              {payments.isPending && !offline ? (
                <Skeleton className="h-48 rounded-[22px]" />
              ) : (
                <HeroCard
                  label={
                    deferredQuery
                      ? `Matching ${methodWord ? `${methodWord} ` : ""}payments · all time`
                      : `${methodName ?? "Received"} · all time`
                  }
                  amount={payments.data ? presentation.amountLabel : "—"}
                  pill={
                    offline
                      ? { label: "Offline", tone: "offline" }
                      : payments.data
                        ? {
                            label: `${totalCount} payment${totalCount === 1 ? "" : "s"}`,
                            tone: "synced",
                          }
                        : undefined
                  }
                  stats={
                    payments.data && activeMethod === "all"
                      ? paymentMethodStats(currencyTotals)
                      : undefined
                  }
                  sub={
                    !payments.data
                      ? "Received total unavailable"
                      : presentation.currencyAmountRows.length
                        ? presentation.currencyAmountRows.join(" · ")
                        : deferredQuery
                          ? `${totalCount} matching payment${totalCount === 1 ? "" : "s"}`
                          : todayTotals.data
                            ? todayTotals.data.totalCount
                              ? `${exactPaymentTotals(todayTotals.data.currencyTotals).join(" · ")} received today · ${todayTotals.data.totalCount} payment${todayTotals.data.totalCount === 1 ? "" : "s"}`
                              : "Nothing received today yet"
                            : todayRows.length
                              ? `Loaded · ${loadedPaymentTotals(todayRows).join(" · ")} received today`
                              : "Nothing received today yet"
                  }
                />
              )}
            </SearchFold>
            {!offline &&
            (methodChips.values.length > 2 || activeMethod !== "all") ? (
              <ClassicOrdersFilterRow
                active={activeMethod}
                labels={methodChips.labels}
                onChange={setMethod}
                values={methodChips.values}
              />
            ) : null}
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
          const lastInDay =
            index === rows.length - 1 ||
            paymentDay(rows[index + 1].recordedAt) !== day
          return (
            <View>
              {firstInDay ? (
                <View
                  className={cn(
                    "mb-2 flex-row items-baseline justify-between px-0.5",
                    index > 0 && "mt-4",
                  )}
                >
                  <Text
                    accessibilityRole="header"
                    className="text-xs font-extrabold uppercase tracking-[1.2px] text-muted-foreground"
                  >
                    {dayHeading(item.recordedAt)}
                  </Text>
                  <Text className="text-xs font-extrabold tabular-nums text-foreground">
                    {dayTotals.get(day)}
                  </Text>
                </View>
              ) : null}
              <View
                className={cn(
                  "overflow-hidden bg-card px-3.5",
                  firstInDay && "rounded-t-[20px]",
                  lastInDay && "rounded-b-[20px]",
                )}
              >
                <RecordRow
                  stackDetails
                  title={item.order.customerName || "Walk-in customer"}
                  meta={`${item.order.orderNumber} · ${label(item.method)}${item.recordedBy?.name ? ` · by ${item.recordedBy.name}` : ""}`}
                  status={
                    <Text className="text-xs tabular-nums text-muted-foreground">
                      {paymentTime(item.recordedAt)}
                    </Text>
                  }
                  avatar={{
                    icon:
                      item.method === "CASH"
                        ? "Wallet"
                        : item.method === "BANK_TRANSFER"
                          ? "ArrowLeftRight"
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
                {lastInDay ? null : <RowDivider />}
              </View>
            </View>
          )
        }}
      />
      {presentation.showSearch || offline ? (
        <BottomSearchFooter
          alwaysShowSearch
          accessibilityLabel="Search received payments"
          hidden={scrollHide.hidden}
          maxLength={160}
          onChangeText={setQuery}
          onFocusChange={searchFold.onFocusChange}
          onHeightChange={setFooterHeight}
          placeholder={
            offline
              ? "Search needs a connection"
              : methodWord
                ? `Search ${methodWord} payments`
                : "Search order, customer, method"
          }
          showDisabledOfflineSearch
          totalCount={totalCount}
          value={query}
        />
      ) : null}
    </View>
  )
}
