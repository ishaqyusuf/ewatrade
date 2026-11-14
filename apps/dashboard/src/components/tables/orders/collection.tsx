"use client"

import { formatOrderShortDateTime } from "@/components/orders/overview/order-overview-model"
import type { CollectionView } from "@/components/tables/core"
import { useOrderParams } from "@/hooks/use-order-params"
import { formatOrderItemGroups } from "@/lib/order-item-descriptions"
import type { Row } from "@tanstack/react-table"
import {
  ORDER_SUBTITLE_CLASS,
  OrderListChip,
  type OrderRow,
  formatOrderMoney,
  getOrderCustomer,
} from "./columns"

type CollectionProps = {
  rows: Row<OrderRow>[]
  timeZone?: string
  openDetails: (orderId: string) => void
}

/** The first item group, with "+N more" when the order has others. */
function FirstItems({ order }: { order: OrderRow }) {
  const [first, ...rest] = formatOrderItemGroups(order.lines)
  if (!first) return null
  return (
    <>
      {first.name}
      {rest.length ? (
        <span className="text-muted-foreground">{` +${rest.length} more`}</span>
      ) : null}
    </>
  )
}

const total = (order: OrderRow) =>
  formatOrderMoney(order.totalMinor, order.currencyCode)

const ROW_BUTTON =
  "w-full text-left outline-none transition-colors hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)] focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"

/** Grid columns are fixed by screen width: 1, then 2 at md, 3 at lg, 4 at xl. */
function OrdersGrid({ rows, timeZone, openDetails }: CollectionProps) {
  return (
    <ul
      aria-label="Orders"
      className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {rows.map((row) => {
        const order = row.original
        return (
          <li key={row.id} className="min-w-0">
            <button
              type="button"
              onClick={() => openDetails(order.id)}
              className={`${ROW_BUTTON} flex h-full flex-col overflow-hidden rounded-[var(--ui-radius-surface)] border bg-card`}
            >
              <span className="flex w-full items-baseline justify-between gap-3 px-4 pt-3.5">
                <span className="truncate font-semibold">
                  {order.orderNumber}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                  {formatOrderShortDateTime(order.createdAt, timeZone)}
                </span>
              </span>
              <span className="grid w-full min-w-0 flex-1 content-start gap-0.5 px-4 pt-1.5 pb-3.5">
                <span className="truncate">{getOrderCustomer(order)}</span>
                <span className={ORDER_SUBTITLE_CLASS}>
                  <FirstItems order={order} />
                </span>
              </span>
              <span className="flex w-full items-center justify-between gap-3 border-t px-4 py-3">
                <OrderListChip order={order} />
                <span className="text-lg font-semibold tabular-nums">
                  {total(order)}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * One bordered panel with a row per order. A row is one button that opens
 * the order: customer and number on the left, total and one chip (money due,
 * else the status) on the right. Items show from lg.
 */
function OrdersList({ rows, timeZone, openDetails }: CollectionProps) {
  return (
    <ul
      aria-label="Orders"
      className="divide-y overflow-hidden rounded-[var(--ui-radius-surface)] border bg-card"
    >
      {rows.map((row) => {
        const order = row.original
        return (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => openDetails(order.id)}
              className={`${ROW_BUTTON} grid min-h-[4.5rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 lg:grid-cols-[minmax(12rem,1fr)_minmax(0,1.2fr)_auto]`}
            >
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate font-medium">
                  {getOrderCustomer(order)}
                </span>
                <span className={ORDER_SUBTITLE_CLASS}>
                  {order.orderNumber}
                  {" · "}
                  {formatOrderShortDateTime(order.createdAt, timeZone)}
                </span>
              </span>
              <span className="hidden min-w-0 truncate text-muted-foreground lg:block">
                <FirstItems order={order} />
              </span>
              <span className="grid justify-items-end gap-1">
                <span className="font-semibold tabular-nums">
                  {total(order)}
                </span>
                <OrderListChip order={order} />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function OrdersCollection({
  rows,
  view,
  timeZone,
}: {
  rows: Row<OrderRow>[]
  view: CollectionView
  timeZone?: string
}) {
  const { setParams } = useOrderParams()
  const openDetails = (orderId: string) =>
    void setParams({ orderSheet: "details", orderId })
  return view === "cards" ? (
    <OrdersGrid rows={rows} timeZone={timeZone} openDetails={openDetails} />
  ) : (
    <OrdersList rows={rows} timeZone={timeZone} openDetails={openDetails} />
  )
}
