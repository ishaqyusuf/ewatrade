"use client"

import { InventoryOperationMenu } from "@/components/inventory/inventory-operation-menu"
import { type TableColumnMeta, selectColumn } from "@/components/tables/core"
import { formatInventoryQuantity } from "@/lib/inventory-view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge, Button } from "@ewatrade/ui"
import { compareExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { ColumnDef, SortingFn } from "@tanstack/react-table"

export type InventoryBalance =
  RouterOutputs["inventory"]["balanceReport"]["rows"][number] & {
    storeBalances?: RouterOutputs["inventory"]["balanceReport"]["rows"]
  }

export const inventorySortFields = [
  "productName",
  "kind",
  "onHandQuantity",
  "reservedQuantity",
  "availableQuantity",
  "custodyType",
] as const

export function inventoryLabel(value: string) {
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
          "z-20 bg-background group-hover:bg-muted/40 group-focus-visible:bg-muted/40 group-aria-selected:bg-muted/60 md:sticky",
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
            {row.original.variantName}
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
            {getInventoryStoreCount(row.original)} store(s)
          </Button>
        ) : (
          <span className="truncate">{row.original.storeName}</span>
        ),
    },
    {
      id: "source",
      accessorFn: (row) => row.kind,
      header: "Balance source",
      size: 170,
      minSize: 140,
      maxSize: 300,
      meta: meta("Balance source", "w-24", { sortField: "kind" }),
      cell: ({ row }) => (
        <div>
          <Badge className="rounded-full capitalize">
            {inventoryLabel(row.original.kind)}
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
      size: 120,
      minSize: 100,
      maxSize: 220,
      sortingFn: exactQuantitySort,
      meta: meta("On hand", "w-20", {
        sortField: "onHandQuantity",
        className: "text-right",
      }),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatInventoryQuantity(row.original.onHandQuantity)}
        </span>
      ),
    },
    {
      id: "reserved",
      accessorFn: (row) => row.reservedQuantity,
      header: "Reserved",
      size: 120,
      minSize: 100,
      maxSize: 220,
      sortingFn: exactQuantitySort,
      meta: meta("Reserved", "w-20", {
        sortField: "reservedQuantity",
        className: "text-right",
      }),
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatInventoryQuantity(row.original.reservedQuantity)}
        </span>
      ),
    },
    {
      id: "available",
      accessorFn: (row) => row.availableQuantity,
      header: "Available",
      size: 120,
      minSize: 100,
      maxSize: 220,
      sortingFn: exactQuantitySort,
      meta: meta("Available", "w-20", {
        sortField: "availableQuantity",
        className: "text-right",
      }),
      cell: ({ row }) => (
        <div className="text-right">
          <span className="font-semibold tabular-nums">
            {formatInventoryQuantity(row.original.availableQuantity)}
          </span>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.original.inventoryUnitName}
          </p>
        </div>
      ),
    },
    {
      id: "custody",
      accessorFn: (row) => row.custodyType,
      header: "Custody",
      size: 140,
      minSize: 110,
      maxSize: 250,
      meta: meta("Custody", "w-24", { sortField: "custodyType" }),
      cell: ({ row }) => (
        <span className="capitalize text-muted-foreground">
          {inventoryLabel(row.original.custodyType)}
        </span>
      ),
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
