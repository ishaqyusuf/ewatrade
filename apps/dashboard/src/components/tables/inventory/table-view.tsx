"use client"

import {
  DirectoryToolbar,
  SelectionBar,
  TABLE_SCROLL_CONTAINER_CLASS,
  VirtualRow,
} from "@/components/tables/core"
import { useStickyColumns } from "@/hooks/use-sticky-columns"
import { useTableDnd } from "@/hooks/use-table-dnd"
import { useTableScroll } from "@/hooks/use-table-scroll"
import { cn } from "@/utils"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { DndContext, closestCenter } from "@dnd-kit/core"
import { Button, Table, TableBody } from "@ewatrade/ui"
import type { Table as ReactTable, Row } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useCallback } from "react"
import { InventoryCollection } from "./collection"
import type { InventoryBalance } from "./columns"
import { InventoryEmptyState } from "./empty-states"
import { InventoryTableHeader, InventoryTableSettings } from "./table-header"

const ROW_HEIGHT = 57
const STICKY_COLUMNS = [
  { id: "select", width: 50 },
  { id: "product", width: 240 },
  { id: "actions", width: 84, side: "right" as const },
]
const FIXED_COLUMN_IDS = ["select", "product"]

export function InventoryTableView({
  table,
  view,
  onOpen,
  onStores,
  filtered,
  persistenceError,
  retryPersistence,
}: {
  table: ReactTable<InventoryBalance>
  view: DirectoryView
  onOpen: (catalogItemId: string) => void
  onStores: (row: InventoryBalance) => void
  filtered: boolean
  persistenceError: string | null
  retryPersistence: () => void
}) {
  const openRow = useCallback(
    (row: Row<InventoryBalance>) => onOpen(row.original.catalogItemId),
    [onOpen],
  )
  const { sensors, handleDragEnd, sortableColumnIds } = useTableDnd(table, {
    fixedColumnIds: FIXED_COLUMN_IDS,
  })
  const { getStickyStyle, getStickyClassName, isVisible } = useStickyColumns({
    table,
    stickyColumns: STICKY_COLUMNS,
  })
  const tableScroll = useTableScroll({ useColumnWidths: true })
  const rows = table.getRowModel().rows
  const lastVisibleColumnId =
    table
      .getVisibleLeafColumns()
      .filter((column) => column.id !== "actions")
      .at(-1)?.id ?? ""
  const getInventoryCellClassName = useCallback(
    (columnId: string, baseClassName?: string) =>
      cn(
        getStickyClassName(columnId, baseClassName),
        columnId === lastVisibleColumnId && "flex-1",
      ),
    [getStickyClassName, lastVisibleColumnId],
  )
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableScroll.containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })

  return (
    <div className="grid gap-3">
      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all loaded inventory balances"
        summary={`${rows.length} balance${rows.length === 1 ? "" : "s"}`}
      >
        {view === "table" ? <InventoryTableSettings table={table} /> : null}
      </DirectoryToolbar>

      {persistenceError ? (
        <div className="flex items-center justify-between gap-3" role="alert">
          <p className="text-sm text-destructive">{persistenceError}</p>
          <Button
            appearance="form"
            variant="outline"
            onClick={retryPersistence}
          >
            Retry saving columns
          </Button>
        </div>
      ) : null}

      {!rows.length ? (
        <InventoryEmptyState filtered={filtered} />
      ) : view !== "table" ? (
        <InventoryCollection
          view={view}
          rows={rows}
          onOpen={onOpen}
          onStores={onStores}
        />
      ) : (
        <section
          ref={tableScroll.setContainerRef}
          className={TABLE_SCROLL_CONTAINER_CLASS}
          aria-label="Inventory balances"
        >
          <DndContext
            id="inventory-table-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table
              className="block text-sm"
              style={{ width: table.getTotalSize(), minWidth: "100%" }}
            >
              <InventoryTableHeader
                table={table}
                sortableColumnIds={sortableColumnIds}
                getStickyStyle={getStickyStyle}
                getStickyClassName={getInventoryCellClassName}
                isVisible={isVisible}
                tableScroll={tableScroll}
              />
              <TableBody
                className="relative block w-full border-0"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index]
                  if (!row) return null
                  return (
                    <VirtualRow
                      key={row.id}
                      row={row}
                      virtualStart={virtualRow.start}
                      rowHeight={ROW_HEIGHT}
                      onRowOpen={openRow}
                      getStickyStyle={getStickyStyle}
                      getStickyClassName={getInventoryCellClassName}
                      columnSizing={table.getState().columnSizing}
                      columnOrder={table.getState().columnOrder}
                      columnVisibility={table.getState().columnVisibility}
                      isSelected={row.getIsSelected()}
                    />
                  )
                })}
              </TableBody>
            </Table>
          </DndContext>
          <div aria-hidden="true" className="h-1" />
        </section>
      )}
      <SelectionBar table={table} />
    </div>
  )
}
