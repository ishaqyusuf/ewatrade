"use client"
import { stockChangeLabel, stockDate } from "@/lib/inventory-labels"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { ColumnDef } from "@tanstack/react-table"
export type InventoryOperation =
  RouterOutputs["inventory"]["operationHistory"][number]
export const operationSortFields = [
  "identity",
  "effectiveAt",
  "movementCount",
] as const

/** Reasons picked from the list, then any typed note. */
export function operationReason(row: InventoryOperation) {
  return [row.categories.map((c) => c.name).join(", "), row.reason]
    .filter(Boolean)
    .join(" · ")
}

export function productsChangedText(count: number) {
  return `${count} product${count === 1 ? "" : "s"}`
}

/** One store's history has no Store column; the header names the store. */
export function operationColumns({
  showStore = true,
}: { showStore?: boolean } = {}): ColumnDef<InventoryOperation>[] {
  return [
    {
      id: "identity",
      accessorFn: (row) => stockChangeLabel(row.type),
      header: "Change",
      size: 220,
      enableHiding: false,
      meta: {
        headerLabel: "Change",
        sortField: "identity",
        sticky: true,
        className: "z-20 bg-background group-hover:bg-[var(--hover)]",
      },
      cell: ({ row }) => (
        <span className="truncate font-medium">
          {stockChangeLabel(row.original.type)}
        </span>
      ),
    },
    {
      id: "effectiveAt",
      accessorKey: "effectiveAt",
      header: "When",
      size: 190,
      meta: { headerLabel: "When", sortField: "effectiveAt" },
      cell: ({ row }) => stockDate(row.original.effectiveAt),
    },
    ...(showStore
      ? [
          {
            id: "store",
            accessorKey: "storeName",
            header: "Store",
            size: 170,
          } satisfies ColumnDef<InventoryOperation>,
        ]
      : []),
    {
      id: "reason",
      accessorFn: operationReason,
      header: "Reason and note",
      size: 320,
      meta: { headerLabel: "Reason and note" },
      cell: ({ getValue }) => (
        <span className="truncate">{String(getValue() || "—")}</span>
      ),
    },
    {
      id: "movementCount",
      accessorKey: "movementCount",
      header: "Products changed",
      size: 200,
      meta: { headerLabel: "Products changed", sortField: "movementCount" },
      cell: ({ row }) => productsChangedText(row.original.movementCount),
    },
  ]
}
