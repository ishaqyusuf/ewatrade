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
import { useInfiniteQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useDeferredValue, useMemo, useState } from "react"
import { FlatList } from "react-native"
import { BottomSearchFooter } from "./bottom-search-footer"
import { HeroCard } from "./green-till/hero-card"
import { RecordRow, RowDivider } from "./green-till/kit"
import { loadedPaymentTotals, paymentDay, paymentTint } from "./payment-display"
import {
  PAYMENTS_RECEIVED_COPY,
  buildPaymentsReceivedPresentation,
} from "./payments-received-presentation"

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
  const [query, setQuery] = useState("")
  const [footerHeight, setFooterHeight] = useState(88)
  const scrollHide = useBottomSearchScroll()
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
  const today = paymentDay(new Date())
  const todayRows = rows.filter((row) => paymentDay(row.recordedAt) === today)
  const dayTotals = useMemo(() => {
    const byDay = new Map<string, typeof rows>()
    for (const row of rows) {
      const day = paymentDay(row.recordedAt)
      byDay.set(day, [...(byDay.get(day) ?? []), row])
    }
    return new Map(
      [...byDay].map(([day, list]) => [
        day,
        loadedPaymentTotals(list).join(" · "),
      ]),
    )
  }, [rows])
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
                sub={
                  !payments.data
                    ? "Received total unavailable"
                    : presentation.currencyAmountRows.length
                      ? presentation.currencyAmountRows.join(" · ")
                      : deferredQuery
                        ? `${totalCount} matching payment${totalCount === 1 ? "" : "s"}`
                        : todayRows.length
                          ? `${loadedPaymentTotals(todayRows).join(" · ")} received today · ${todayRows.length} payment${todayRows.length === 1 ? "" : "s"}`
                          : "Nothing received today yet"
                }
              />
            )}
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
                    className="text-[11px] font-extrabold uppercase tracking-[1.2px] text-muted-foreground"
                  >
                    {dayHeading(item.recordedAt)}
                  </Text>
                  <Text className="text-[12.5px] font-extrabold tabular-nums text-foreground">
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
                    <Text className="text-[11px] tabular-nums text-muted-foreground">
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
          onHeightChange={setFooterHeight}
          placeholder={
            offline
              ? "Search needs a connection"
              : "Search order, customer, method"
          }
          showDisabledOfflineSearch
          totalCount={totalCount}
          value={query}
          variant="action-bar"
        />
      ) : null}
    </View>
  )
}
