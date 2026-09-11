import {
  CommerceFirstOrderGate,
  CommercePendingOrderRow,
  commercialOrderHref,
} from "@/components/mobile/commerce"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import {
  OrdersDispatchFilterRow,
  OrdersDispatchLedgerMasthead,
  OrdersDispatchLedgerRow,
  OrdersDispatchLedgerSummary,
  OrdersDispatchSection,
} from "@/components/mobile/appearances/market-day/orders-dispatch-ledger"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import {
  LIST_PAGE_SIZE,
  shouldFetchNextListPage,
  shouldShowListSearch,
} from "@/lib/list-pagination"
import { useTRPC } from "@/trpc/client"
import { useInfiniteQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react"
import { type NativeScrollEvent, type NativeSyntheticEvent } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  useAdminDockScroll,
  useAdminTabs,
} from "@/components/mobile/admin-tabs/admin-tabs-context"

import { FlatList } from "react-native-css/components/FlatList"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import {
  ClassicOrdersScreen,
  ClassicOrdersMasthead,
  ClassicOrdersSummary,
  ClassicOrdersFilterRow,
  ClassicOrdersRow,
  ClassicOrdersSection,
} from "@/components/mobile/appearances/classic/orders-screen"
import { MarketDayOrdersScreen } from "@/components/mobile/appearances/market-day/orders-screen"
import type { OrderFilter } from "./orders-presentation"
type DateFilter = "all" | "today" | "7_days" | "30_days"

const OPEN_STATUSES = [
  "DRAFT",
  "PENDING",
  "CONFIRMED",
  "FULFILLING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
] as const

function createdAfterForDateFilter(filter: DateFilter) {
  if (filter === "all") return undefined
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  if (filter === "7_days") start.setDate(start.getDate() - 6)
  if (filter === "30_days") start.setDate(start.getDate() - 29)
  return start
}

function statusesForOrderFilter(filter: OrderFilter) {
  if (filter === "open") return [...OPEN_STATUSES]
  if (filter === "completed") return ["COMPLETED" as const]
  if (filter === "cancelled") {
    return ["CANCELLED" as const, "REFUNDED" as const]
  }
  return undefined
}

