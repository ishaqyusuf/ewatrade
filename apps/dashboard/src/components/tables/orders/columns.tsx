import { orderStatusPill } from "@/components/orders/order-status"
import {
  type PillTone,
  formatOrderShortDateTime,
  isClosedOrder,
} from "@/components/orders/overview/order-overview-model"
import { Pill } from "@/components/orders/overview/order-overview-parts"
import { selectColumn } from "@/components/tables/core"
import { formatOrderItemGroups } from "@/lib/order-item-descriptions"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { ColumnDef } from "@tanstack/react-table"

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

export const ORDER_SUBTITLE_CLASS = "truncate text-sm text-muted-foreground"

/** Money still owed on an open order; closed orders owe nothing. */
export function orderDueMinor(order: OrderRow) {
  return isClosedOrder(order.status) ? 0 : Math.max(order.balanceDueMinor, 0)
}

/**
 * The one chip a list row shows: what is owed when money is due, otherwise
 * the order's status word (Confirmed, Completed, Cancelled, Refunded).
 */
export function orderListChip(order: OrderRow): {
  label: string
  tone: PillTone
} {
  const due = orderDueMinor(order)
  if (due > 0)
    return {
      label: `${formatOrderMoney(due, order.currencyCode)} due`,
      tone: "amber",
    }
  return orderStatusPill(order.status)
}

export function OrderListChip({ order }: { order: OrderRow }) {
  const chip = orderListChip(order)
  return <Pill tone={chip.tone}>{chip.label}</Pill>
}

export function OrderStatusPill({ status }: { status: string }) {
  const pill = orderStatusPill(status)
  return <Pill tone={pill.tone}>{pill.label}</Pill>
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
          <p className="truncate font-semibold">{row.original.orderNumber}</p>
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
      id: "due",
      header: "Due",
      size: 140,
      minSize: 110,
      maxSize: 220,
      meta: {
        headerLabel: "Due",
        skeleton: { type: "text" as const, width: "w-20" },
      },
      cell: ({ row }) => {
        const due = orderDueMinor(row.original)
        return due > 0 ? (
          <span className="font-medium text-warning-foreground tabular-nums">
            {formatOrderMoney(due, row.original.currencyCode)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
    },
  ]
}
