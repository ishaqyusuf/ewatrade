import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useState } from "react"
import { Fragment } from "react"
import { ActionButton } from "../action-button"
import {
  ClassicCustomerOrderRow,
  ClassicCustomerPendingRow,
} from "../appearances/classic/customer-profile"
import type {
  CommerceCustomer,
  CommercialOrder,
  PendingCommerceOrder,
} from "../commerce/commerce-model"
import { EmptyState } from "../empty-state"

type HistoryRow =
  | { kind: "pending"; order: PendingCommerceOrder }
  | { kind: "synced"; order: CommercialOrder }

const PAGE_SIZE = 12

export function CustomerOrderHistory({
  customer,
  onOpenOrder,
  onLayout,
  onPageChange,
}: {
  customer: CommerceCustomer
  onOpenOrder: (orderId: string) => void
  onLayout: (y: number) => void
  onPageChange: () => void
}) {
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
      {/* Green Till: shadow outside, rounded clip inside so a pressed row's
          ripple reaches the card edges without spilling past the corners. */}
      <View className="rounded-[20px] bg-card shadow-sm">
        <View className="overflow-hidden rounded-[20px] px-3.5">
          {visible.map((row, index) => (
            <Fragment
              key={
                row.kind === "pending"
                  ? `pending:${row.order.clientCommandId}`
                  : `synced:${row.order.id}`
              }
            >
              {index ? <View className="h-px bg-border" /> : null}
              {row.kind === "pending" ? (
                <ClassicCustomerPendingRow order={row.order} />
              ) : (
                <ClassicCustomerOrderRow
                  order={row.order}
                  onPress={() => onOpenOrder(row.order.id)}
                />
              )}
            </Fragment>
          ))}
          {!rows.length ? (
            <EmptyState
              icon="ReceiptText"
              message="No orders are loaded for this customer."
              title="No loaded orders"
            />
          ) : null}
        </View>
      </View>
      {rows.length > PAGE_SIZE ? (
        <View className="gap-3">
          <Text
            accessibilityLiveRegion="polite"
            className="text-xs text-muted-foreground"
          >
            Showing {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of{" "}
            {rows.length} loaded orders
          </Text>
          <View className="flex-row flex-wrap gap-3">
            <View className="min-w-[44%] flex-1">
              <ActionButton
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
