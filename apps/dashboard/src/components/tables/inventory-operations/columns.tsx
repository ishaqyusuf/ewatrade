"use client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { ColumnDef } from "@tanstack/react-table"
import { inventoryDate, inventoryLabel } from "../inventory-ledger/format"
import { LedgerRowActions } from "../inventory-ledger/row-actions"
export type InventoryOperation =
  RouterOutputs["inventory"]["operationHistory"][number]
export const operationSortFields = [
  "identity",
  "effectiveAt",
  "movementCount",
] as const
export function operationColumns(
  onOpen: (row: InventoryOperation) => void,
): ColumnDef<InventoryOperation>[] {
  return [
    {
      id: "identity",
      accessorKey: "type",
      header: "Operation",
      size: 240,
      enableHiding: false,
      meta: { headerLabel: "Operation", sortField: "identity", sticky: true },
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {inventoryLabel(row.original.type)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.original.id}
          </p>
        </div>
      ),
    },
    {
      id: "effectiveAt",
      accessorKey: "effectiveAt",
      header: "Effective (UTC)",
      size: 210,
      meta: { sortField: "effectiveAt" },
      cell: ({ row }) => inventoryDate(row.original.effectiveAt),
    },
    { id: "store", accessorKey: "storeName", header: "Store", size: 180 },
    {
      id: "categories",
      accessorFn: (row) => row.categories.map((c) => c.name).join(", "),
      header: "Categories",
      size: 200,
      cell: ({ getValue }) => (
        <span className="truncate">{String(getValue() || "—")}</span>
      ),
    },
    {
      id: "reason",
      accessorKey: "reason",
      header: "Reason",
      size: 280,
      cell: ({ getValue }) => (
        <span className="truncate">{String(getValue() || "—")}</span>
      ),
    },
    {
      id: "movementCount",
      accessorKey: "movementCount",
      header: "Movements",
      size: 140,
      meta: { sortField: "movementCount" },
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
          label={`${inventoryLabel(row.original.type)} ${row.original.id}`}
          onOpen={() => onOpen(row.original)}
        />
      ),
    },
  ]
}
