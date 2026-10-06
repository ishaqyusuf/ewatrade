import { formatOrderItemGroups } from "@/lib/order-item-descriptions"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge, Checkbox } from "@ewatrade/ui"
import type { ColumnDef } from "@tanstack/react-table"
import { OrderActionsMenu } from "./action-menu"

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
      id: "select",
      size: 50,
      minSize: 50,
      maxSize: 50,
      enableHiding: false,
      enableResizing: false,
      meta: {
        headerLabel: "Select",
        sticky: true,
        reorderable: false,
        skeleton: { type: "checkbox" as const },
      },
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${row.original.orderNumber}`}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(value) => row.toggleSelected(value)}
        />
      ),
    },
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
