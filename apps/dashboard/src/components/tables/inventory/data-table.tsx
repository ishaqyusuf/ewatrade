"use client"

import { InventorySummary } from "@/components/inventory/inventory-summary"
import { InventoryStoresSheet } from "@/components/sheets/inventory-stores-sheet"
import { LowStockLevelSheet } from "@/components/sheets/low-stock-level-sheet"
import { useLoadedRowSelection } from "@/components/tables/core"
import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { useInventoryParams } from "@/hooks/use-inventory-params"
import { useSortParams } from "@/hooks/use-sort-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { groupInventoryStores } from "@/lib/inventory-store-totals"
import { filterInventory, summarizeInventory } from "@/lib/inventory-view"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
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
  onHandQuantity: "onHand",
  reservedQuantity: "reserved",
  availableQuantity: "available",
} as const
const getBalanceId = (row: InventoryBalance) => row.balanceSourceId

export function InventoryDataTable({
  storeId,
  initialSettings,
  view,
}: {
  storeId?: string
  initialSettings?: Partial<TableSettings>
  view: DirectoryView
}) {
  const { storesDetail, levelBalanceId, setParams } = useInventoryParams()
  const setStoreDetail = useCallback(
    (row: InventoryBalance) => {
      void setParams({ inventoryStores: row.balanceSourceId })
    },
    [setParams],
  )
  const trpc = useTRPC()
  const { open } = useCatalogDetailParams()
  const openDetail = useCallback(
    (catalogItemId: string) => void open(catalogItemId),
    [open],
  )
  const columns = useMemo(
    () => createInventoryColumns(openDetail, setStoreDetail),
    [openDetail, setStoreDetail],
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
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows,
    getRowId: getBalanceId,
    scope: JSON.stringify([
      storeId ?? "all",
      deferredQuery.trim(),
      stockFilter,
    ]),
  })
  const columnIds = useMemo(() => getColumnIds(columns), [columns])
  const tableSettings = useTableSettings({
    tableId: "inventory",
    initialSettings,
    columnIds,
    fixedColumnIds: ["select", "product"],
  })
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getBalanceId,
    onRowSelectionChange: setRowSelection,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      sorting,
      columnVisibility: tableSettings.columnVisibility,
      columnSizing: tableSettings.columnSizing,
      columnOrder: tableSettings.columnOrder,
      rowSelection,
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
          Each product adds up its stores. Open Stores to see each one. Stock on
          the way is not counted until it is received.
        </p>
      ) : null}
      <LowStockLevelSheet
        record={
          balances.rows.find((row) => row.balanceSourceId === levelBalanceId) ??
          null
        }
        onClose={() => void setParams({ inventoryLevel: null })}
      />
      <InventoryStoresSheet
        record={
          scopedRows.find((row) => row.balanceSourceId === storesDetail) ?? null
        }
        onClose={() => void setParams({ inventoryStores: null })}
      />
      <InventoryTableView
        table={table}
        view={view}
        onOpen={openDetail}
        onStores={setStoreDetail}
        filtered={Boolean(query.trim()) || stockFilter !== "all"}
        persistenceError={tableSettings.persistenceError}
        retryPersistence={tableSettings.retryPersistence}
      />
    </div>
  )
}
