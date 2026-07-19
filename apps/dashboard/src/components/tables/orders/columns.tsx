import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"
import type { ReactNode } from "react"

export type OrderRow = RouterOutputs["orders"]["list"][number]

export type OrderColumn = {
  header: string
  key: string
  render: (order: OrderRow) => ReactNode
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    currency,
    style: "currency",
  }).format(value / 100)
}

export const orderColumns: OrderColumn[] = [
  {
    header: "Order",
    key: "order",
    render: (order) => (
      <div>
        <p className="font-medium">{order.orderNumber}</p>
        <p className="text-xs text-muted-foreground">
          {order.customerName || order.customerPhone || "Walk-in"}
        </p>
      </div>
    ),
  },
  {
    header: "Items",
    key: "items",
    render: (order) => (
      <span className="text-muted-foreground">
        {order.lines
          .map(
            (line) =>
              `${line.quantity} × ${line.snapshot?.catalogItemName ?? "Item"}`,
          )
          .join(", ")}
      </span>
    ),
  },
  {
    header: "Total",
    key: "total",
    render: (order) => money(order.totalMinor, order.currencyCode),
  },
  {
    header: "Status",
    key: "status",
    render: (order) => (
      <Badge className="rounded-full capitalize">
        {order.status.toLowerCase()}
      </Badge>
    ),
  },
]
