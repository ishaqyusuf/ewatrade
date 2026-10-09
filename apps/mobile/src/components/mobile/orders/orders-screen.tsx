import { ActionButton } from "@/components/mobile/action-button"
import {
  useAdminDockScroll,
  useAdminTabs,
} from "@/components/mobile/admin-tabs/admin-tabs-context"
import {
  OrdersDispatchFilterRow,
  OrdersDispatchLedgerMasthead,
  OrdersDispatchLedgerRow,
  OrdersDispatchLedgerSummary,
  OrdersDispatchSection,
} from "@/components/mobile/appearances/market-day/orders-dispatch-ledger"
import {
  CommerceFirstOrderGate,
  CommercePendingOrderRow,
  commercialOrderHref,
} from "@/components/mobile/commerce"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { ListSkeleton } from "@/components/mobile/loading-skeletons"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { toggleReceiptSelection } from "@/components/mobile/receipts/receipt-selection"
import { StatusBanner } from "@/components/mobile/status-banner"
import { RevealItem, useFirstReveal } from "@/components/ui/motion"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useOrderVisibility } from "@/hooks/use-order-visibility"
import { useScrollEdgeFeedback } from "@/hooks/use-scroll-edge-feedback"
import {
  LIST_PAGE_SIZE,
  shouldFetchNextListPage,
  shouldShowListSearch,
} from "@/lib/list-pagination"
import { isSalesRepRole } from "@/lib/mobile-roles"
import { useTRPC } from "@/trpc/client"
import { isReceiptOrderEligible } from "@ewatrade/order-receipts"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { VariableContextProvider } from "nativewind"
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { SALE_STATUSES } from "../dashboard/green-till-home-model"
import { ledgerDayHeaders, ledgerDayPositions } from "./orders-ledger-model"

