"use client"

import {
  DirectoryToolbar,
  HorizontalPagination,
  TABLE_SCROLL_CONTAINER_CLASS,
  VirtualRow,
} from "@/components/tables/core"
import type { orderSortFields } from "@/hooks/sort-params"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { useStickyColumns } from "@/hooks/use-sticky-columns"
import { useTableDnd } from "@/hooks/use-table-dnd"
import { useTableScroll } from "@/hooks/use-table-scroll"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { DndContext, type DragEndEvent, closestCenter } from "@dnd-kit/core"
import { Button, Table, TableBody } from "@ewatrade/ui"
import type { Table as ReactTable } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { Virtualizer } from "@tanstack/react-virtual"
import type { CSSProperties, ReactNode } from "react"
import { OrdersCollection } from "./collection"
import type { OrderRow } from "./columns"
import { OrdersEmptyState } from "./empty-states"
import { OrdersTableHeader, OrdersTableSettings } from "./table-header"

const ROW_HEIGHT = 48
const STICKY_COLUMNS = [
  { id: "select", width: 50 },
  { id: "orderNumber", width: 200 },
]

type OrderSort = {
  field: (typeof orderSortFields)[number]
  direction: "asc" | "desc"
}

export function OrdersTableView({
  table,
  view,
  sort,
  toggleSort,
  filtered,
  errorMessage,
  isInitialError,
  isFetchNextPageError,
  isRefetchError,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  refetch,
  persistenceError,
  retryPersistence,
}: {
  table: ReactTable<OrderRow>
  view: DirectoryView
  sort?: OrderSort
  toggleSort: (field: OrderSort["field"]) => Promise<unknown>
  filtered: boolean
  errorMessage: string
  isInitialError: boolean
  isFetchNextPageError: boolean
  isRefetchError: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => Promise<unknown>
  refetch: () => Promise<unknown>
  persistenceError: string | null
  retryPersistence: () => void
}) {
  const { sensors, handleDragEnd, sortableColumnIds } = useTableDnd(table, {
    fixedColumnIds: ["select", "orderNumber", "actions"],
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

  if (isInitialError) {
    return (
      <div role="alert" className="grid gap-3 py-6">
        <p>{errorMessage}</p>
        <Button
          appearance="form"
          variant="outline"
          onClick={() => void refetch()}
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {isFetchNextPageError || isRefetchError ? (
        <div className="flex items-center justify-between gap-3" role="alert">
          <p className="text-sm text-destructive">
            {errorMessage || "Orders could not be refreshed."}
          </p>
          <Button
            appearance="form"
            variant="outline"
            onClick={() =>
              isFetchNextPageError ? retryNextPage() : void refetch()
            }
          >
            {isFetchNextPageError ? "Retry loading orders" : "Try again"}
          </Button>
        </div>
      ) : null}

      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all loaded orders"
        summary={`${table.getRowModel().rows.length} orders loaded${
          sort
            ? ` · sorted by ${sort.field} ${sort.direction === "asc" ? "ascending" : "descending"}`
            : " · newest first"
        }`}
      >
        {view === "table" ? <OrdersTableSettings table={table} /> : null}
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
        <div className="border-y border-border py-10">
          <OrdersEmptyState filtered={filtered} />
        </div>
      ) : view !== "table" ? (
        <OrdersCollection view={view} rows={rows} />
      ) : (
        <section
          ref={tableScroll.setContainerRef}
          className={TABLE_SCROLL_CONTAINER_CLASS}
          aria-label="Commercial orders"
        >
          <DndTable
            table={table}
            sortableColumnIds={sortableColumnIds}
            sensors={sensors}
            handleDragEnd={handleDragEnd}
            getStickyStyle={getStickyStyle}
            getStickyClassName={getStickyClassName}
            isVisible={isVisible}
            sort={sort}
            toggleSort={toggleSort}
            rowVirtualizer={rowVirtualizer}
            scrollControls={
              tableScroll.isScrollable ? (
                <HorizontalPagination
                  canScrollLeft={tableScroll.canScrollLeft}
                  canScrollRight={tableScroll.canScrollRight}
                  onScrollLeft={tableScroll.scrollLeft}
                  onScrollRight={tableScroll.scrollRight}
                  className="hidden md:flex"
                />
              ) : null
            }
          />
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
          {isFetchingNextPage ? "Loading…" : "Load more orders"}
        </Button>
      ) : null}
    </div>
  )
}

function DndTable({
  table,
  sortableColumnIds,
  sensors,
  handleDragEnd,
  getStickyStyle,
  getStickyClassName,
  isVisible,
  sort,
  toggleSort,
  rowVirtualizer,
  scrollControls,
}: {
  table: ReactTable<OrderRow>
  sortableColumnIds: string[]
  sensors: ReturnType<typeof useTableDnd<OrderRow>>["sensors"]
  handleDragEnd: (event: DragEndEvent) => void
  getStickyStyle: (columnId: string) => CSSProperties
  getStickyClassName: (columnId: string, base?: string) => string
  isVisible: (columnId: string) => boolean
  sort?: OrderSort
  toggleSort: (field: OrderSort["field"]) => Promise<unknown>
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>
  scrollControls: ReactNode
}) {
  const rows = table.getRowModel().rows
  return (
    <DndContext
      id="orders-table-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <Table
        className="block text-sm"
        style={{ width: table.getTotalSize(), minWidth: "100%" }}
      >
        <OrdersTableHeader
          table={table}
          sortableColumnIds={sortableColumnIds}
          sort={sort}
          toggleSort={toggleSort}
          getStickyStyle={getStickyStyle}
          getStickyClassName={getStickyClassName}
          isVisible={isVisible}
          scrollControls={scrollControls}
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
  )
}