export function OrdersScreen() {
  const isMarketDay = useMobileDesign("orders") === "market-day"
  const Screen = isMarketDay ? MarketDayOrdersScreen : ClassicOrdersScreen
  const Masthead = isMarketDay
    ? OrdersDispatchLedgerMasthead
    : ClassicOrdersMasthead
  const Summary = isMarketDay
    ? OrdersDispatchLedgerSummary
    : ClassicOrdersSummary
  const Section = isMarketDay ? OrdersDispatchSection : ClassicOrdersSection
  const FilterRow = isMarketDay
    ? OrdersDispatchFilterRow
    : ClassicOrdersFilterRow
  const Row = isMarketDay ? OrdersDispatchLedgerRow : ClassicOrdersRow
  const auth = useAuthContext()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const trpc = useTRPC()
  const {
    availability,
    availabilityResolved,
    isDockHidden,
    isOffline,
    openCreate,
    provisionalOrders,
  } = useAdminTabs()
  const handleDockScroll = useAdminDockScroll()
  const [dateFilter, setDateFilter] = useState<DateFilter>("30_days")
  const [filter, setFilter] = useState<OrderFilter>("all")
  const [mastheadHeight, setMastheadHeight] = useState(0)
  const [query, setQuery] = useState("")
  const [showCanvasStatusBar, setShowCanvasStatusBar] = useState(false)
  const deferredQuery = useDeferredValue(query)
  useEffect(() => {
    if (isOffline && query) setQuery("")
  }, [isOffline, query])
  const createdAfter = useMemo(
    () => createdAfterForDateFilter(dateFilter),
    [dateFilter],
  )
  const statuses = useMemo(() => statusesForOrderFilter(filter), [filter])
  const orders = useInfiniteQuery(
    trpc.orders.listPage.infiniteQueryOptions(
      {
        createdAfter,
        limit: LIST_PAGE_SIZE,
        query: isOffline ? undefined : deferredQuery || undefined,
        statuses,
      },
      {
        enabled: !isOffline,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const loadedOrders = useMemo(
    () => orders.data?.pages.flatMap((page) => page.items) ?? [],
    [orders.data?.pages],
  )
  const visibleOrders = loadedOrders
  const visibleProvisionalOrders = useMemo(() => {
    if (filter === "completed" || filter === "cancelled") return []
    const normalizedQuery = isOffline ? "" : query.trim().toLowerCase()
    if (!normalizedQuery) return provisionalOrders
    return provisionalOrders.filter((order) =>
      `${order.customerName ?? ""} ${order.customerPhone ?? ""} queued pending sync`
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [filter, isOffline, provisionalOrders, query])
  const totalCount = orders.data?.pages[0]?.totalCount ?? 0
  const showSearch = shouldShowListSearch(
    Math.max(totalCount, loadedOrders.length) + provisionalOrders.length,
  )
  const showFirstOrderGate =
    !isOffline &&
    availabilityResolved &&
    orders.isSuccess &&
    loadedOrders.length === 0 &&
    totalCount === 0 &&
    !availability.hasOrders &&
    provisionalOrders.length === 0
  const resetFilters = () => {
    setDateFilter("all")
    setFilter("all")
    setQuery("")
  }
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      handleDockScroll(event)
      const scrollY = Math.max(0, event.nativeEvent.contentOffset.y)
      const shouldUseCanvas =
        mastheadHeight > 0 && scrollY + 0.5 >= mastheadHeight - insets.top
      setShowCanvasStatusBar((current) =>
        current === shouldUseCanvas ? current : shouldUseCanvas,
      )
    },
    [handleDockScroll, insets.top, mastheadHeight],
  )
  useEffect(() => {
    setShowCanvasStatusBar(false)
    setMastheadHeight(0)
  }, [isMarketDay])

  return (
    <Screen showCanvasStatusBar={showCanvasStatusBar}>
      <FlatList
        contentContainerClassName="grow px-[var(--orders-list-side)] pt-[var(--orders-list-top)] pb-[var(--orders-list-bottom)]"
        data={visibleOrders}
        keyExtractor={(order) => order.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          visibleProvisionalOrders.length === 0 &&
          !showFirstOrderGate &&
          !orders.isError ? (
            <Section>
              <EmptyState
                actionLabel={
                  (orders.isPending && !isOffline) || isOffline
                    ? undefined
                    : "Clear filters"
                }
                actionProps={{ onPress: resetFilters, variant: "outline" }}
                className="mt-3"
                icon="ReceiptText"
                message={
                  orders.isPending && !isOffline
                    ? "Loading Commercial Orders."
                    : isOffline
                      ? "Reconnect to refresh Orders from your workspace."
                      : query || filter !== "all" || dateFilter !== "all"
                        ? "Try another date, search, or status filter."
                        : "New Product and Service Orders will appear here."
                }
                title={
                  orders.isPending && !isOffline
                    ? "Loading orders"
                    : isOffline
                      ? "No cached orders"
                      : query || filter !== "all" || dateFilter !== "all"
                        ? "No matching orders"
                        : "No orders yet"
                }
              />
            </Section>
          ) : null
        }
        ListHeaderComponent={
          <View className="gap-5 pb-4">
            <Masthead
              businessName={auth.profile?.businessName ?? "Your business"}
              onCustomersPress={() => router.push("/customer-book-modal")}
              onLayout={(event) => {
                const height = event.nativeEvent.layout.height
                setMastheadHeight((current) =>
                  current === height ? current : height,
                )
              }}
            />
            {!showFirstOrderGate ? (
              <Summary dateFilter={dateFilter} orders={visibleOrders} />
            ) : null}
            <Section>
              {provisionalOrders.length > 0 ? (
                <StatusBanner
                  icon="Wind"
                  message={`${provisionalOrders.length} queued ${provisionalOrders.length === 1 ? "Order is" : "Orders are"} shown below and will reconcile after sync.`}
                  title="Orders pending sync"
                  tone="warning"
                />
              ) : null}
              {isOffline ? (
                <StatusBanner
                  icon="Wind"
                  message="Showing cached Orders and device work. Payment and fulfilment actions require a connection."
                  title="Offline mode"
                  tone="warning"
                />
              ) : null}
              {orders.isError ? (
                <StatusBanner
                  actionLabel="Try again"
                  icon="AlertCircle"
                  message={orders.error.message}
                  onActionPress={() => void orders.refetch()}
                  tone="destructive"
                />
              ) : null}
              {showFirstOrderGate ? (
                <CommerceFirstOrderGate
                  catalogReady={availability.hasActiveSellableItems}
                  onPrimaryPress={() => {
                    if (availability.hasActiveSellableItems) {
                      router.push("/create-sale-modal")
                    } else {
                      router.push("/first-product-setup-modal")
                    }
                  }}
                />
              ) : (
                <>
                  <FilterRow
                    active={dateFilter}
                    labels={{
                      "30_days": "30 days",
                      "7_days": "7 days",
                      all: "All time",
                      today: "Today",
                    }}
                    onChange={setDateFilter}
                    values={["today", "7_days", "30_days", "all"]}
                  />
                  <FilterRow
                    active={filter}
                    labels={{
                      all: `All ${totalCount}`,
                      cancelled: "Cancelled",
                      completed: "Done",
                      open: "Open",
                    }}
                    onChange={setFilter}
                    values={["all", "open", "completed", "cancelled"]}
                  />
                  {showSearch && !isOffline ? (
                    <FormField
                      autoCapitalize="none"
                      label="Search"
                      leadingIcon="Search"
                      onChangeText={setQuery}
                      placeholder="Search order, customer, or item"
                      value={query}
                    />
                  ) : null}
                </>
              )}
              {visibleProvisionalOrders.map((order) => (
                <CommercePendingOrderRow
                  key={order.clientCommandId}
                  order={order}
                />
              ))}
            </Section>
          </View>
        }
        onScroll={handleScroll}
        onEndReached={() => {
          if (
            shouldFetchNextListPage({
              hasNextPage: Boolean(orders.hasNextPage),
              isFetchingNextPage: orders.isFetchingNextPage,
            })
          ) {
            void orders.fetchNextPage()
          }
        }}
        onEndReachedThreshold={0.35}
        refreshControl={<QueryRefreshControl />}
        ListFooterComponent={
          orders.isFetchingNextPage ? (
            <Text className="py-5 text-center text-xs font-semibold text-muted-foreground">
              Loading more orders…
            </Text>
          ) : null
        }
        renderItem={({ index, item }) => (
          <Section>
            <Row
              index={index}
              onPress={() => router.push(commercialOrderHref(item.id))}
              order={item}
            />
          </Section>
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />
      {isDockHidden && !showFirstOrderGate ? (
        <ListCreateFab
          accessibilityLabel="Add order"
          dockHidden
          onPress={() => {
            if (availability.hasActiveSellableItems) {
              router.push("/create-sale-modal")
            } else {
              openCreate()
            }
          }}
          sitsAboveDock
          testID="orders-add-fab"
        />
      ) : null}
    </Screen>
  )
}