import {
  ClassicFirstOrderGate,
  ClassicOrdersFilterRow,
  ClassicOrdersMasthead,
  ClassicOrdersRow,
  ClassicOrdersScreen,
  ClassicOrdersSection,
  ClassicOrdersSkeleton,
  ClassicOrdersSummary,
  ClassicPendingOrderRow,
} from "@/components/mobile/appearances/classic/orders-screen"
import { MarketDayOrdersScreen } from "@/components/mobile/appearances/market-day/orders-screen"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { FlatList } from "react-native-css/components/FlatList"
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
  const FirstOrderGate = isMarketDay
    ? CommerceFirstOrderGate
    : ClassicFirstOrderGate
  const auth = useAuthContext()
  const visibility = useOrderVisibility()
  const rep = isSalesRepRole(auth.profile?.role)
  const [salesView, setSalesView] = useState<"store" | "mine">("store")
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const {
    availability,
    availabilityResolved,
    isDockHidden,
    isOffline,
    openCreate,
    provisionalOrders,
  } = useAdminTabs()
  const edgeFeedback = useScrollEdgeFeedback()
  const handleDockScroll = useAdminDockScroll()
  const [dateFilter, setDateFilter] = useState<DateFilter>("30_days")
  const [filter, setFilter] = useState<OrderFilter>("all")
  const [mastheadHeight, setMastheadHeight] = useState(0)
  const [query, setQuery] = useState("")
  const [selectingReceipts, setSelectingReceipts] = useState(false)
  const [receiptIds, setReceiptIds] = useState<string[]>([])
  // biome-ignore lint/correctness/useExhaustiveDependencies: These values define the selection scope.
  useEffect(() => {
    setReceiptIds([])
    setSelectingReceipts(false)
  }, [
    auth.profile?.businessId,
    auth.profile?.storeId,
    dateFilter,
    filter,
    query,
    isOffline,
    salesView,
  ])
  const [showCanvasStatusBar, setShowCanvasStatusBar] = useState(false)
  const deferredQuery = useDeferredValue(query)
  useEffect(() => {
    if (isMarketDay && isOffline && query) setQuery("")
  }, [isMarketDay, isOffline, query])
  const createdAfter = useMemo(
    () => createdAfterForDateFilter(dateFilter),
    [dateFilter],
  )
  const statuses = useMemo(() => statusesForOrderFilter(filter), [filter])
  // Classic hero and status counts come from the server for the period, not
  // from the orders loaded so far. "All time" uses the bounded window path.
  const reportWindow = useMemo(
    () => ({
      createdAfter: createdAfter ?? new Date(0),
      mine: rep && salesView === "mine",
    }),
    [createdAfter, rep, salesView],
  )
  const reportEnabled = !isMarketDay && !isOffline
  const salesReport = useQuery(
    trpc.orders.reportSummary.queryOptions(
      { ...reportWindow, statuses: [...SALE_STATUSES] },
      { enabled: reportEnabled, retry: false },
    ),
  )
  const countAll = useQuery(
    trpc.orders.reportSummary.queryOptions(reportWindow, {
      enabled: reportEnabled,
      retry: false,
    }),
  )
  const countOpen = useQuery(
    trpc.orders.reportSummary.queryOptions(
      { ...reportWindow, statuses: [...OPEN_STATUSES] },
      { enabled: reportEnabled, retry: false },
    ),
  )
  const countDone = useQuery(
    trpc.orders.reportSummary.queryOptions(
      { ...reportWindow, statuses: ["COMPLETED"] },
      { enabled: reportEnabled, retry: false },
    ),
  )
  const countCancelled = useQuery(
    trpc.orders.reportSummary.queryOptions(
      { ...reportWindow, statuses: ["CANCELLED", "REFUNDED"] },
      { enabled: reportEnabled, retry: false },
    ),
  )
  const statusCount = (value?: { orderCount: number }) =>
    value ? ` ${value.orderCount}` : ""
  const searchedOrders = useInfiniteQuery(
    trpc.orders.listPage.infiniteQueryOptions(
      {
        mine: rep && salesView === "mine",
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
  const savedOrders = useInfiniteQuery(
    trpc.orders.listPage.infiniteQueryOptions(
      {
        mine: rep && salesView === "mine",
        createdAfter,
        limit: LIST_PAGE_SIZE,
        statuses,
      },
      {
        enabled: !isOffline && !isMarketDay,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const orders = isOffline && !isMarketDay ? savedOrders : searchedOrders
  const loadedOrders = useMemo(
    () => orders.data?.pages.flatMap((page) => page.items) ?? [],
    [orders.data?.pages],
  )
  const visibleOrders = useMemo(() => {
    if (!isOffline || !query.trim()) return loadedOrders
    const needle = query.trim().toLowerCase()
    return loadedOrders.filter((order) =>
      `${order.orderNumber} ${order.customerName ?? ""} ${order.customerPhone ?? ""} ${order.lines.map((line) => line.snapshot?.catalogItemName ?? "").join(" ")}`
        .toLowerCase()
        .includes(needle),
    )
  }, [loadedOrders, isOffline, query])
  const dayHeaders = useMemo(
    () => ledgerDayHeaders(visibleOrders),
    [visibleOrders],
  )
  const dayPositions = useMemo(
    () => ledgerDayPositions(visibleOrders),
    [visibleOrders],
  )
  const lastDayId = [...dayHeaders.keys()].at(-1)
  const revealRows = useFirstReveal(visibleOrders.length > 0)
  useEffect(() => {
    const eligible = new Set(
      loadedOrders
        .filter((order) => isReceiptOrderEligible(order.status))
        .map((order) => order.id),
    )
    setReceiptIds((current) =>
      current.every((id) => eligible.has(id))
        ? current
        : current.filter((id) => eligible.has(id)),
    )
  }, [loadedOrders])
  const visibleProvisionalOrders = useMemo(() => {
    if (filter === "completed" || filter === "cancelled") return []
    const normalizedQuery = query.trim().toLowerCase()
    const datedOrders = provisionalOrders.filter(
      (order) =>
        !createdAfter || new Date(order.createdAtClient) >= createdAfter,
    )
    if (!normalizedQuery) return datedOrders
    return datedOrders.filter((order) =>
      `${order.customerName ?? ""} ${order.customerPhone ?? ""} queued pending sync`
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [filter, provisionalOrders, query, createdAfter])
  const totalCount = orders.data?.pages[0]?.totalCount ?? 0
  const showSearch =
    !!query ||
    shouldShowListSearch(
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: Appearance changes invalidate measured masthead geometry.
  useEffect(() => {
    setShowCanvasStatusBar(false)
    setMastheadHeight(0)
  }, [isMarketDay])

  return (
    <Screen showCanvasStatusBar={showCanvasStatusBar}>
      <FlatList
        {...edgeFeedback}
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
              {loadedOrders.length > 0 ? (
                <ActionButton
                  variant="outline"
                  disabled={isOffline}
                  onPress={() => {
                    setSelectingReceipts((value) => !value)
                    setReceiptIds([])
                  }}
                >
                  {selectingReceipts ? "Cancel selection" : "Select receipts"}
                </ActionButton>
              ) : null}
              {!isMarketDay && orders.isPending && !isOffline ? (
                <ClassicOrdersSkeleton />
              ) : orders.isPending && !isOffline ? (
                <ListSkeleton count={6} label="Loading orders" />
              ) : (
                <EmptyState
                  actionLabel={isOffline ? undefined : "Clear filters"}
                  actionProps={{ onPress: resetFilters, variant: "outline" }}
                  className="mt-3"
                  icon="ReceiptText"
                  message={
                    isOffline
                      ? "Reconnect to refresh Orders from your workspace."
                      : query || filter !== "all" || dateFilter !== "all"
                        ? "Try another date, search, or status filter."
                        : "New Product and Service Orders will appear here."
                  }
                  title={
                    isOffline
                      ? "No cached orders"
                      : query || filter !== "all" || dateFilter !== "all"
                        ? "No matching orders"
                        : "No orders yet"
                  }
                />
              )}
            </Section>
          ) : null
        }
        ListHeaderComponent={
          <View className="gap-5 pb-4">
            <Masthead
              title={rep ? "Your sales" : "Orders"}
              businessName={auth.profile?.businessName ?? "Your business"}
              onCustomersPress={() => router.push("/customer-book-modal")}
              onSelectReceipts={() => {
                setSelectingReceipts((value) => !value)
                setReceiptIds([])
              }}
              selectingReceipts={selectingReceipts}
              selectionDisabled={isOffline || !visibleOrders.length}
              onLayout={(event) => {
                const height = event.nativeEvent.layout.height
                setMastheadHeight((current) =>
                  current === height ? current : height,
                )
              }}
            />
            {rep &&
            visibility.query.data?.salesRepOrderVisibility ===
              "ALL_STORE_ORDERS" ? (
              <View className="flex-row gap-3 px-4">
                {(["store", "mine"] as const).map((view) => (
                  <ActionButton
                    key={view}
                    className="flex-1"
                    variant={salesView === view ? "default" : "outline"}
                    onPress={() => setSalesView(view)}
                  >
                    {view === "store" ? "Store" : "Mine"}
                  </ActionButton>
                ))}
              </View>
            ) : null}
            {!showFirstOrderGate ? (
              isMarketDay ? (
                <Summary
                  dateFilter={dateFilter}
                  loading={orders.isPending && !isOffline}
                  orders={visibleOrders}
                />
              ) : (
                <ClassicOrdersSummary
                  report={
                    salesReport.data
                      ? {
                          currencyCode: salesReport.data.currencyCode,
                          orderCount: salesReport.data.orderCount,
                          orderValueMinor: salesReport.data.orderValueMinor,
                          outstandingMinor:
                            "outstandingMinor" in salesReport.data
                              ? salesReport.data.outstandingMinor
                              : undefined,
                          partial:
                            "partial" in salesReport.data
                              ? salesReport.data.partial
                              : undefined,
                        }
                      : null
                  }
                  dateFilter={dateFilter}
                  orders={visibleOrders}
                  totalCount={isOffline ? visibleOrders.length : totalCount}
                  onDateChange={setDateFilter}
                  isOffline={isOffline}
                  savedAt={
                    orders.dataUpdatedAt
                      ? new Date(orders.dataUpdatedAt).toLocaleTimeString(
                          undefined,
                          { hour: "2-digit", minute: "2-digit" },
                        )
                      : undefined
                  }
                  loading={orders.isPending && !isOffline}
                />
              )
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
                <FirstOrderGate
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
                  {isMarketDay ? (
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
                  ) : null}
                  <FilterRow
                    active={filter}
                    labels={
                      isMarketDay
                        ? {
                            all:
                              filter === "all" && !isOffline && orders.data
                                ? `All ${totalCount}`
                                : "All",
                            cancelled: "Cancelled",
                            completed: "Done",
                            open: "Open",
                          }
                        : {
                            all: `All${statusCount(countAll.data)}`,
                            cancelled: `Cancelled${statusCount(countCancelled.data)}`,
                            completed: `Done${statusCount(countDone.data)}`,
                            open: `Open${statusCount(countOpen.data)}`,
                          }
                    }
                    onChange={setFilter}
                    values={["all", "open", "completed", "cancelled"]}
                  />
                  {showSearch && (!isMarketDay || !isOffline) ? (
                    <FormField
                      accessibilityLabel="Search orders"
                      autoCapitalize="none"
                      label="Search orders"
                      leadingIcon="Search"
                      onChangeText={setQuery}
                      placeholder="Search order, customer or item"
                      value={query}
                      variant={isMarketDay ? "filled" : "till-search"}
                    />
                  ) : null}
                  {loadedOrders.length > 0 ? (
                    <ActionButton
                      variant="outline"
                      disabled={isOffline}
                      onPress={() => {
                        setSelectingReceipts((value) => !value)
                        setReceiptIds([])
                      }}
                    >
                      {selectingReceipts
                        ? "Cancel selection"
                        : "Select receipts"}
                    </ActionButton>
                  ) : null}
                </>
              )}
              {visibleProvisionalOrders.map((order) =>
                isMarketDay ? (
                  <CommercePendingOrderRow
                    key={order.clientCommandId}
                    order={order}
                  />
                ) : (
                  <ClassicPendingOrderRow
                    key={order.clientCommandId}
                    order={order}
                    onPress={() => router.push("/sync-status-modal")}
                  />
                ),
              )}
            </Section>
          </View>
        }
        onScroll={handleScroll}
        onEndReached={() => {
          if (
            !isOffline &&
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
          <RevealItem active={revealRows} index={index}>
            <Section>
              {!isMarketDay && dayHeaders.has(item.id) ? (
                <View className="mt-3 -mb-1.5 flex-row flex-wrap items-baseline justify-between gap-2">
                  <Text className="text-[15px] font-extrabold text-foreground">
                    {dayHeaders.get(item.id)?.label}
                  </Text>
                  <Text className="text-xs font-bold tabular-nums text-muted-foreground">
                    {`${item.id === lastDayId && orders.hasNextPage ? "Loaded · " : ""}${dayHeaders.get(item.id)?.total} · ${dayHeaders.get(item.id)?.count}`}
                  </Text>
                </View>
              ) : null}
              {isMarketDay && selectingReceipts ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Select ${item.orderNumber}`}
                  accessibilityState={{
                    checked: receiptIds.includes(item.id),
                    disabled:
                      !isReceiptOrderEligible(item.status) ||
                      (!receiptIds.includes(item.id) &&
                        receiptIds.length >= 20),
                  }}
                  disabled={
                    !isReceiptOrderEligible(item.status) ||
                    (!receiptIds.includes(item.id) && receiptIds.length >= 20)
                  }
                  className="min-h-12 justify-center border-b border-border py-3"
                  onPress={() =>
                    setReceiptIds((current) =>
                      toggleReceiptSelection(current, item.id),
                    )
                  }
                >
                  <Text className="font-semibold text-primary">
                    {receiptIds.includes(item.id)
                      ? "✓ Selected"
                      : isReceiptOrderEligible(item.status)
                        ? "Select receipt"
                        : "Receipt unavailable"}{" "}
                    · {item.orderNumber}
                  </Text>
                </Pressable>
              ) : null}
              <Row
                index={index}
                position={dayPositions.get(item.id)}
                selecting={selectingReceipts}
                selected={receiptIds.includes(item.id)}
                disabled={
                  selectingReceipts &&
                  (!isReceiptOrderEligible(item.status) ||
                    (!receiptIds.includes(item.id) && receiptIds.length >= 20))
                }
                onPress={() => {
                  if (selectingReceipts) {
                    if (isReceiptOrderEligible(item.status))
                      setReceiptIds((current) =>
                        toggleReceiptSelection(current, item.id),
                      )
                  } else {
                    queryClient.setQueryData(
                      trpc.orders.get.queryKey({ orderId: item.id }),
                      item,
                      { updatedAt: orders.dataUpdatedAt },
                    )
                    router.push(commercialOrderHref(item.id))
                  }
                }}
                order={item}
              />
            </Section>
          </RevealItem>
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />
      {selectingReceipts ? (
        <VariableContextProvider
          value={{
            "--receipt-bar-bottom": isDockHidden
              ? Math.max(insets.bottom, 16)
              : Math.max(insets.bottom + 90, 106),
          }}
        >
          <View className="gap-2 border-t border-border bg-background px-[18px] pt-3 pb-[var(--receipt-bar-bottom)]">
            <Text accessibilityLiveRegion="polite">
              {receiptIds.length} selected · maximum 20
            </Text>
            <ActionButton
              disabled={!receiptIds.length || isOffline}
              onPress={() =>
                router.push({
                  pathname: "/order-receipts-modal",
                  params: { orderIds: receiptIds.join(",") },
                })
              }
            >
              Generate receipts
            </ActionButton>
          </View>
        </VariableContextProvider>
      ) : null}
      {isDockHidden && !showFirstOrderGate && !selectingReceipts ? (
        <ListCreateFab
          accessibilityLabel="Add order"
          tone={isMarketDay ? undefined : "gold"}
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
