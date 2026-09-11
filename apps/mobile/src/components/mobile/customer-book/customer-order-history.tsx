import { ActionButton } from "../action-button"
import { EmptyState } from "../empty-state"
import {
  CommerceOrderRow,
  CommercePendingOrderRow,
} from "../commerce/commerce-primitives"
import type {
  CommerceCustomer,
  CommercialOrder,
  PendingCommerceOrder,
} from "../commerce/commerce-model"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useState } from "react"
import {
  MarketDayCustomerOrderRow,
  MarketDayCustomerPendingRow,
} from "../appearances/market-day/customer-profile"
import { useMarketDayPalette } from "@/lib/market-day-theme"

type HistoryRow =
  | { kind: "pending"; order: PendingCommerceOrder }
  | { kind: "synced"; order: CommercialOrder }

const PAGE_SIZE = 12

export function CustomerOrderHistory({
  market = false,
  customer,
  onOpenOrder,
  onLayout,
  onPageChange,
}: {
  market?: boolean
  customer: CommerceCustomer
  onOpenOrder: (orderId: string) => void
  onLayout: (y: number) => void
  onPageChange: () => void
}) {
  const palette = useMarketDayPalette()
  const Row = market ? MarketDayCustomerOrderRow : CommerceOrderRow
  const PendingRow = market
    ? MarketDayCustomerPendingRow
    : CommercePendingOrderRow
  const ink = market ? "text-market-ink" : "text-foreground"
  const muted = market ? "text-market-muted-ink" : "text-muted-foreground"
  const pageAction = market
    ? {
        foregroundColor: palette.ink,
        disabledForegroundColor: palette.mutedInk,
        className:
          "border-market-line bg-market-field active:bg-market-soft-band",
      }
    : {}
  const [requestedPage, setPage] = useState(0)
  const rows: HistoryRow[] = [
    ...customer.pendingOrders.map((order) => ({
      kind: "pending" as const,
      order,
    })),
    ...customer.orders.map((order) => ({ kind: "synced" as const, order })),
  ]
  const page = Math.min(
    requestedPage,
    Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1),
  )
  const start = page * PAGE_SIZE
  const visible = rows.slice(start, start + PAGE_SIZE)
  function move(next: number) {
    setPage(next)
    onPageChange()
  }
  return (
    <View
      className="gap-3"
      onLayout={(event) => onLayout(event.nativeEvent.layout.y)}
    >
      <Text className={"text-lg font-extrabold " + ink}>Loaded orders</Text>
      <Text className={"text-xs leading-5 " + muted}>
        {customer.orders.length} synced · {customer.pendingOrders.length}{" "}
        pending sync. Pending values are not included in synced order value.
      </Text>
      <View
        className={
          market
            ? "rounded-2xl border border-market-line bg-market-field px-4"
            : "rounded-2xl bg-card px-4"
        }
      >
        {visible.map((row) =>
          row.kind === "pending" ? (
            <PendingRow
              key={`pending:${row.order.clientCommandId}`}
              order={row.order}
            />
          ) : (
            <Row
              key={`synced:${row.order.id}`}
              order={row.order}
              onPress={() => onOpenOrder(row.order.id)}
            />
          ),
        )}
        {!rows.length ? (
          market ? (
            <View className="gap-2 py-5">
              <Text className={"text-lg font-bold " + ink}>
                No loaded orders
              </Text>
              <Text className={"text-sm " + muted}>
                No orders are loaded for this customer.
              </Text>
            </View>
          ) : (
            <EmptyState
              icon="ReceiptText"
              message="No orders are loaded for this customer."
              title="No loaded orders"
            />
          )
        ) : null}
      </View>
      {rows.length > PAGE_SIZE ? (
        <View className="gap-3">
          <Text accessibilityLiveRegion="polite" className={"text-xs " + muted}>
            Showing {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of{" "}
            {rows.length} loaded orders
          </Text>
          <View className="flex-row flex-wrap gap-3">
            <View className="min-w-[44%] flex-1">
              <ActionButton
                {...pageAction}
                icon="ChevronLeft"
                variant="outline"
                disabled={page === 0}
                onPress={() => move(page - 1)}
              >
                Previous
              </ActionButton>
            </View>
            <View className="min-w-[44%] flex-1">
              <ActionButton
                {...pageAction}
                icon="ChevronRight"
                variant="outline"
                disabled={start + PAGE_SIZE >= rows.length}
                onPress={() => move(page + 1)}
              >
                Next
              </ActionButton>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
