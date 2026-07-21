import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney } from "@ewatrade/utils"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { FlatList } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTRPC } from "@/trpc/client"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { EmptyState } from "../empty-state"
import { FormField } from "../form-field"
import { StatusBadge } from "../status-badge"
import { StatusBanner } from "../status-banner"
import { useAdminDockScroll, useAdminTabs } from "./admin-tabs-context"

type CommercialOrder = RouterOutputs["orders"]["list"][number]
type OrderFilter = "all" | "open" | "completed" | "cancelled"

const OPEN_STATUSES = new Set([
  "DRAFT",
  "PENDING",
  "CONFIRMED",
  "FULFILLING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
])

function matchesFilter(order: CommercialOrder, filter: OrderFilter) {
  if (filter === "all") return true
  if (filter === "open") return OPEN_STATUSES.has(order.status)
  if (filter === "completed") return order.status === "COMPLETED"
  return order.status === "CANCELLED" || order.status === "REFUNDED"
}

function statusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function OrderRow({ order }: { order: CommercialOrder }) {
  const itemSummary = order.lines
    .map(
      (line) =>
        `${line.quantity} × ${line.snapshot?.catalogItemName ?? "Item"}`,
    )
    .join(", ")
  const tone =
    order.status === "COMPLETED"
      ? "success"
      : order.status === "CANCELLED" || order.status === "REFUNDED"
        ? "destructive"
        : "primary"

  return (
    <View className="border-b border-border py-4">
      <View className="flex-row items-start justify-between gap-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">
            {order.orderNumber}
          </Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {order.customerName || order.customerPhone || "Walk-in customer"}
          </Text>
          <Text
            className="text-xs leading-4 text-muted-foreground"
            numberOfLines={2}
          >
            {itemSummary}
          </Text>
        </View>
        <View className="items-end gap-2">
          <Text className="font-extrabold text-foreground">
            {formatMinorMoney(order.totalMinor, order.currencyCode)}
          </Text>
          <StatusBadge label={statusLabel(order.status)} tone={tone} />
        </View>
      </View>
    </View>
  )
}

function ProvisionalOrderRow({
  order,
}: {
  order: {
    clientCommandId: string
    createdAtClient: Date
    customerName?: string
    customerPhone?: string
    lineCount: number
  }
}) {
  return (
    <View className="border-b border-border py-4">
      <View className="flex-row items-start justify-between gap-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="font-extrabold text-foreground">Queued order</Text>
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {order.customerName || order.customerPhone || "Walk-in customer"}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {order.lineCount} {order.lineCount === 1 ? "item" : "items"} ·{" "}
            {order.createdAtClient.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        <StatusBadge label="Pending sync" tone="warning" />
      </View>
    </View>
  )
}

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={
        active
          ? "min-h-10 justify-center rounded-full bg-foreground px-4"
          : "min-h-10 justify-center rounded-full border border-border bg-card px-4"
      }
      haptic
      onPress={onPress}
    >
      <Text
        className={
          active
            ? "text-sm font-bold text-background"
            : "text-sm font-bold text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function AdminOrdersScreen() {
  const insets = useSafeAreaInsets()
  const trpc = useTRPC()
  const { isOffline, openCreate, provisionalOrders } = useAdminTabs()
  const handleDockScroll = useAdminDockScroll()
  const [filter, setFilter] = useState<OrderFilter>("all")
  const [query, setQuery] = useState("")
  const orders = useQuery(
    trpc.orders.list.queryOptions(
      { limit: 100 },
      { enabled: !isOffline, retry: false },
    ),
  )
  const visibleOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return (orders.data ?? []).filter((order) => {
      if (!matchesFilter(order, filter)) return false
      if (!normalizedQuery) return true
      return [
        order.orderNumber,
        order.customerName,
        order.customerPhone,
        order.customerEmail,
        ...order.lines.map((line) => line.snapshot?.catalogItemName),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    })
  }, [filter, orders.data, query])
  const visibleProvisionalOrders = useMemo(() => {
    if (filter === "completed" || filter === "cancelled") return []
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return provisionalOrders
    return provisionalOrders.filter((order) =>
      `${order.customerName ?? ""} ${order.customerPhone ?? ""} queued pending sync`
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [filter, provisionalOrders, query])

  return (
    <View className="flex-1 bg-background">
      <FlatList
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom + 116, 152),
          paddingHorizontal: 24,
          paddingTop: insets.top + 24,
        }}
        data={visibleOrders}
        keyExtractor={(order) => order.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onScroll={handleDockScroll}
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
                  : query || filter !== "all"
                    ? "Try another search or status filter."
                    : "New Product and Service Orders will appear here."
              }
              title={
                orders.isPending && !isOffline
                  ? "Loading orders"
                  : query || filter !== "all"
                    ? "No matching orders"
                    : "No orders yet"
              }
            />
          ) : null
        }
        ListHeaderComponent={
          <View className="gap-5 pb-4">
            <View className="gap-1">
              <Text className="text-3xl font-extrabold text-foreground">
                Orders
              </Text>
              <Text className="text-sm text-muted-foreground">
                Products and Services ordered from this workspace.
              </Text>
            </View>
            {provisionalOrders.length > 0 ? (
              <StatusBanner
                icon="Wind"
                message={`${provisionalOrders.length} queued ${provisionalOrders.length === 1 ? "Order is" : "Orders are"} shown below and will reconcile after sync.`}
                title="Orders pending sync"
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
            <FormField
              autoCapitalize="none"
              label="Find order"
              leadingIcon="Search"
              onChangeText={setQuery}
              placeholder="Search order, customer, or item"
              value={query}
            />
            <View className="flex-row flex-wrap gap-2">
              {(["all", "open", "completed", "cancelled"] as const).map(
                (value) => (
                  <FilterChip
                    active={filter === value}
                    key={value}
                    label={value.charAt(0).toUpperCase() + value.slice(1)}
                    onPress={() => setFilter(value)}
                  />
                ),
              )}
            </View>
            {visibleProvisionalOrders.map((order) => (
              <ProvisionalOrderRow
                key={order.clientCommandId}
                order={order}
              />
            ))}
          </View>
        }
        renderItem={({ item }) => <OrderRow order={item} />}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}
