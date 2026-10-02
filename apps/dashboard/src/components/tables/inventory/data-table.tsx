"use client"

import { useInventoryParams } from "@/hooks/use-inventory-params"
import { useSortParams } from "@/hooks/use-sort-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { useTRPC } from "@/trpc/client"
import { type TableSettings, getColumnIds } from "@/utils/table-settings"
import { useSuspenseQuery } from "@tanstack/react-query"
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useMemo } from "react"
import { inventoryColumns, inventorySortFields } from "./columns"
import { InventoryOperations } from "./operations"
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
  storeId: string
  initialSettings?: Partial<TableSettings>
}) {
  const trpc = useTRPC()
  const { query } = useInventoryParams()
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
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return balances.rows
    return balances.rows.filter((row) =>
      [row.productName, row.variantName, row.inventoryUnitName, row.custodyType]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
  }, [balances.rows, query])
  const columnIds = useMemo(() => getColumnIds(inventoryColumns), [])
  const tableSettings = useTableSettings({
    tableId: "inventory",
    initialSettings,
    columnIds,
    fixedColumnIds: ["product"],
  })
  const table = useReactTable({
    data: rows,
    columns: inventoryColumns,
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
      <InventoryTableView
        table={table}
        filtered={Boolean(query.trim())}
        persistenceError={tableSettings.persistenceError}
        retryPersistence={tableSettings.retryPersistence}
      />
      <InventoryOperations storeId={storeId} />
    </div>
  )
}
