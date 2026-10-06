"use client"

import { InventoryFilters } from "@/components/inventory/inventory-filters"
import { InventorySummary } from "@/components/inventory/inventory-summary"
import { InventoryStoresSheet } from "@/components/sheets/inventory-stores-sheet"
import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { useSortParams } from "@/hooks/use-sort-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { groupInventoryStores } from "@/lib/inventory-store-totals"
import { filterInventory, summarizeInventory } from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import { type TableSettings, getColumnIds } from "@/utils/table-settings"
import { useSuspenseQuery } from "@tanstack/react-query"
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useCallback, useDeferredValue, useMemo } from "react"
import {
  type InventoryBalance,
  createInventoryColumns,
  inventorySortFields,
} from "./columns"
import { InventoryTableView } from "./table-view"

const SORT_COLUMN_IDS = {
  productName: "product",
  kind: "source",
  onHandQuantity: "onHand",
  reservedQuantity: "reserved",
  availableQuantity: "available",
  custodyType: "custody",
} as const

export function InventoryDataTable({
  storeId,
  initialSettings,
}: {
  storeId?: string
  initialSettings?: Partial<TableSettings>
}) {
  const { storesDetail, setParams } = useInventoryParams()
  const setStoreDetail = useCallback(
    (row: InventoryBalance) => {
      void setParams({ inventoryStores: row.balanceSourceId })
    },
    [setParams],
  )
  const trpc = useTRPC()
  const { open } = useCatalogDetailParams()
  const columns = useMemo(
    () =>
      createInventoryColumns((id) => {
        void open(id)
      }, setStoreDetail),
    [open, setStoreDetail],
  )
  const { query, stockFilter } = useInventoryParams()
  const deferredQuery = useDeferredValue(query)
  const { sorting: urlSorting } = useSortParams({ fields: inventorySortFields })
  const sorting = useMemo(
    () => urlSorting.map(({ id, desc }) => ({ id: SORT_COLUMN_IDS[id], desc })),
    [urlSorting],
  )
  const { data: balances } = useSuspenseQuery(
    trpc.inventory.balanceReport.queryOptions(
      { includeCompatibleTotals: true, storeId },
      { retry: false },
    ),
  )
  const scopedRows = useMemo(
    () => (storeId ? balances.rows : groupInventoryStores(balances.rows)),
    [balances.rows, storeId],
  )
  const summary = useMemo(
    () => summarizeInventory(balances.rows),
    [balances.rows],
  )
  const rows = useMemo(
    () => filterInventory(scopedRows, deferredQuery, stockFilter),
    [scopedRows, deferredQuery, stockFilter],
  )
  const columnIds = useMemo(() => getColumnIds(columns), [columns])
  const tableSettings = useTableSettings({
    tableId: "inventory",
    initialSettings,
    columnIds,
    fixedColumnIds: ["product"],
  })
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.balanceSourceId,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      sorting,
      columnVisibility: tableSettings.columnVisibility,
      columnSizing: tableSettings.columnSizing,
      columnOrder: tableSettings.columnOrder,
    },
    onColumnVisibilityChange: tableSettings.setColumnVisibility,
    onColumnSizingChange: tableSettings.setColumnSizing,
    onColumnOrderChange: tableSettings.setColumnOrder,
  })

  return (
    <div className="grid gap-6">
      <InventorySummary summary={summary} />
      {!storeId ? (
        <p className="text-sm text-muted-foreground">
          Combined by product, variant and unit. Open Stores for individual
          balances. Stock in transit is separate and unavailable to sell.
        </p>
      ) : null}
      <InventoryStoresSheet
        record={
          scopedRows.find((row) => row.balanceSourceId === storesDetail) ?? null
        }
        onClose={() => void setParams({ inventoryStores: null })}
      />
      <InventoryFilters />
      <InventoryTableView
        table={table}
        filtered={Boolean(query.trim()) || stockFilter !== "all"}
        persistenceError={tableSettings.persistenceError}
        retryPersistence={tableSettings.retryPersistence}
      />
    </div>
  )
}
