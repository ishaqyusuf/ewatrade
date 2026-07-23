import {
  CommerceFilterChip,
  CommerceMetricTile,
  CommerceOrderRow,
  CommercePageHeader,
  CommercePendingOrderRow,
  type CommercialOrder,
  commercialOrderHref,
  commerceOrderItemCount,
} from "@/components/mobile/commerce";
import { EmptyState } from "@/components/mobile/empty-state";
import { FormField } from "@/components/mobile/form-field";
import { StatusBanner } from "@/components/mobile/status-banner";
import { Icon } from "@/components/ui/icon";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { View } from "@/components/ui/view";
import { useTRPC } from "@/trpc/client";
import {
  LIST_PAGE_SIZE,
  shouldFetchNextListPage,
  shouldShowListSearch,
} from "@/lib/list-pagination";
import { formatMinorMoney } from "@ewatrade/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useDeferredValue, useMemo, useState } from "react";
import { FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAdminDockScroll, useAdminTabs } from "./admin-tabs-context";

type OrderFilter = "all" | "cancelled" | "completed" | "open";
type DateFilter = "all" | "today" | "7_days" | "30_days";

const OPEN_STATUSES = [
  "DRAFT",
  "PENDING",
  "CONFIRMED",
  "FULFILLING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
] as const;

function createdAfterForDateFilter(filter: DateFilter) {
  if (filter === "all") return undefined;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (filter === "7_days") start.setDate(start.getDate() - 6);
  if (filter === "30_days") start.setDate(start.getDate() - 29);
  return start;
}

function statusesForOrderFilter(filter: OrderFilter) {
  if (filter === "open") return [...OPEN_STATUSES];
  if (filter === "completed") return ["COMPLETED" as const];
  if (filter === "cancelled") {
    return ["CANCELLED" as const, "REFUNDED" as const];
  }
  return undefined;
}

function dateFilterLabel(filter: DateFilter) {
  if (filter === "today") return "Today";
  if (filter === "7_days") return "7 days";
  if (filter === "30_days") return "30 days";
  return "All time";
}

