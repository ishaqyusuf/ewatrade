"use client"

import { formatOrderShortDateTime } from "@/components/orders/overview/order-overview-model"
import {
  type CollectionView,
  RowSelectCheckbox,
} from "@/components/tables/core"
import { useOrderParams } from "@/hooks/use-order-params"
import { formatOrderItemGroups } from "@/lib/order-item-descriptions"
import type { Row } from "@tanstack/react-table"
import { OrderActionsMenu } from "./action-menu"
import {
  ORDER_SUBTITLE_CLASS,
  OrderPaymentPill,
  type OrderRow,
  OrderStatusPill,
  formatOrderMoney,
  getOrderCustomer,
} from "./columns"

type CollectionProps = {
  rows: Row<OrderRow>[]
  timeZone?: string
  openDetails: (orderId: string) => void
}

function OrderTitle({
  order,
  onOpen,
}: {
  order: OrderRow
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      className="min-w-0 truncate text-left text-[15px] font-semibold tabular-nums underline-offset-4 outline-none hover:underline focus-visible:underline"
      onClick={onOpen}
    >
      {order.orderNumber}
    </button>
  )
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

function OrderPills({ order }: { order: OrderRow }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <OrderStatusPill status={order.status} />
      <OrderPaymentPill order={order} />
    </div>
  )
}

const total = (order: OrderRow) =>
  formatOrderMoney(order.totalMinor, order.currencyCode)

/** Grid columns are fixed by screen width: 1, then 2 at md, 3 at lg, 4 at xl. */
function OrdersGrid({ rows, timeZone, openDetails }: CollectionProps) {
  return (
    <ul
      aria-label="Order grid"
      className="grid min-w-0 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {rows.map((row) => {
        const order = row.original
        return (
          <li key={row.id} className="min-w-0">
            <article
              data-state={row.getIsSelected() ? "selected" : undefined}
              className="flex h-full flex-col rounded-xl border bg-card data-[state=selected]:border-transparent data-[state=selected]:ring-2 data-[state=selected]:ring-primary"
            >
              <div className="grid grid-cols-[1rem_auto_minmax(0,1fr)_auto] items-center gap-2.5 pt-2.5 pr-2 pl-3.5">
                <RowSelectCheckbox
                  row={row}
                  label={`Select ${order.orderNumber}`}
                />
                <OrderTitle
                  order={order}
                  onOpen={() => openDetails(order.id)}
                />
                <span className="truncate text-right text-[13px] text-muted-foreground tabular-nums">
                  {formatOrderShortDateTime(order.createdAt, timeZone)}
                </span>
                <OrderActionsMenu order={order} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1 px-3.5 pt-2 pb-3.5">
                <p className="truncate text-[15px] font-semibold">
                  {getOrderCustomer(order)}
                </p>
                <p className={ORDER_SUBTITLE_CLASS}>
                  <FirstItems order={order} />
                </p>
                <div className="mt-2">
                  <OrderPills order={order} />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2 border-t px-3.5 py-2.5 text-[13.5px] tabular-nums">
                <span className="text-muted-foreground">Total</span>
                <span className="text-base font-semibold">{total(order)}</span>
              </div>
            </article>
          </li>
        )
      })}
    </ul>
  )
}

/** One bordered panel with a divided row per order; items hide below lg, pills wrap under the number on phones. */
function OrdersList({ rows, timeZone, openDetails }: CollectionProps) {
  return (
    <ul aria-label="Order list" className="divide-y rounded-lg border">
      {rows.map((row) => {
        const order = row.original
        const [first] = formatOrderItemGroups(order.lines)
        return (
          <li
            key={row.id}
            data-state={row.getIsSelected() ? "selected" : undefined}
            className="grid grid-cols-[1rem_minmax(0,1fr)_auto_2rem] items-center gap-x-4 gap-y-2 px-3.5 py-2.5 data-[state=selected]:bg-muted md:grid-cols-[1rem_minmax(0,1fr)_14rem_7.5rem_2rem] lg:grid-cols-[1rem_minmax(9rem,1fr)_minmax(0,1.2fr)_18rem_7.5rem_2rem]"
          >
            <RowSelectCheckbox
              row={row}
              label={`Select ${order.orderNumber}`}
            />
            <div className="grid min-w-0 justify-items-start gap-0.5">
              <OrderTitle order={order} onOpen={() => openDetails(order.id)} />
              <p className={`max-w-full ${ORDER_SUBTITLE_CLASS}`}>
                {getOrderCustomer(order)} ·{" "}
                {formatOrderShortDateTime(order.createdAt, timeZone)}
              </p>
            </div>
            <div className="hidden min-w-0 gap-0.5 lg:grid">
              <p className="truncate">
                <FirstItems order={order} />
              </p>
              {first ? (
                <p className={ORDER_SUBTITLE_CLASS}>{first.details}</p>
              ) : null}
            </div>
            <div className="max-md:col-span-2 max-md:col-start-2 max-md:row-start-2">
              <OrderPills order={order} />
            </div>
            <p className="text-right text-[15px] font-semibold tabular-nums max-md:col-start-3 max-md:row-start-1">
              <span className="block text-[12.5px] font-normal text-muted-foreground">
                Total
              </span>
              {total(order)}
            </p>
            <div className="max-md:col-start-4 max-md:row-start-1">
              <OrderActionsMenu order={order} />
            </div>
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
