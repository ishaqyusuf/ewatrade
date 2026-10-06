"use client"
import { formatInventoryQuantity } from "@/lib/inventory-view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { ColumnDef } from "@tanstack/react-table"
import { inventoryDate, inventoryLabel } from "../inventory-ledger/format"
import { LedgerRowActions } from "../inventory-ledger/row-actions"
export type StockTransfer = RouterOutputs["inventory"]["transfers"][number]
export const transferSortFields = [
  "identity",
  "createdAt",
  "status",
  "source",
  "target",
] as const
export function transferColumns(
  onOpen: (row: StockTransfer) => void,
): ColumnDef<StockTransfer>[] {
  return [
    {
      id: "identity",
      accessorFn: (row) => `${row.productName} ${row.variantName}`,
      header: "Product",
      size: 240,
      enableHiding: false,
      meta: { sortField: "identity", sticky: true },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.productName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {row.original.variantName}
          </p>
        </div>
      ),
    },
    {
      id: "quantity",
      accessorKey: "quantity",
      header: "Quantity",
      size: 170,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatInventoryQuantity(row.original.quantity)}{" "}
          {row.original.inventoryUnitName}
        </span>
      ),
    },
    {
      id: "source",
      accessorFn: (row) => row.sourceStore.name,
      header: "From",
      size: 190,
      meta: { sortField: "source" },
    },
    {
      id: "target",
      accessorFn: (row) => row.targetStore.name,
      header: "To",
      size: 190,
      meta: { sortField: "target" },
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      size: 150,
      meta: { sortField: "status" },
      cell: ({ row }) => (
        <span className="border border-border px-2 py-1 text-xs">
          {inventoryLabel(row.original.status)}
        </span>
      ),
    },
    {
      id: "createdAt",
      accessorKey: "createdAt",
      header: "Created (UTC)",
      size: 210,
      meta: { sortField: "createdAt" },
      cell: ({ row }) => inventoryDate(row.original.createdAt),
    },
    {
      id: "actions",
      header: "Actions",
      size: 90,
      enableHiding: false,
      enableResizing: false,
      meta: { sticky: true },
      cell: ({ row }) => (
        <LedgerRowActions
          label={`${row.original.productName} ${row.original.id}`}
          onOpen={() => onOpen(row.original)}
        />
      ),
    },
  ]
}
