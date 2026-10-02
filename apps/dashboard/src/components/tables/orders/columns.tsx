import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"
import type { ColumnDef } from "@tanstack/react-table"

export type OrderRow = RouterOutputs["orders"]["listPage"]["items"][number]

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-NG", {
    currency,
    style: "currency",
  }).format(value / 100)
}

export function orderColumns(): ColumnDef<OrderRow>[] {
  return [
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
        className: "z-20 bg-background md:sticky",
        skeleton: { type: "text" as const, width: "w-36" },
      },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.orderNumber}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.original.customerName ||
              row.original.customerPhone ||
              "Walk-in"}
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
        <span className="text-muted-foreground">
          {row.original.lines
            .map(
              (line) =>
                `${line.quantity} × ${line.snapshot?.catalogItemName ?? "Item"}`,
            )
            .join(", ")}
        </span>
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
        skeleton: { type: "text" as const, width: "w-24" },
      },
      cell: ({ row }) =>
        money(row.original.totalMinor, row.original.currencyCode),
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
      cell: ({ row }) => (
        <Badge className="rounded-full capitalize">
          {row.original.status.toLowerCase()}
        </Badge>
      ),
    },
  ]
}
