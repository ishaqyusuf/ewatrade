import { OrderStatusDot } from "@/components/orders/order-status"
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

export function orderColumns(): ColumnDef<OrderRow>[] {
  return [
    selectColumn((order) => order.orderNumber),
    {
      accessorKey: "orderNumber",
      header: "Order",
      size: 200,
      minSize: 160,
      maxSize: 300,
      enableHiding: false,
      meta: {
        headerLabel: "Order",
        sortField: "orderNumber",
        sticky: true,
        reorderable: false,
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-focus-visible:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
        skeleton: { type: "text" as const, width: "w-36" },
      },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-semibold">{row.original.orderNumber}</p>
          <p className="truncate text-xs text-muted-foreground">
            {getOrderCustomer(row.original)}
          </p>
        </div>
      ),
    },
    {
      id: "items",
      header: "Items",
      size: 360,
      minSize: 240,
      maxSize: 560,
      meta: {
        headerLabel: "Items",
        skeleton: { type: "text" as const, width: "w-48" },
      },
      cell: ({ row }) => (
        <div className="space-y-1">
          {formatOrderItemGroups(row.original.lines).map((group) => (
            <div key={group.name}>
              <p>{group.name}</p>
              <p className="text-xs text-muted-foreground">{group.details}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      accessorKey: "totalMinor",
      header: "Total",
      size: 150,
      minSize: 120,
      maxSize: 220,
      meta: {
        headerLabel: "Total",
        sortField: "total",
        align: "end",
        skeleton: { type: "text" as const, width: "w-24" },
      },
      cell: ({ row }) =>
        formatOrderMoney(row.original.totalMinor, row.original.currencyCode),
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
        skeleton: { type: "icon-text" as const, width: "w-20" },
      },
      cell: ({ row }) => <OrderStatusDot status={row.original.status} />,
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
