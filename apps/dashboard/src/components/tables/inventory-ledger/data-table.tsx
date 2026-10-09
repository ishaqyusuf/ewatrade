"use client"
import {
  DirectoryCollection,
  DirectoryRecord,
  type DirectoryRecordDetail,
  DirectoryToolbar,
  SelectionBar,
  TABLE_SCROLL_CONTAINER_CLASS,
  VirtualRow,
  selectColumn,
  useLoadedRowSelection,
} from "@/components/tables/core"
import { useSortParams } from "@/hooks/use-sort-params"
import { useStickyColumns } from "@/hooks/use-sticky-columns"
import { useTableDnd } from "@/hooks/use-table-dnd"
import { useTableScroll } from "@/hooks/use-table-scroll"
import { useTableSettings } from "@/hooks/use-table-settings"
import type { DirectoryView } from "@/utils/directory-view-settings"
import {
  type TableId,
  type TableSettings,
  getColumnIds,
} from "@/utils/table-settings"
import { DndContext, closestCenter } from "@dnd-kit/core"
import { Button, Table, TableBody } from "@ewatrade/ui"
import {
  type ColumnDef,
  type Row,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { type ReactNode, useCallback, useMemo } from "react"
import { LedgerRowActions } from "./row-actions"
import { LedgerTableHeader, LedgerTableSettings } from "./table-header"

const stickyColumns = [
  { id: "select", width: 50 },
  { id: "identity", width: 240 },
  { id: "actions", width: 90, side: "right" as const },
]
const fixedColumnIds = ["select", "identity", "actions"]
const getLedgerId = (row: { id: string }) => row.id

export type LedgerRecordDescription = {
  title: ReactNode
  description?: ReactNode
  badges?: ReactNode
  details: DirectoryRecordDetail[]
}

export function InventoryLedgerTable<T extends { id: string }>({
  rows,
  columns: domainColumns,
  tableId,
  initialSettings,
  sortFields,
  label,
  view,
  selectionScope,
  getRecordLabel,
  describeRecord,
  onOpen,
  empty,
}: {
  rows: T[]
  columns: ColumnDef<T>[]
  tableId: TableId
  initialSettings: Partial<TableSettings>
  sortFields: readonly string[]
  label: string
  view: DirectoryView
  selectionScope: string
  getRecordLabel: (row: T) => string
  describeRecord: (row: T) => LedgerRecordDescription
  onOpen: (row: T) => void
  empty: React.ReactNode
}) {
  const columns = useMemo(
    () => [selectColumn(getRecordLabel), ...domainColumns],
    [getRecordLabel, domainColumns],
  )
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows,
    getRowId: getLedgerId,
    scope: selectionScope,
  })
  const columnIds = useMemo(() => getColumnIds(columns), [columns])
  const settings = useTableSettings({
    tableId,
    initialSettings,
    columnIds,
    fixedColumnIds,
  })
  const { sorting } = useSortParams({ fields: sortFields })
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: getLedgerId,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      sorting,
      columnOrder: settings.columnOrder,
      columnSizing: settings.columnSizing,
      columnVisibility: settings.columnVisibility,
      rowSelection,
    },
    onColumnOrderChange: settings.setColumnOrder,
    onColumnSizingChange: settings.setColumnSizing,
    onColumnVisibilityChange: settings.setColumnVisibility,
  })
  const dnd = useTableDnd(table, { fixedColumnIds })
  const sticky = useStickyColumns({ table, stickyColumns })
  const scroll = useTableScroll({ useColumnWidths: true })
  const visible = table.getRowModel().rows
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scroll.containerRef.current,
    estimateSize: () => 57,
    overscan: 8,
  })
  const openRow = useCallback((row: Row<T>) => onOpen(row.original), [onOpen])
  return (
    <div className="grid gap-3">
      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel={`Select all loaded ${label.toLowerCase()}`}
        summary={`${rows.length} records in this view`}
      >
        {view === "table" ? <LedgerTableSettings table={table} /> : null}
      </DirectoryToolbar>
      {settings.persistenceError ? (
        <div role="alert" className="flex items-center gap-3">
          <p>{settings.persistenceError}</p>
          <Button onClick={settings.retryPersistence}>
            Retry saving columns
          </Button>
        </div>
      ) : null}
      {!rows.length ? (
        empty
      ) : view !== "table" ? (
        <DirectoryCollection view={view} label={label}>
          {visible.map((row) => (
            <DirectoryRecord
              key={row.id}
              row={row}
              view={view}
              selectLabel={`Select ${getRecordLabel(row.original)}`}
              onOpen={() => onOpen(row.original)}
              actions={
                <LedgerRowActions
                  label={getRecordLabel(row.original)}
                  onOpen={() => onOpen(row.original)}
                />
              }
              {...describeRecord(row.original)}
            />
          ))}
        </DirectoryCollection>
      ) : (
        <section
          aria-label={label}
          ref={scroll.setContainerRef}
          className={TABLE_SCROLL_CONTAINER_CLASS}
        >
          <DndContext
            id={`${tableId}-dnd`}
            sensors={dnd.sensors}
            onDragEnd={dnd.handleDragEnd}
            collisionDetection={closestCenter}
          >
            <Table
              className="block text-sm"
              style={{ width: table.getTotalSize(), minWidth: "100%" }}
            >
              <LedgerTableHeader
                table={table}
                sortFields={sortFields}
                selectAllLabel={`Select all loaded ${label.toLowerCase()}`}
                sortableColumnIds={dnd.sortableColumnIds}
                getStickyStyle={sticky.getStickyStyle}
                getStickyClassName={sticky.getStickyClassName}
                isVisible={sticky.isVisible}
                tableScroll={scroll}
              />
              <TableBody
                className="relative block w-full border-0"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((item) => {
                  const row = visible[item.index]
                  return row ? (
                    <VirtualRow
                      key={row.id}
                      row={row}
                      virtualStart={item.start}
                      rowHeight={57}
                      onRowOpen={openRow}
                      getStickyStyle={sticky.getStickyStyle}
                      getStickyClassName={sticky.getStickyClassName}
                      columnSizing={table.getState().columnSizing}
                      columnOrder={table.getState().columnOrder}
                      columnVisibility={table.getState().columnVisibility}
                      isSelected={row.getIsSelected()}
                    />
                  ) : null
                })}
              </TableBody>
            </Table>
          </DndContext>
        </section>
      )}
      <SelectionBar table={table} />
    </div>
  )
}
