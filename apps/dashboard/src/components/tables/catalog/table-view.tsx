"use client"

import {
  DirectoryToolbar,
  SelectionBar,
  TABLE_SCROLL_CONTAINER_CLASS,
  VirtualRow,
} from "@/components/tables/core"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { useStickyColumns } from "@/hooks/use-sticky-columns"
import { useTableDnd } from "@/hooks/use-table-dnd"
import { useTableScroll } from "@/hooks/use-table-scroll"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { DndContext, closestCenter } from "@dnd-kit/core"
import { Button, Table, TableBody } from "@ewatrade/ui"
import type { Table as ReactTable, Row } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useCallback } from "react"
import { CatalogCollection } from "./collection"
import type { CatalogRow } from "./columns"
import { CatalogEmptyState } from "./empty-states"
import { CatalogTableHeader, CatalogTableSettings } from "./table-header"

const ROW_HEIGHT = 57
const STICKY_COLUMNS = [
  { id: "select", width: 50 },
  { id: "item", width: 320 },
  { id: "actions", side: "right" as const, width: 80 },
]
const FIXED_COLUMN_IDS = ["select", "item"]

export function CatalogTableView({
  table,
  view,
  storeId,
  openUnits,
  openDetail,
  hasFilters,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  isRefetchError,
  errorMessage,
  persistenceError,
  retryPersistence,
  refetch,
  fetchNextPage,
}: {
  table: ReactTable<CatalogRow>
  view: DirectoryView
  storeId: string
  openUnits: (productId: string) => void
  openDetail: (itemId: string) => Promise<unknown>
  hasFilters: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  isRefetchError: boolean
  errorMessage: string
  persistenceError: string | null
  retryPersistence: () => void
  refetch: () => Promise<unknown>
  fetchNextPage: () => Promise<unknown>
}) {
  const openRow = useCallback(
    (row: Row<CatalogRow>) => {
      void openDetail(row.original.id)
    },
    [openDetail],
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
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableScroll.containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  })
  const { retry: retryNextPage } = useInfiniteScroll({
    scrollRef: tableScroll.containerRef,
    rowVirtualizer,
    rowCount: rows.length,
    hasNextPage,
    isFetchingNextPage,
    isError: isFetchNextPageError,
    fetchNextPage,
  })
  return (
    <div className="grid gap-3">
      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all loaded catalog items"
        summary={`${rows.length} items loaded`}
      >
        <CatalogTableSettings table={table} showColumns={view === "table"} />
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

      {isRefetchError ? (
        <div className="flex items-center justify-between gap-3" role="alert">
          <p className="text-sm text-destructive">
            {errorMessage || "Catalog items could not be refreshed."}
          </p>
          <Button
            appearance="form"
            variant="outline"
            onClick={() => void refetch()}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {isFetchNextPageError ? (
        <div className="flex items-center justify-between gap-3" role="alert">
          <p className="text-sm text-destructive">
            {errorMessage || "Catalog items could not be loaded."}
          </p>
          <Button appearance="form" variant="outline" onClick={retryNextPage}>
            Retry loading items
          </Button>
        </div>
      ) : null}

      {!rows.length ? (
        <CatalogEmptyState filtered={hasFilters} />
      ) : view !== "table" ? (
        <CatalogCollection
          view={view}
          rows={rows}
          storeId={storeId}
          openUnits={openUnits}
          openDetail={(itemId) => void openDetail(itemId)}
        />
      ) : (
        <section
          ref={tableScroll.setContainerRef}
          className={TABLE_SCROLL_CONTAINER_CLASS}
          aria-label="Catalog items"
        >
          <DndContext
            id="catalog-table-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table
              className="block text-sm"
              style={{ width: table.getTotalSize(), minWidth: "100%" }}
            >
              <CatalogTableHeader
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
                      getStickyClassName={getStickyClassName}
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

      {hasNextPage && !isFetchNextPageError ? (
        <Button
          appearance="form"
          className="w-fit"
          variant="outline"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? "Loading…" : "Load more items"}
        </Button>
      ) : null}
      <SelectionBar table={table} />
    </div>
  )
}
