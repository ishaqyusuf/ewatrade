import { orderStatusPill } from "@/components/orders/order-status"
import {
  formatOrderShortDateTime,
  isClosedOrder,
  orderPaymentPill,
} from "@/components/orders/overview/order-overview-model"
import { Pill } from "@/components/orders/overview/order-overview-parts"
import { selectColumn } from "@/components/tables/core"
import { formatOrderItemGroups } from "@/lib/order-item-descriptions"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { ColumnDef } from "@tanstack/react-table"
import { OrderActionsMenu } from "./action-menu"

export type OrderRow = RouterOutputs["orders"]["listPage"]["items"][number]

export function formatOrderMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    currency,
    style: "currency",
  }).format(value / 100)
}

export function getOrderCustomer(order: OrderRow) {
  return order.customerName || order.customerPhone || "Walk-in"
}

// Readable sizes from the Orders page workshop (01 Labeled view dropdown).
export const ORDER_PILL_CLASS = "h-auto px-2.5 py-0.5 text-[12.5px]"
export const ORDER_SUBTITLE_CLASS =
  "truncate text-[13.5px] text-muted-foreground"

export function OrderStatusPill({ status }: { status: string }) {
  const pill = orderStatusPill(status)
  return (
    <Pill tone={pill.tone} className={ORDER_PILL_CLASS}>
      {pill.label}
    </Pill>
  )
}

/** Closed orders show their state in Status, so Payment stays empty. */
export function OrderPaymentPill({ order }: { order: OrderRow }) {
  if (isClosedOrder(order.status)) return null
  const pill = orderPaymentPill(order)
  return (
    <Pill tone={pill.tone} className={ORDER_PILL_CLASS}>
      {pill.label}
    </Pill>
  )
}

export function orderColumns(timeZone?: string): ColumnDef<OrderRow>[] {
  return [
    selectColumn((order) => order.orderNumber),
    {
      accessorKey: "orderNumber",
      header: "Order",
      size: 170,
      minSize: 140,
      maxSize: 300,
      enableHiding: false,
      meta: {
        headerLabel: "Order",
        sortField: "orderNumber",
        sticky: true,
        reorderable: false,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
        skeleton: { type: "text" as const, width: "w-36" },
      },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-semibold">
            {row.original.orderNumber}
          </p>
          <p className={ORDER_SUBTITLE_CLASS}>
            {getOrderCustomer(row.original)}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Placed",
      size: 140,
      minSize: 120,
      maxSize: 200,
      meta: {
        headerLabel: "Placed",
        sortField: "createdAt",
        skeleton: { type: "text" as const, width: "w-24" },
      },
      cell: ({ row }) => (
        <span className="text-muted-foreground tabular-nums">
          {formatOrderShortDateTime(row.original.createdAt, timeZone)}
        </span>
      ),
    },
    {
      id: "items",
      header: "Items",
      size: 200,
      minSize: 170,
      maxSize: 560,
      meta: {
        headerLabel: "Items",
        skeleton: { type: "text" as const, width: "w-48" },
      },
      cell: ({ row }) => {
        // Rows are one fixed height; extra groups collapse to "+N more".
        const [first, ...rest] = formatOrderItemGroups(row.original.lines)
        return first ? (
          <div className="min-w-0">
            <p className="truncate">
              {first.name}
              {rest.length ? (
                <span className="text-muted-foreground">
                  {` +${rest.length} more`}
                </span>
              ) : null}
            </p>
            <p className={ORDER_SUBTITLE_CLASS}>{first.details}</p>
          </div>
        ) : null
      },
    },
    {
      accessorKey: "totalMinor",
      header: "Total",
      size: 130,
      minSize: 110,
      maxSize: 220,
      meta: {
        headerLabel: "Total",
        sortField: "total",
        skeleton: { type: "text" as const, width: "w-24" },
      },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatOrderMoney(row.original.totalMinor, row.original.currencyCode)}
        </span>
      ),
    },
    {
      id: "payment",
      header: "Payment",
      size: 230,
      minSize: 180,
      maxSize: 320,
      meta: {
        headerLabel: "Payment",
        skeleton: { type: "badge" as const, width: "w-32" },
      },
      cell: ({ row }) =>
        isClosedOrder(row.original.status) ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <OrderPaymentPill order={row.original} />
        ),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 150,
      minSize: 120,
      maxSize: 200,
      meta: {
        headerLabel: "Status",
        sortField: "status",
        skeleton: { type: "badge" as const, width: "w-24" },
      },
      cell: ({ row }) => <OrderStatusPill status={row.original.status} />,
    },
    {
      id: "actions",
      size: 70,
      minSize: 70,
      maxSize: 70,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerLabel: "Actions",
        reorderable: false,
        skeleton: { type: "text" as const, width: "w-4" },
      },
      cell: ({ row }) => <OrderActionsMenu order={row.original} />,
    },
  ]
}
