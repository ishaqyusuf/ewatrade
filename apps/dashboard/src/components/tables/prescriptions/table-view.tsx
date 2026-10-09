"use client"

import {
  DirectoryCollection,
  DirectoryRecord,
  DirectoryToolbar,
  HorizontalPagination,
  SelectionBar,
  TABLE_SCROLL_CONTAINER_CLASS,
  VirtualRow,
} from "@/components/tables/core"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import type { PrescriptionFilters } from "@/hooks/use-prescription-filter-params"
import { useStickyColumns } from "@/hooks/use-sticky-columns"
import { useTableDnd } from "@/hooks/use-table-dnd"
import { useTableScroll } from "@/hooks/use-table-scroll"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { DndContext, type DragEndEvent, closestCenter } from "@dnd-kit/core"
import type { PrescriptionRequestStatus } from "@ewatrade/prescriptions/schemas"
import { Button, Table, TableBody } from "@ewatrade/ui"
import type { Table as ReactTable } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { Virtualizer } from "@tanstack/react-virtual"
import { type CSSProperties, type ReactNode, useMemo } from "react"
import { PrescriptionActionsMenu } from "./actions-menu"
import {
  type PrescriptionQueueRow,
  PrescriptionStatusBadge,
  createPrescriptionDateFormatter,
  prescriptionLabel,
} from "./columns"
import {
  PrescriptionTableHeader,
  PrescriptionTableSettings,
} from "./table-header"

const ROW_HEIGHT = 57
const STICKY_COLUMNS = [
  { id: "select", width: 50 },
  { id: "reference", width: 170 },
  { id: "actions", side: "right" as const, width: 90 },
]
const NON_CLICKABLE_COLUMNS = new Set(["select", "actions"])

type PrescriptionSort = PrescriptionFilters["sort"]
type PrescriptionSortField = NonNullable<PrescriptionSort>[0]

export function PrescriptionTableView({
  table,
  view,
  timeZone,
  sort,
  toggleSort,
  onRowOpen,
  isInitialError,
  isFetchNextPageError,
  isRefetchError,
  errorMessage,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  refetch,
  emptyState,
  persistenceError,
  retryPersistence,
}: {
  table: ReactTable<PrescriptionQueueRow>
  view: DirectoryView
  timeZone: string
  sort: PrescriptionSort
  toggleSort: (field: PrescriptionSortField) => void
  onRowOpen: (id: string, status: PrescriptionRequestStatus) => void
  isInitialError: boolean
  isFetchNextPageError: boolean
  isRefetchError: boolean
  errorMessage: string
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => Promise<unknown>
  refetch: () => Promise<unknown>
  emptyState: ReactNode
  persistenceError: string | null
  retryPersistence: () => void
}) {
  const { sensors, handleDragEnd, sortableColumnIds } = useTableDnd(table, {
    fixedColumnIds: ["select", "reference"],
  })
  const dateFormatter = useMemo(
    () => createPrescriptionDateFormatter(timeZone),
    [timeZone],
  )
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
            {errorMessage || "Prescription requests could not be refreshed."}
          </p>
          <Button
            appearance="form"
            variant="outline"
            onClick={() =>
              isFetchNextPageError ? retryNextPage() : void refetch()
            }
          >
            {isFetchNextPageError ? "Retry loading requests" : "Try again"}
          </Button>
        </div>
      ) : null}

      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all loaded prescription requests"
        summary={`${rows.length} requests loaded${
          sort
            ? ` · sorted by ${sort[0]} ${sort[1] === "asc" ? "ascending" : "descending"}`
            : " · most recently received first"
        }`}
      >
        {view === "table" ? <PrescriptionTableSettings table={table} /> : null}
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
        <div className="border-y border-border py-10">{emptyState}</div>
      ) : view !== "table" ? (
        <DirectoryCollection view={view} label="Prescription request">
          {rows.map((row) => {
            const request = row.original
            return (
              <DirectoryRecord
                key={row.id}
                row={row}
                view={view}
                selectLabel={`Select prescription ${request.reference}`}
                title={
                  <span className="tabular-nums">{request.reference}</span>
                }
                onOpen={() => onRowOpen(request.id, request.status)}
                badges={<PrescriptionStatusBadge status={request.status} />}
                details={[
                  {
                    label: "Channel",
                    value: prescriptionLabel(request.source),
                  },
                  {
                    label: "Fulfilment",
                    value: prescriptionLabel(request.fulfilmentPreference),
                  },
                  {
                    label: "Received",
                    value: (
                      <time dateTime={request.createdAt.toISOString()}>
                        {dateFormatter.format(request.createdAt)}
                      </time>
                    ),
                  },
                ]}
                actions={
                  <PrescriptionActionsMenu
                    requestId={request.id}
                    status={request.status}
                    onOpen={onRowOpen}
                  />
                }
              />
            )
          })}
        </DirectoryCollection>
      ) : (
        <section
          ref={tableScroll.setContainerRef}
          className={TABLE_SCROLL_CONTAINER_CLASS}
          aria-label="Prescription request queue"
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
            onRowOpen={onRowOpen}
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
          {isFetchingNextPage ? "Loading…" : "Load more requests"}
        </Button>
      ) : null}
      <SelectionBar table={table} />
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
  onRowOpen,
  scrollControls,
}: {
  table: ReactTable<PrescriptionQueueRow>
  sortableColumnIds: string[]
  sensors: ReturnType<typeof useTableDnd<PrescriptionQueueRow>>["sensors"]
  handleDragEnd: (event: DragEndEvent) => void
  getStickyStyle: (columnId: string) => CSSProperties
  getStickyClassName: (columnId: string, base?: string) => string
  isVisible: (columnId: string) => boolean
  sort: PrescriptionSort
  toggleSort: (field: PrescriptionSortField) => void
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>
  onRowOpen: (id: string, status: PrescriptionRequestStatus) => void
  scrollControls: ReactNode
}) {
  const rows = table.getRowModel().rows
  return (
    <DndContext
      id="prescription-table-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <Table
        className="block text-sm"
        style={{ width: table.getTotalSize(), minWidth: "100%" }}
      >
        <PrescriptionTableHeader
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
                nonClickableColumns={NON_CLICKABLE_COLUMNS}
                columnSizing={table.getState().columnSizing}
                columnOrder={table.getState().columnOrder}
                columnVisibility={table.getState().columnVisibility}
                isSelected={row.getIsSelected()}
                onRowOpen={(selected) =>
                  onRowOpen(selected.original.id, selected.original.status)
                }
              />
            )
          })}
        </TableBody>
      </Table>
    </DndContext>
  )
}
