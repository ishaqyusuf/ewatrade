import type { TableColumnMeta } from "@/components/tables/core"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge } from "@ewatrade/ui"
import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { ColumnDef, SortingFn } from "@tanstack/react-table"

export type InventoryBalance =
  RouterOutputs["inventory"]["balanceReport"]["rows"][number]

export const inventorySortFields = [
  "productName",
  "kind",
  "onHandQuantity",
  "reservedQuantity",
  "availableQuantity",
  "custodyType",
] as const

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ")
}

const exactQuantitySort: SortingFn<InventoryBalance> = (rowA, rowB, columnId) =>
  compareExactDecimals(
    String(rowA.getValue(columnId)),
    String(rowB.getValue(columnId)),
  )

function meta(
  headerLabel: string,
  skeletonWidth: string,
  extra: Partial<TableColumnMeta> = {},
): TableColumnMeta {
  return {
    headerLabel,
    skeleton: { type: "text", width: skeletonWidth },
    ...extra,
  }
}

export const inventoryColumns: ColumnDef<InventoryBalance>[] = [
  {
    id: "product",
    accessorFn: (row) => row.productName,
    header: "Product",
    size: 300,
    minSize: 220,
    maxSize: 480,
    enableHiding: false,
    meta: meta("Product", "w-32", {
      sticky: true,
      reorderable: false,
      sortField: "productName",
      className: "z-20 bg-background md:sticky",
      skeleton: { type: "avatar-text", width: "w-32" },
    }),
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
    id: "source",
    accessorFn: (row) => row.kind,
    header: "Balance source",
    size: 210,
    minSize: 170,
    maxSize: 300,
    meta: meta("Balance source", "w-24", { sortField: "kind" }),
    cell: ({ row }) => (
      <div>
        <Badge className="rounded-full capitalize">
          {label(row.original.kind)}
        </Badge>
        <p className="mt-1 text-xs text-muted-foreground">
          {row.original.inventoryUnitName}
        </p>
      </div>
    ),
  },
  {
    id: "onHand",
    accessorFn: (row) => row.onHandQuantity,
    header: "On hand",
    size: 150,
    minSize: 120,
    maxSize: 220,
    sortingFn: exactQuantitySort,
    meta: meta("On hand", "w-20", { sortField: "onHandQuantity" }),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.onHandQuantity}</span>
    ),
  },
  {
    id: "reserved",
    accessorFn: (row) => row.reservedQuantity,
    header: "Reserved",
    size: 150,
    minSize: 120,
    maxSize: 220,
    sortingFn: exactQuantitySort,
    meta: meta("Reserved", "w-20", { sortField: "reservedQuantity" }),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.reservedQuantity}</span>
    ),
  },
  {
    id: "available",
    accessorFn: (row) => row.availableQuantity,
    header: "Available",
    size: 150,
    minSize: 120,
    maxSize: 220,
    sortingFn: exactQuantitySort,
    meta: meta("Available", "w-20", {
      sortField: "availableQuantity",
    }),
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">
        {row.original.availableQuantity}
      </span>
    ),
  },
  {
    id: "custody",
    accessorFn: (row) => row.custodyType,
    header: "Custody",
    size: 170,
    minSize: 140,
    maxSize: 250,
    meta: meta("Custody", "w-24", { sortField: "custodyType" }),
    cell: ({ row }) => (
      <span className="capitalize text-muted-foreground">
        {label(row.original.custodyType)}
      </span>
    ),
  },
]
