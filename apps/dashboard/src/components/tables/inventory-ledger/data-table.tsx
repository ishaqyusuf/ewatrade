"use client"
import {
  type DirectoryRecordDetail,
  TableToolbarPortal,
  VirtualRow,
} from "@/components/tables/core"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
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
import { LedgerTableHeader, LedgerTableSettings } from "./table-header"

const stickyColumns = [
  { id: "identity", width: 240 },
  { id: "actions", width: 64, side: "right" as const },
]
const fixedColumnIds = ["identity", "actions"]
const getLedgerId = (row: { id: string }) => row.id

/** Server cursor pages, loaded on scroll or with the Load more button. */
export type LedgerPagination = {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  errorMessage?: string
  fetchNextPage: () => Promise<unknown>
  /** Plural noun for the buttons, e.g. "stock changes". */
  noun: string
}

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
  getRecordLabel,
  describeRecord,
  onOpen,
  empty,
  summary,
  pagination,
}: {
  rows: T[]
  columns: ColumnDef<T>[]
  tableId: TableId
  initialSettings: Partial<TableSettings>
  sortFields: readonly string[]
  label: string
  view: DirectoryView
  getRecordLabel: (row: T) => string
  describeRecord: (row: T) => LedgerRecordDescription
  onOpen: (row: T) => void
  empty: React.ReactNode
  /** Count line, e.g. "12 changes". */
  summary: string
  pagination?: LedgerPagination
}) {
  const columns = domainColumns
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
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      sorting,
      columnOrder: settings.columnOrder,
      columnSizing: settings.columnSizing,
      columnVisibility: settings.columnVisibility,
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
  const { retry: retryNextPage } = useInfiniteScroll({
    scrollRef: scroll.containerRef,
    rowVirtualizer: virtualizer,
    rowCount: visible.length,
    hasNextPage: pagination?.hasNextPage ?? false,
    isFetchingNextPage: pagination?.isFetchingNextPage ?? false,
    isError: pagination?.isFetchNextPageError,
    fetchNextPage: pagination?.fetchNextPage ?? noNextPage,
  })
  const openRow = useCallback((row: Row<T>) => onOpen(row.original), [onOpen])
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {summary}
      </p>
      {view === "table" ? (
        <TableToolbarPortal>
          <LedgerTableSettings table={table} />
        </TableToolbarPortal>
      ) : null}
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
        <ul
          aria-label={label}
          className="divide-y divide-border overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"
        >
          {visible.map((row) => (
            <LedgerListRow
              key={row.id}
              label={getRecordLabel(row.original)}
              onOpen={() => onOpen(row.original)}
              {...describeRecord(row.original)}
            />
          ))}
        </ul>
      ) : (
        <section
          aria-label={label}
          ref={scroll.setContainerRef}
          className="max-h-[640px] overflow-auto overscroll-contain rounded-[var(--ui-radius-surface)] border border-border bg-card"
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
      {pagination?.isFetchNextPageError ? (
        <div className="flex items-center justify-between gap-3" role="alert">
          <p className="text-sm text-destructive">
            {pagination.errorMessage ||
              `More ${pagination.noun} could not be loaded.`}
          </p>
          <Button variant="outline" onClick={retryNextPage}>
            Retry loading {pagination.noun}
          </Button>
        </div>
      ) : pagination?.hasNextPage ? (
        <Button
          className="w-fit"
          variant="outline"
          disabled={pagination.isFetchingNextPage}
          onClick={() => void pagination.fetchNextPage()}
        >
          {pagination.isFetchingNextPage
            ? "Loading…"
            : `Load more ${pagination.noun}`}
        </Button>
      ) : null}
    </div>
  )
}

const noNextPage = () => Promise.resolve()

/**
 * One record on phones and in List view: the whole row opens it. Details read
 * as one plain line under the title; the status sits on the right.
 */
function LedgerListRow({
  label,
  onOpen,
  title,
  description,
  badges,
  details,
}: LedgerRecordDescription & { label: string; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        aria-label={`Open ${label}`}
        onClick={onOpen}
        className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 text-left transition-colors hover:bg-[var(--hover)]"
      >
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate font-medium">
            {title}
            {description ? (
              <span className="font-normal text-muted-foreground">
                {" · "}
                {description}
              </span>
            ) : null}
          </span>
          <span className="text-sm text-muted-foreground">
            {details.map((detail, index) => (
              <span key={detail.label}>
                {index ? " · " : null}
                {detail.value}
              </span>
            ))}
          </span>
        </span>
        {badges ? <span className="shrink-0">{badges}</span> : null}
      </button>
    </li>
  )
}
