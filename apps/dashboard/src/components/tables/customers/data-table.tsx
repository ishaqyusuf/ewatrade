"use client"

import {
  DirectoryCollectionSkeleton,
  DirectoryToolbar,
  SelectionBar,
  VirtualRow,
  useLoadedRowSelection,
} from "@/components/tables/core"
import { CustomerDirectoryEmptyState } from "@/components/tables/customers/empty-states"
import { customerSortFields } from "@/components/tables/customers/sort"
import {
  CustomerTableHeader,
  CustomerTableSettings,
} from "@/components/tables/customers/table-header"
import { useSortParams } from "@/hooks/use-sort-params"
import { useStickyColumns } from "@/hooks/use-sticky-columns"
import { useTableDnd } from "@/hooks/use-table-dnd"
import { useTableScroll } from "@/hooks/use-table-scroll"
import { useTableSettings } from "@/hooks/use-table-settings"
import type { DashboardCustomerRow } from "@/lib/sales-operations"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { type TableSettings, getColumnIds } from "@/utils/table-settings"
import { DndContext, closestCenter } from "@dnd-kit/core"
import { Button, Table, TableBody } from "@ewatrade/ui"
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useMemo } from "react"
import { CustomerCollection } from "./collection"
import { customerColumns } from "./columns"
import { CustomerTableSkeleton } from "./skeleton"

const ROW_HEIGHT = 57
const STICKY_COLUMNS = [
  { id: "select", width: 50 },
  { id: "name", width: 250 },
]
const FIXED_COLUMN_IDS = ["select", "name"]
const getCustomerId = (customer: DashboardCustomerRow) => customer.id

export function CustomerDataTable({
  rows,
  view,
  currencyCode,
  canSeeBalances,
  isLoading,
  query,
  onClearSearch,
  onAddCustomer,
  onEdit,
  initialSettings,
}: {
  rows: DashboardCustomerRow[]
  view: DirectoryView
  currencyCode: string
  canSeeBalances: boolean
  isLoading: boolean
  query: string
  onClearSearch: () => void
  onAddCustomer?: () => void
  onEdit: (customerId: string) => void
  initialSettings?: Partial<TableSettings>
}) {
  const columns = useMemo(
    () => customerColumns({ currencyCode, canSeeBalances, onEdit }),
    [currencyCode, canSeeBalances, onEdit],
  )
  const columnIds = useMemo(() => getColumnIds(columns), [columns])
  const tableSettings = useTableSettings({
    tableId: "customers",
    initialSettings,
    columnIds,
    fixedColumnIds: FIXED_COLUMN_IDS,
  })
  const { sorting } = useSortParams({ fields: customerSortFields })
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows,
    getRowId: getCustomerId,
    scope: query.trim(),
  })
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: getCustomerId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    enableRowSelection: !isLoading,
    onRowSelectionChange: setRowSelection,
    state: {
      columnVisibility: tableSettings.columnVisibility,
      columnSizing: tableSettings.columnSizing,
      columnOrder: tableSettings.columnOrder,
      rowSelection,
      sorting,
    },
    onColumnVisibilityChange: tableSettings.setColumnVisibility,
    onColumnSizingChange: tableSettings.setColumnSizing,
    onColumnOrderChange: tableSettings.setColumnOrder,
  })
  const { sensors, handleDragEnd, sortableColumnIds } = useTableDnd(table, {
    fixedColumnIds: FIXED_COLUMN_IDS,
  })
  const { getStickyStyle, getStickyClassName, isVisible } = useStickyColumns({
    table,
    stickyColumns: STICKY_COLUMNS,
  })
  const tableScroll = useTableScroll({ useColumnWidths: true })
  const tableRows = table.getRowModel().rows
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableScroll.containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })
  if (!rows.length && isLoading) {
    if (view !== "table")
      return <DirectoryCollectionSkeleton label="customers" />
    return (
      <CustomerTableSkeleton
        currencyCode={currencyCode}
        canSeeBalances={canSeeBalances}
        columnVisibility={tableSettings.columnVisibility}
        columnSizing={tableSettings.columnSizing}
        columnOrder={tableSettings.columnOrder}
      />
    )
  }
  if (!rows.length)
    return (
      <CustomerDirectoryEmptyState
        query={query}
        onClearSearch={onClearSearch}
        onAddCustomer={onAddCustomer}
      />
    )
  const search = query.trim()

  return (
    <div className="grid gap-3" aria-busy={isLoading}>
      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all"
        disabled={isLoading}
        summary={`${rows.length} ${rows.length === 1 ? "customer" : "customers"}${
          search ? ` match “${search}”` : ""
        }${isLoading ? " · Updating…" : ""}`}
      >
        {view === "table" && tableSettings.persistenceError ? (
          <Button variant="outline" onClick={tableSettings.retryPersistence}>
            Columns not saved. Try again
          </Button>
        ) : null}
      </DirectoryToolbar>
      <CustomerTableSettings
        table={table}
        showColumns={view === "table"}
        canSeeBalances={canSeeBalances}
      />
      {view !== "table" ? (
        <CustomerCollection
          view={view}
          rows={tableRows}
          currencyCode={currencyCode}
          canSeeBalances={canSeeBalances}
          onEdit={onEdit}
        />
      ) : (
        <div
          ref={tableScroll.setContainerRef}
          className="max-h-[560px] overflow-auto overscroll-contain border border-border"
          aria-label="Customers"
        >
          <DndContext
            id="customers-directory-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table
              className="block text-sm"
              style={{ width: table.getTotalSize(), minWidth: "100%" }}
            >
              <CustomerTableHeader
                table={table}
                sortableColumnIds={sortableColumnIds}
                getStickyStyle={getStickyStyle}
                getStickyClassName={getStickyClassName}
                isVisible={isVisible}
                tableScroll={tableScroll}
              />
              <TableBody
                className="relative block w-full border-0"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = tableRows[virtualRow.index]
                  return row ? (
                    <VirtualRow
                      key={row.id}
                      row={row}
                      virtualStart={virtualRow.start}
                      rowHeight={ROW_HEIGHT}
                      getStickyStyle={getStickyStyle}
                      getStickyClassName={getStickyClassName}
                      columnSizing={table.getState().columnSizing}
                      columnOrder={table.getState().columnOrder}
                      columnVisibility={table.getState().columnVisibility}
                      isSelected={row.getIsSelected()}
                      isSelectionDisabled={isLoading}
                      className="[&>td:last-child]:flex-1"
                    />
                  ) : null
                })}
              </TableBody>
            </Table>
          </DndContext>
        </div>
      )}
      <SelectionBar table={table} />
    </div>
  )
}
