"use client"
import { FormFeedback } from "@/components/forms/form-feedback"
import type { WorkJob } from "@/components/service-work/service-utils"
import {
  DirectoryToolbar,
  SelectionBar,
  TABLE_SCROLL_CONTAINER_CLASS,
  VirtualRow,
} from "@/components/tables/core"
import type { serviceWorkSortFields } from "@/hooks/sort-params"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { useStickyColumns } from "@/hooks/use-sticky-columns"
import { useTableDnd } from "@/hooks/use-table-dnd"
import { useTableScroll } from "@/hooks/use-table-scroll"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { DndContext, closestCenter } from "@dnd-kit/core"
import { Button, Table, TableBody } from "@ewatrade/ui"
import type { Table as ReactTable } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ServiceWorkBatchMessage, ServiceWorkBottomBar } from "./bottom-bar"
import { ServiceWorkCollection } from "./collection"
import { ServiceWorkEmptyState } from "./empty-states"
import {
  ServiceWorkTableHeader,
  ServiceWorkTableSettings,
} from "./table-header"
import type { useServiceWorkBatch } from "./use-batch-actions"
const FIXED = ["select", "order"]
const STICKY = [
  { id: "select", width: 50 },
  { id: "order", width: 280 },
  { id: "actions", side: "right" as const, width: 80 },
]
export function ServiceWorkTableView({
  table,
  view,
  timeZone,
  openJob,
  filtered,
  sort,
  batch,
  canManage,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  isRefetchError,
  errorMessage,
  fetchNextPage,
  refetch,
  persistenceError,
  retryPersistence,
}: {
  table: ReactTable<WorkJob>
  view: DirectoryView
  timeZone: string
  openJob: (jobId: string) => void
  filtered: boolean
  sort?: {
    field: (typeof serviceWorkSortFields)[number]
    direction: "asc" | "desc"
  }
  batch: ReturnType<typeof useServiceWorkBatch>
  canManage: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  isRefetchError: boolean
  errorMessage: string
  fetchNextPage: () => Promise<unknown>
  refetch: () => Promise<unknown>
  persistenceError: string | null
  retryPersistence: () => void
}) {
  const { sensors, handleDragEnd, sortableColumnIds } = useTableDnd(table, {
    fixedColumnIds: FIXED,
  })
  const sticky = useStickyColumns({ table, stickyColumns: STICKY })
  const scroll = useTableScroll({ useColumnWidths: true })
  const rows = table.getRowModel().rows
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroll.containerRef.current,
    estimateSize: () => 57,
    overscan: 10,
  })
  const { retry } = useInfiniteScroll({
    scrollRef: scroll.containerRef,
    rowVirtualizer: virtualizer,
    rowCount: rows.length,
    hasNextPage,
    isFetchingNextPage,
    isError: isFetchNextPageError,
    fetchNextPage,
  })
  const selectedCount = table.getSelectedRowModel().rows.length
  return (
    <div className="grid gap-4">
      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all loaded jobs"
        summary={`${rows.length} jobs loaded · ${
          sort
            ? `${sort.field === "priority" ? "priority" : "created date"} ${sort.direction === "asc" ? "ascending" : "descending"}`
            : "urgent first, then oldest"
        }`}
      >
        {view === "table" ? <ServiceWorkTableSettings table={table} /> : null}
      </DirectoryToolbar>
      {isFetchNextPageError || isRefetchError ? (
        <div role="alert" className="flex items-center justify-between gap-3">
          <p className="text-sm text-destructive">{errorMessage}</p>
          <Button
            className="rounded-none"
            variant="outline"
            onClick={() => (isFetchNextPageError ? retry() : void refetch())}
          >
            {isFetchNextPageError ? "Retry loading jobs" : "Try again"}
          </Button>
        </div>
      ) : null}
      {persistenceError ? (
        <div role="alert" className="flex items-center justify-between gap-3">
          <p className="text-sm text-destructive">{persistenceError}</p>
          <Button
            className="rounded-none"
            variant="outline"
            onClick={retryPersistence}
          >
            Retry saving columns
          </Button>
        </div>
      ) : null}
      {batch.error && selectedCount === 0 ? (
        <FormFeedback appearance="dashboard">{batch.error}</FormFeedback>
      ) : null}
      {canManage && selectedCount > 0 ? (
        <ServiceWorkBatchMessage batch={batch} />
      ) : null}
      {rows.length && view !== "table" ? (
        <ServiceWorkCollection
          view={view}
          rows={rows}
          timeZone={timeZone}
          openJob={openJob}
        />
      ) : rows.length ? (
        <section
          ref={scroll.setContainerRef}
          aria-label="Service work records"
          className={TABLE_SCROLL_CONTAINER_CLASS}
        >
          <DndContext
            id="service-work-table-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table
              className="block text-sm"
              style={{ width: table.getTotalSize(), minWidth: "100%" }}
            >
              <ServiceWorkTableHeader
                table={table}
                tableScroll={scroll}
                sortableColumnIds={sortableColumnIds}
                getStickyStyle={sticky.getStickyStyle}
                getStickyClassName={sticky.getStickyClassName}
                isVisible={sticky.isVisible}
              />
              <TableBody
                className="relative block w-full border-0"
                style={{ height: virtualizer.getTotalSize() }}
              >
                {virtualizer.getVirtualItems().map((item) => {
                  const row = rows[item.index]
                  return row ? (
                    <VirtualRow
                      key={row.id}
                      row={row}
                      virtualStart={item.start}
                      rowHeight={57}
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
      ) : (
        <ServiceWorkEmptyState filtered={filtered} />
      )}
      {hasNextPage && !isFetchNextPageError ? (
        <Button
          className="w-fit rounded-none"
          variant="outline"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? "Loading…" : "Load more jobs"}
        </Button>
      ) : null}
      {canManage ? (
        <ServiceWorkBottomBar
          count={selectedCount}
          deselect={() => table.resetRowSelection()}
          batch={batch}
        />
      ) : (
        <SelectionBar table={table} />
      )}
    </div>
  )
}