function formatQuantity(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function currencyMetric(
  orders: CommercialOrder[],
  getValue: (orders: CommercialOrder[]) => number,
) {
  if (orders.length === 0) return "—";
  const currencies = new Set(orders.map((order) => order.currencyCode));
  if (currencies.size !== 1) return "Mixed currencies";
  return formatMinorMoney(getValue(orders), orders[0]?.currencyCode ?? "NGN");
}

export function AdminOrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const trpc = useTRPC();
  const { isOffline, openCreate, provisionalOrders } = useAdminTabs();
  const handleDockScroll = useAdminDockScroll();
  const [dateFilter, setDateFilter] = useState<DateFilter>("30_days");
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const createdAfter = useMemo(
    () => createdAfterForDateFilter(dateFilter),
    [dateFilter],
  );
  const statuses = useMemo(() => statusesForOrderFilter(filter), [filter]);
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
  );
  const loadedOrders = useMemo(
    () => orders.data?.pages.flatMap((page) => page.items) ?? [],
    [orders.data?.pages],
  );
  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!isOffline || !normalizedQuery) return loadedOrders;
    return loadedOrders.filter((order) =>
      [
        order.clientOrderId,
        order.customerEmail,
        order.customerName,
        order.customerPhone,
        ...order.lines.flatMap((line) => [
          line.snapshot?.catalogItemName,
          line.snapshot?.offeringName,
          line.snapshot?.variantName,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [isOffline, loadedOrders, query]);
  const visibleProvisionalOrders = useMemo(() => {
    if (filter === "completed" || filter === "cancelled") return [];
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return provisionalOrders;
    return provisionalOrders.filter((order) =>
      `${order.customerName ?? ""} ${order.customerPhone ?? ""} queued pending sync`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [filter, provisionalOrders, query]);
  const itemCount = visibleOrders.reduce(
    (total, order) => total + commerceOrderItemCount(order),
    0,
  );
  const averageValue = currencyMetric(visibleOrders, (metricOrders) =>
    Math.round(
      metricOrders.reduce((total, order) => total + order.totalMinor, 0) /
        metricOrders.length,
    ),
  );
  const totalValue = currencyMetric(visibleOrders, (metricOrders) =>
    metricOrders.reduce((total, order) => total + order.totalMinor, 0),
  );
  const totalCount = orders.data?.pages[0]?.totalCount ?? 0;
  const showSearch = shouldShowListSearch(
    Math.max(totalCount, loadedOrders.length) + provisionalOrders.length,
  );

  return (
    <View className="flex-1 bg-background" testID="admin-orders-screen">
      <FlatList
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom + 116, 152),
          paddingHorizontal: 24,
          paddingTop: insets.top + 20,
        }}
        data={visibleOrders}
        keyExtractor={(order) => order.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          visibleProvisionalOrders.length === 0 ? (
            <EmptyState
              actionLabel="Open create options"
              actionProps={{ onPress: openCreate }}
              className="mt-5"
              icon="ReceiptText"
              message={
                orders.isPending && !isOffline
                  ? "Loading Commercial Orders."
                  : query || filter !== "all" || dateFilter !== "all"
                    ? "Try another date, search, or status filter."
                    : "New Product and Service Orders will appear here."
              }
              title={
                orders.isPending && !isOffline
                  ? "Loading orders"
                  : query || filter !== "all" || dateFilter !== "all"
                    ? "No matching orders"
                    : "No orders yet"
              }
            />
          ) : null
        }
        ListHeaderComponent={
          <View className="gap-5 pb-4">
            <CommercePageHeader
              action={
                <Pressable
                  accessibilityLabel="Open customers"
                  accessibilityRole="button"
                  className="size-11 items-center justify-center rounded-full bg-card active:bg-accent"
                  haptic
                  onPress={() => router.push("/customer-book-modal")}
                >
                  <Icon className="size-base text-foreground" name="Users" />
                </Pressable>
              }
              subtitle="Review payment and fulfilment across every order."
              title="Orders"
            />
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
            {showSearch ? (
              <FormField
                autoCapitalize="none"
                label="Search"
                leadingIcon="Search"
                onChangeText={setQuery}
                placeholder="Search order, customer, or item"
                value={query}
              />
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              {(["today", "7_days", "30_days", "all"] as const).map((value) => (
                <CommerceFilterChip
                  active={dateFilter === value}
                  key={value}
                  label={dateFilterLabel(value)}
                  onPress={() => setDateFilter(value)}
                />
              ))}
            </View>
            <View className="flex-row gap-3">
              <CommerceMetricTile
                icon="ReceiptText"
                label="Loaded orders"
                value={String(visibleOrders.length)}
              />
              <CommerceMetricTile
                icon="ListChecks"
                label="Loaded items"
                value={formatQuantity(itemCount)}
              />
            </View>
            <View className="flex-row gap-3">
              <CommerceMetricTile
                icon="Calculator"
                label="Average value"
                value={averageValue}
              />
              <CommerceMetricTile
                icon="Wallet"
                label="Loaded value"
                value={totalValue}
              />
            </View>
            <View className="flex-row flex-wrap gap-2">
              {(["all", "open", "completed", "cancelled"] as const).map(
                (value) => (
                  <CommerceFilterChip
                    active={filter === value}
                    key={value}
                    label={value.charAt(0).toUpperCase() + value.slice(1)}
                    onPress={() => setFilter(value)}
                  />
                ),
              )}
            </View>
            {visibleProvisionalOrders.map((order) => (
              <CommercePendingOrderRow
                key={order.clientCommandId}
                order={order}
              />
            ))}
          </View>
        }
        onScroll={handleDockScroll}
        onEndReached={() => {
          if (
            shouldFetchNextListPage({
              hasNextPage: Boolean(orders.hasNextPage),
              isFetchingNextPage: orders.isFetchingNextPage,
            })
          ) {
            void orders.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          orders.isFetchingNextPage ? (
            <Text className="py-5 text-center text-xs font-semibold text-muted-foreground">
              Loading more orders…
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <CommerceOrderRow
            onPress={() => router.push(commercialOrderHref(item.id))}
            order={item}
          />
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
