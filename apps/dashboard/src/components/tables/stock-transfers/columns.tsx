"use client"
import { stockDate, transferStatusLabel } from "@/lib/inventory-labels"
import { formatStockQuantity } from "@/lib/inventory-view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge, cn } from "@ewatrade/ui"
import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { ColumnDef } from "@tanstack/react-table"
export type StockTransfer = RouterOutputs["inventory"]["transfers"][number]
export const transferSortFields = [
  "identity",
  "createdAt",
  "status",
  "source",
  "target",
] as const

const statusTone: Record<string, string> = {
  IN_TRANSIT: "bg-info text-info-foreground",
  DISPATCHED: "bg-info text-info-foreground",
  RECEIVED: "bg-success text-success-foreground",
  CANCELLED: "bg-[var(--neutral)] text-[var(--neutral-foreground)]",
  EXCEPTION: "bg-danger text-danger-foreground",
}

export function TransferStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={cn(
        "rounded-full border-0",
        statusTone[status] ??
          "bg-[var(--neutral)] text-[var(--neutral-foreground)]",
      )}
    >
      {transferStatusLabel(status)}
    </Badge>
  )
}

export function transferProductDetail(row: StockTransfer) {
  return row.variantName && row.variantName !== row.productName
    ? row.variantName
    : null
}

/** "300 eggs", or "300 eggs · 100 still on the way" after a part arrived. */
export function transferQuantityText(row: StockTransfer) {
  const sent = formatStockQuantity(row.quantity, row.inventoryUnitName)
  const partly =
    row.status === "IN_TRANSIT" &&
    compareExactDecimals(row.remainingQuantity, row.quantity) < 0
  return partly
    ? `${sent} · ${formatStockQuantity(row.remainingQuantity, row.inventoryUnitName)} still on the way`
    : sent
}

export function transferColumns(): ColumnDef<StockTransfer>[] {
  return [
    {
      id: "identity",
      accessorFn: (row) => `${row.productName} ${row.variantName}`,
      header: "Product",
      size: 240,
      enableHiding: false,
      meta: {
        headerLabel: "Product",
        sortField: "identity",
        sticky: true,
        className: "z-20 bg-background group-hover:bg-[var(--hover)]",
      },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.productName}</p>
          {transferProductDetail(row.original) ? (
            <p className="truncate text-xs text-muted-foreground">
              {transferProductDetail(row.original)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "quantity",
      accessorKey: "quantity",
      header: "Quantity",
      size: 200,
      cell: ({ row }) => (
        <span className="truncate tabular-nums">
          {transferQuantityText(row.original)}
        </span>
      ),
    },
    {
      id: "source",
      accessorFn: (row) => row.sourceStore.name,
      header: "From",
      size: 180,
      meta: { sortField: "source" },
    },
    {
      id: "target",
      accessorFn: (row) => row.targetStore.name,
      header: "To",
      size: 180,
      meta: { sortField: "target" },
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      size: 140,
      meta: { sortField: "status" },
      cell: ({ row }) => <TransferStatusBadge status={row.original.status} />,
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: "Sent",
      size: 190,
      meta: { headerLabel: "Sent", sortField: "createdAt" },
      cell: ({ row }) => stockDate(row.original.createdAt),
    },
  ]
}
