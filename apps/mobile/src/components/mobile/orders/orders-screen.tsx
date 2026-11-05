import { ActionButton } from "@/components/mobile/action-button"
import {
  useAdminDockScroll,
  useAdminTabs,
} from "@/components/mobile/admin-tabs/admin-tabs-context"
import { commercialOrderHref } from "@/components/mobile/commerce"
import { EmptyState } from "@/components/mobile/empty-state"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { isAllSelected } from "@/components/mobile/list-selection/list-selection-model"
import {
  SelectionActionBar,
  SelectionTopBar,
} from "@/components/mobile/list-selection/selection-bars"
import { useListSelection } from "@/components/mobile/list-selection/use-list-selection"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { ScrollToTopButton } from "@/components/mobile/scroll-to-top-button"
import { SearchFold, useSearchFold } from "@/components/mobile/search-fold"
import { StatusBanner } from "@/components/mobile/status-banner"
import { TabSearchBubble } from "@/components/mobile/tab-search-bubble"
import { RevealItem, useFirstReveal } from "@/components/ui/motion"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useOrderVisibility } from "@/hooks/use-order-visibility"
import { useScrollEdgeFeedback } from "@/hooks/use-scroll-edge-feedback"
import { useScrollToTop } from "@/hooks/use-scroll-to-top"
import {
  LIST_PAGE_SIZE,
  shouldFetchNextListPage,
  shouldShowListSearch,
} from "@/lib/list-pagination"
import { isSalesRepRole } from "@/lib/mobile-roles"
import { isClosedOrder } from "@/lib/order-action-eligibility"
import { useTRPC } from "@/trpc/client"
import { isReceiptOrderEligible } from "@ewatrade/order-receipts"
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useLocalSearchParams, useRouter } from "expo-router"
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
import {
  ORDER_PAYMENT_FILTERS,
  type OrderPaymentFilter,
  ledgerDayHeaders,
  ledgerDayPositions,
  orderTotalsMoney,
  sumOrderTotals,
} from "./orders-ledger-model"

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
import { FlatList } from "react-native-css/components/FlatList"
import {
  BulkFulfilSheet,
  orderReadyLineCount,
  useBulkFulfil,
} from "./bulk-fulfil-sheet"
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
    provisionalOrders,
  } = useAdminTabs()
  const edgeFeedback = useScrollEdgeFeedback()
  const handleDockScroll = useAdminDockScroll()
  const scrollToTop = useScrollToTop()
  // The assistant's "See all" opens the list it summarised (all dates, still owing).
  const opened = useLocalSearchParams<{ payment?: string }>()
  const fromAssistant = opened.payment === "owing"
  const [dateFilter, setDateFilter] = useState<DateFilter>(
    fromAssistant ? "all" : "30_days",
  )
  const [filter, setFilter] = useState<OrderFilter>("all")
  const [paymentFilter, setPaymentFilter] = useState<OrderPaymentFilter>(
    fromAssistant ? "owing" : "any",
  )
  useEffect(() => {
    if (opened.payment !== "owing") return
    setDateFilter("all")
    setPaymentFilter("owing")
  }, [opened.payment])
  const [mastheadHeight, setMastheadHeight] = useState(0)
  const [query, setQuery] = useState("")
  const searchFold = useSearchFold(query)
  // Press and hold a row (or tap Select) to pick Orders for receipts or
  // fulfilment; capped at 20, the most one receipt batch takes.
  const selection = useListSelection({ max: 20, noun: "orders" })
  const clearSelection = selection.clear
  const bulkFulfil = useBulkFulfil({ onFinished: clearSelection })
  // biome-ignore lint/correctness/useExhaustiveDependencies: These values define the selection scope.
  useEffect(() => {
    clearSelection()
  }, [
    auth.profile?.businessId,
    auth.profile?.storeId,
    dateFilter,
    filter,
    paymentFilter,
    query,
    isOffline,
    salesView,
  ])
  const [showCanvasStatusBar, setShowCanvasStatusBar] = useState(false)
  const deferredQuery = useDeferredValue(query)
  const createdAfter = useMemo(
    () => createdAfterForDateFilter(dateFilter),
    [dateFilter],
  )
  const statuses = useMemo(() => statusesForOrderFilter(filter), [filter])
  const paymentStatuses = ORDER_PAYMENT_FILTERS[paymentFilter]
  const mine = rep && salesView === "mine"
  // Hero and chip counts are exact server totals for the period and search,
  // by currency, status and payment, never the orders loaded so far.
  const totalsQuery = useQuery(
    trpc.orders.listTotals.queryOptions(
      { createdAfter, mine, query: deferredQuery || undefined },
      { enabled: !isOffline, retry: false },
    ),
  )
  // `payments` is required: "Any payment" passes undefined and must not fall
  // back to the selected payment chip.
  const totalsFor = (
    statusList: readonly string[] | undefined,
    payments: readonly string[] | undefined,
  ) =>
    totalsQuery.data
      ? sumOrderTotals(totalsQuery.data.groups, {
          paymentStatuses: payments,
          statuses: statusList,
        })
      : undefined
  const statusCount = (statusList?: readonly string[]) => {
    const totals = totalsFor(statusList, paymentStatuses)
    return totals ? ` ${totals.orderCount}` : ""
  }
  const paymentCount = (value: OrderPaymentFilter) => {
    const totals = totalsFor(statuses, ORDER_PAYMENT_FILTERS[value])
    return totals ? ` ${totals.orderCount}` : ""
  }
  const salesTotals = totalsFor(SALE_STATUSES, paymentStatuses)
  const salesCurrency = salesTotals?.currencies[0]
  const searchedOrders = useInfiniteQuery(
    trpc.orders.listPage.infiniteQueryOptions(
      {
        mine: rep && salesView === "mine",
        createdAfter,
        limit: LIST_PAGE_SIZE,
        paymentStatuses: paymentStatuses ? [...paymentStatuses] : undefined,
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
        enabled: !isOffline,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        retry: false,
      },
    ),
  )
  const orders = isOffline ? savedOrders : searchedOrders
  const loadedOrders = useMemo(
    () => orders.data?.pages.flatMap((page) => page.items) ?? [],
    [orders.data?.pages],
  )
  const visibleOrders = useMemo(() => {
    if (!isOffline) return loadedOrders
    // Saved pages hold every payment status; filter them on the device.
    const paid = paymentStatuses
      ? loadedOrders.filter((order) =>
          (paymentStatuses as readonly string[]).includes(order.paymentStatus),
        )
      : loadedOrders
    if (!query.trim()) return paid
    const needle = query.trim().toLowerCase()
    return paid.filter((order) =>
      `${order.orderNumber} ${order.customerName ?? ""} ${order.customerPhone ?? ""} ${order.lines.map((line) => line.snapshot?.catalogItemName ?? "").join(" ")}`
        .toLowerCase()
        .includes(needle),
    )
  }, [loadedOrders, isOffline, paymentStatuses, query])
  const dayHeaders = useMemo(
    () => ledgerDayHeaders(visibleOrders),
    [visibleOrders],
  )
  const dayPositions = useMemo(
    () => ledgerDayPositions(visibleOrders),
    [visibleOrders],
  )
  const lastDayId = [...dayHeaders.keys()].at(-1)
  // The last day may continue on the next page: ask for its exact total.
  const lastDayAt = visibleOrders.find(
    (order) => order.id === lastDayId,
  )?.createdAt
  const lastDayWindow = useMemo(() => {
    if (!lastDayAt || isOffline) return null
    const start = new Date(lastDayAt)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return {
      createdAfter: createdAfter && createdAfter > start ? createdAfter : start,
      createdBefore: end,
    }
  }, [createdAfter, isOffline, lastDayAt])
  const lastDayTotals = useQuery(
    trpc.orders.listTotals.queryOptions(
      {
        ...lastDayWindow,
        mine,
        paymentStatuses: paymentStatuses ? [...paymentStatuses] : undefined,
        query: deferredQuery || undefined,
        statuses,
      },
      {
        enabled: Boolean(lastDayWindow && orders.hasNextPage),
        retry: false,
      },
    ),
  )
  const lastDayExact =
    lastDayTotals.data && orders.hasNextPage
      ? sumOrderTotals(lastDayTotals.data.groups)
      : null
  const revealRows = useFirstReveal(visibleOrders.length > 0)
  // Cancelled and refunded Orders can't take a receipt or fulfilment.
  const selectableIds = useMemo(
    () =>
      visibleOrders
        .filter((order) => !isClosedOrder(order.status))
        .map((order) => order.id),
    [visibleOrders],
  )
  const pruneSelection = selection.prune
  useEffect(() => {
    pruneSelection(new Set(selectableIds))
  }, [pruneSelection, selectableIds])
  const selectedOrders = useMemo(
    () => visibleOrders.filter((order) => selection.ids.includes(order.id)),
    [selection.ids, visibleOrders],
  )
  const receiptOrderIds = selectedOrders
    .filter((order) => isReceiptOrderEligible(order.status))
    .map((order) => order.id)
  const fulfilCount = selectedOrders.filter(
    (order) => orderReadyLineCount(order) > 0,
  ).length
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
    setPaymentFilter("any")
    setQuery("")
  }
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // The bulk action bar owns the bottom edge: keep the dock away.
      if (!selection.selecting) handleDockScroll(event)
      scrollToTop.onScroll(event)
      const scrollY = Math.max(0, event.nativeEvent.contentOffset.y)
      const shouldUseCanvas =
        mastheadHeight > 0 && scrollY + 0.5 >= mastheadHeight - insets.top
      setShowCanvasStatusBar((current) =>
        current === shouldUseCanvas ? current : shouldUseCanvas,
      )
    },
    [
      handleDockScroll,
      insets.top,
      mastheadHeight,
      scrollToTop.onScroll,
      selection.selecting,
    ],
  )

  return (
    <ClassicOrdersScreen showCanvasStatusBar={showCanvasStatusBar}>
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
            <ClassicOrdersSection>
              {orders.isPending && !isOffline ? (
                <ClassicOrdersSkeleton />
              ) : (
                <EmptyState
                  actionLabel={isOffline ? undefined : "Clear filters"}
                  actionProps={{ onPress: resetFilters, variant: "outline" }}
                  className="mt-3"
                  icon="ReceiptText"
                  message={
                    isOffline
                      ? "Reconnect to refresh Orders from your workspace."
                      : query ||
                          filter !== "all" ||
                          paymentFilter !== "any" ||
                          dateFilter !== "all"
                        ? "Try another date, search, or status filter."
                        : "New orders for goods and services will appear here."
                  }
                  title={
                    isOffline
                      ? "No cached orders"
                      : query ||
                          filter !== "all" ||
                          paymentFilter !== "any" ||
                          dateFilter !== "all"
                        ? "No matching orders"
                        : "No orders yet"
                  }
                />
              )}
            </ClassicOrdersSection>
          ) : null
        }
        ListHeaderComponent={
          <View className="gap-5 pb-4">
            <ClassicOrdersMasthead
              title={rep ? "Your sales" : "Orders"}
              businessName={auth.profile?.businessName ?? "Your business"}
              onCustomersPress={() => router.push("/customer-book-modal")}
              onSelect={() =>
                selection.selecting ? selection.clear() : selection.start()
              }
              selecting={selection.selecting}
              selectionDisabled={isOffline || !selectableIds.length}
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
              <SearchFold folded={searchFold.folded}>
                <ClassicOrdersSummary
                  report={
                    salesTotals
                      ? {
                          currencyCode:
                            salesCurrency?.currencyCode ??
                            auth.profile?.currencyCode ??
                            "NGN",
                          mixedCurrencies: salesTotals.currencies.length > 1,
                          orderCount: salesTotals.orderCount,
                          orderValueMinor: salesCurrency?.orderValueMinor ?? 0,
                          outstandingMinor:
                            salesCurrency?.outstandingMinor ?? 0,
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
              </SearchFold>
            ) : null}
            <ClassicOrdersSection>
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
                <ClassicFirstOrderGate
                  catalogReady={availability.hasActiveSellableItems}
                  onAddItemPress={() =>
                    router.push("/first-product-setup-modal")
                  }
                  onPrimaryPress={() => router.push("/create-sale-modal")}
                />
              ) : (
                <>
                  <ClassicOrdersFilterRow
                    active={filter}
                    labels={{
                      all: `All${statusCount()}`,
                      cancelled: `Cancelled${statusCount(statusesForOrderFilter("cancelled"))}`,
                      completed: `Done${statusCount(statusesForOrderFilter("completed"))}`,
                      open: `Open${statusCount(OPEN_STATUSES)}`,
                    }}
                    onChange={setFilter}
                    values={["all", "open", "completed", "cancelled"]}
                  />
                  <ClassicOrdersFilterRow
                    active={paymentFilter}
                    labels={{
                      any: `Any payment${paymentCount("any")}`,
                      paid: `Paid${paymentCount("paid")}`,
                      part_paid: `Part paid${paymentCount("part_paid")}`,
                      unpaid: `Unpaid${paymentCount("unpaid")}`,
                      owing: `Owing${paymentCount("owing")}`,
                    }}
                    onChange={setPaymentFilter}
                    values={
                      paymentFilter === "owing"
                        ? ["any", "owing", "unpaid", "part_paid", "paid"]
                        : ["any", "unpaid", "part_paid", "paid"]
                    }
                  />
                </>
              )}
              {visibleProvisionalOrders.map((order) => (
                <ClassicPendingOrderRow
                  key={order.clientCommandId}
                  order={order}
                  onPress={() => router.push("/sync-status-modal")}
                />
              ))}
            </ClassicOrdersSection>
          </View>
        }
        onContentSizeChange={scrollToTop.onContentSizeChange}
        onScroll={handleScroll}
        ref={scrollToTop.ref}
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
            <ClassicOrdersSection>
              {dayHeaders.has(item.id) ? (
                <View className="mt-3 -mb-1.5 flex-row flex-wrap items-baseline justify-between gap-2">
                  <Text className="text-base font-extrabold text-foreground">
                    {dayHeaders.get(item.id)?.label}
                  </Text>
                  <Text className="text-xs font-bold tabular-nums text-muted-foreground">
                    {item.id === lastDayId && lastDayExact
                      ? `${orderTotalsMoney(lastDayExact)} · ${lastDayExact.orderCount}`
                      : `${item.id === lastDayId && orders.hasNextPage ? "Loaded · " : ""}${dayHeaders.get(item.id)?.total} · ${dayHeaders.get(item.id)?.count}`}
                  </Text>
                </View>
              ) : null}
              <ClassicOrdersRow
                index={index}
                position={dayPositions.get(item.id)}
                selecting={selection.selecting}
                selected={selection.isSelected(item.id)}
                disabled={selection.selecting && isClosedOrder(item.status)}
                onLongPress={
                  isOffline || isClosedOrder(item.status)
                    ? undefined
                    : () =>
                        selection.selecting
                          ? selection.toggle(item.id)
                          : selection.start(item.id)
                }
                onPress={() => {
                  if (selection.selecting) {
                    selection.toggle(item.id)
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
            </ClassicOrdersSection>
          </RevealItem>
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />
      <ScrollToTopButton
        dockHidden={isDockHidden}
        // Selection, an open search and the first-order gate own the bottom edge.
        hidden={
          selection.selecting ||
          searchFold.folded ||
          query.length > 0 ||
          showFirstOrderGate
        }
        onPress={scrollToTop.scrollToTop}
        testID="orders-scroll-to-top"
        visible={scrollToTop.visible}
      />
      {selection.selecting ? (
        <>
          <SelectionTopBar
            allSelected={isAllSelected(
              selection.ids,
              selectableIds,
              selection.max,
            )}
            count={selection.count}
            onCancel={selection.clear}
            onSelectAll={() => selection.selectAll(selectableIds)}
            selectAllDisabled={!selectableIds.length}
          />
          <SelectionActionBar
            notice={selection.notice}
            primary={{
              disabled: !receiptOrderIds.length || isOffline,
              icon: "ReceiptText",
              label: receiptOrderIds.length
                ? `Receipts · ${receiptOrderIds.length}`
                : "Receipts",
              onPress: () =>
                router.push({
                  pathname: "/order-receipts-modal",
                  params: { orderIds: receiptOrderIds.join(",") },
                }),
              testID: "orders-bulk-receipts",
            }}
            secondary={{
              disabled: !fulfilCount || isOffline || bulkFulfil.running,
              icon: "Package",
              label: fulfilCount ? `Fulfil ${fulfilCount}` : "Fulfil",
              onPress: () => bulkFulfil.open(selectedOrders),
              testID: "orders-bulk-fulfil",
            }}
          />
        </>
      ) : null}
      <BulkFulfilSheet fulfil={bulkFulfil} />
      {showSearch && !showFirstOrderGate && !selection.selecting ? (
        <TabSearchBubble
          accessibilityLabel="Search orders"
          dockHidden={isDockHidden}
          onChangeText={setQuery}
          onFocusChange={searchFold.onFocusChange}
          placeholder="Search order, customer or item"
          // Add order shows while the tab bar is hidden; sit beside it.
          rightInset={isDockHidden ? 68 : 0}
          testID="orders-search-button"
          value={query}
        />
      ) : null}
      {isDockHidden && !showFirstOrderGate && !selection.selecting ? (
        <ListCreateFab
          accessibilityLabel="Add order"
          tone="gold"
          dockHidden
          onPress={() => router.push("/create-sale-modal")}
          sitsAboveDock
          testID="orders-add-fab"
        />
      ) : null}
    </ClassicOrdersScreen>
  )
}
