"use client"

import { InventoryOperationMenu } from "@/components/inventory/inventory-operation-menu"
import { type TableColumnMeta, selectColumn } from "@/components/tables/core"
import {
  type InventoryStockStatus,
  formatStockQuantity,
  getInventoryStatus,
  inventoryStatusLabels,
} from "@/lib/inventory-view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge, Button, cn } from "@ewatrade/ui"
import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { ColumnDef, SortingFn } from "@tanstack/react-table"

export type InventoryBalance =
  RouterOutputs["inventory"]["balanceReport"]["rows"][number] & {
    storeBalances?: RouterOutputs["inventory"]["balanceReport"]["rows"]
  }

export const inventorySortFields = [
  "productName",
  "onHandQuantity",
  "reservedQuantity",
  "availableQuantity",
] as const

const statusTone: Record<InventoryStockStatus, string> = {
  in_stock: "bg-primary/10 text-primary",
  low: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  out: "bg-destructive/10 text-destructive",
  transit: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  staff: "bg-muted text-foreground",
}

export function InventoryStatusBadge({ row }: { row: InventoryBalance }) {
  const status = getInventoryStatus(row)
  return (
    <Badge className={cn("rounded-full border-0", statusTone[status])}>
      {inventoryStatusLabels[status]}
    </Badge>
  )
}

/** Variant, packed unit and store, whichever tell this line apart. */
export function getInventoryLineDetail(row: InventoryBalance) {
  const parts = [
    row.variantName && row.variantName !== row.productName
      ? row.variantName
      : null,
    row.kind === "PACKAGED_STOCK" ? `Packed: ${row.inventoryUnitName}` : null,
    row.storeBalances ? storeCountText(row) : null,
  ].filter(Boolean)
  return parts.length
    ? parts.join(" · ")
    : `Counted in ${formatStockQuantity("2", row.inventoryUnitName).slice(2)}`
}

function storeCountText(row: InventoryBalance) {
  const count = getInventoryStoreCount(row)
  return `${count} store${count === 1 ? "" : "s"}`
}

function Quantity({
  value,
  unit,
  strong = false,
  blankZero = false,
}: {
  value: string
  unit: string
  strong?: boolean
  blankZero?: boolean
}) {
  if (blankZero && compareExactDecimals(value, "0") === 0)
    return <span className="text-muted-foreground">—</span>
  return (
    <span className={cn("tabular-nums", strong && "font-semibold")}>
      {formatStockQuantity(value, unit)}
    </span>
  )
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

export function getInventoryRecordName(row: InventoryBalance) {
  return [
    row.productName,
    row.variantName,
    row.storeBalances ? null : row.storeName,
  ]
    .filter(Boolean)
    .join(" · ")
}

export function getInventoryStoreCount(row: InventoryBalance) {
  return new Set(row.storeBalances?.map((balance) => balance.storeId)).size
}

export function InventoryRowActions({
  row,
  onStores,
}: {
  row: InventoryBalance
  onStores?: (row: InventoryBalance) => void
}) {
  return row.storeBalances ? (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`View stores for ${row.productName}`}
      onClick={() => onStores?.(row)}
    >
      Stores
    </Button>
  ) : (
    <InventoryOperationMenu balance={row} />
  )
}

export function createInventoryColumns(
  onOpen?: (catalogItemId: string) => void,
  onStores?: (row: InventoryBalance) => void,
): ColumnDef<InventoryBalance>[] {
  return [
    selectColumn(getInventoryRecordName),
    {
      id: "product",
      accessorFn: (row) => row.productName,
      header: "Product",
      size: 240,
      minSize: 180,
      maxSize: 480,
      enableHiding: false,
      meta: meta("Product", "w-32", {
        sticky: true,
        reorderable: false,
        sortField: "productName",
        className:
          "z-20 bg-background group-hover:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
        skeleton: { type: "avatar-text", width: "w-32" },
      }),
      cell: ({ row }) => (
        <div className="min-w-0">
          <Button
            type="button"
            variant="link"
            size="sm"
            data-catalog-open={row.original.catalogItemId}
            className="block h-auto max-w-full truncate p-0 text-left"
            onClick={(event) => {
              event.stopPropagation()
              onOpen?.(row.original.catalogItemId)
            }}
          >
            {row.original.productName}
          </Button>
          <p className="truncate text-xs text-muted-foreground">
            {getInventoryLineDetail(row.original)}
          </p>
        </div>
      ),
    },
    {
      id: "store",
      accessorKey: "storeName",
      header: "Store",
      size: 180,
      meta: meta("Store", "w-24"),
      cell: ({ row }) =>
        row.original.storeBalances ? (
          <Button
            variant="link"
            className="truncate p-0"
            onClick={() => onStores?.(row.original)}
          >
            {storeCountText(row.original)}
          </Button>
        ) : (
          <span className="truncate">{row.original.storeName}</span>
        ),
    },
    {
      id: "onHand",
      accessorFn: (row) => row.onHandQuantity,
      header: "In stock",
      size: 140,
      minSize: 110,
      maxSize: 240,
      sortingFn: exactQuantitySort,
      meta: meta("In stock", "w-20", {
        sortField: "onHandQuantity",
        className: "text-right",
      }),
      cell: ({ row }) => (
        <Quantity
          value={row.original.onHandQuantity}
          unit={row.original.inventoryUnitName}
        />
      ),
    },
    {
      id: "reserved",
      accessorFn: (row) => row.reservedQuantity,
      header: "Held for orders",
      size: 170,
      minSize: 120,
      maxSize: 240,
      sortingFn: exactQuantitySort,
      meta: meta("Held for orders", "w-20", {
        sortField: "reservedQuantity",
        className: "text-right",
      }),
      cell: ({ row }) => (
        <Quantity
          value={row.original.reservedQuantity}
          unit={row.original.inventoryUnitName}
          blankZero
        />
      ),
    },
    {
      id: "available",
      accessorFn: (row) => row.availableQuantity,
      header: "Free to sell",
      size: 140,
      minSize: 110,
      maxSize: 240,
      sortingFn: exactQuantitySort,
      meta: meta("Free to sell", "w-20", {
        sortField: "availableQuantity",
        className: "text-right",
      }),
      cell: ({ row }) => (
        <Quantity
          value={row.original.availableQuantity}
          unit={row.original.inventoryUnitName}
          strong
        />
      ),
    },
    {
      id: "status",
      accessorFn: (row) => getInventoryStatus(row),
      header: "Status",
      size: 130,
      minSize: 110,
      maxSize: 200,
      enableSorting: false,
      meta: meta("Status", "w-20"),
      cell: ({ row }) => <InventoryStatusBadge row={row.original} />,
    },
    {
      id: "actions",
      header: "Actions",
      size: 84,
      minSize: 84,
      maxSize: 84,
      enableHiding: false,
      enableSorting: false,
      enableResizing: false,
      meta: meta("Actions", "w-8", {
        sticky: true,
        reorderable: false,
        className: "z-20 bg-background",
      }),
      cell: ({ row }) => (
        <InventoryRowActions row={row.original} onStores={onStores} />
      ),
    },
  ]
}

export const inventoryColumns = createInventoryColumns()
