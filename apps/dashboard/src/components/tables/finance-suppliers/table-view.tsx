"use client"

import type { FinanceSupplierRow } from "@/components/finance/types"
import {
  DirectoryCollection,
  DirectoryRecord,
  DirectoryToolbar,
  SelectionBar,
  TABLE_SCROLL_CONTAINER_CLASS,
  VirtualRow,
} from "@/components/tables/core"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { useStickyColumns } from "@/hooks/use-sticky-columns"
import { useTableDnd } from "@/hooks/use-table-dnd"
import { useTableScroll } from "@/hooks/use-table-scroll"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { DndContext, closestCenter } from "@dnd-kit/core"
import { Alert, AlertDescription, Button, Table, TableBody } from "@ewatrade/ui"
import type { Table as ReactTable } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ViewSupplierButton } from "./columns"
import { FinanceSupplierEmptyState } from "./empty-states"
import { FinanceSupplierTableSkeleton } from "./skeleton"
import {
  FinanceSupplierTableHeader,
  FinanceSupplierTableSettings,
} from "./table-header"

const ROW_HEIGHT = 57
const STICKY_COLUMNS = [
  { id: "select", width: 50 },
  { id: "code", width: 180 },
  { id: "actions", side: "right" as const, width: 96 },
]
const FIXED_COLUMN_IDS = ["select", "code"]
const NON_CLICKABLE_COLUMNS = new Set(["select", "actions"])

export function FinanceSupplierTableView({
  table,
  view,
  filtered,
  isPending,
  hasData,
  isInitialError,
  isFetchNextPageError,
  isRefetchError,
  errorMessage,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  refetch,
  persistenceError,
  retryPersistence,
}: {
  table: ReactTable<FinanceSupplierRow>
  view: DirectoryView
  filtered: boolean
  isPending: boolean
  hasData: boolean
  isInitialError: boolean
  isFetchNextPageError: boolean
  isRefetchError: boolean
  errorMessage: string
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => Promise<unknown>
  refetch: () => Promise<unknown>
  persistenceError: string | null
  retryPersistence: () => void
}) {
  const { setParams } = useFinanceParams()
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

  if (isPending || (!hasData && !isInitialError)) {
    return (
      <FinanceSupplierTableSkeleton
        view={view}
        settings={{
          columns: table.getState().columnVisibility,
          sizing: table.getState().columnSizing,
          order: table.getState().columnOrder,
        }}
      />
    )
  }

  if (!hasData && isInitialError) {
    return (
      <Alert
        appearance="dashboard"
        variant="destructive"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <AlertDescription>
          {errorMessage || "Suppliers could not be loaded."}
        </AlertDescription>
        <Button
          appearance="form"
          type="button"
          variant="outline"
          onClick={() => void refetch()}
        >
          Try again
        </Button>
      </Alert>
    )
  }

  return (
    <div className="grid gap-4">
      {isFetchNextPageError || isRefetchError ? (
        <Alert
          appearance="dashboard"
          variant="destructive"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <AlertDescription>
            {errorMessage ||
              (isFetchNextPageError
                ? "More suppliers could not be loaded."
                : "Suppliers could not be refreshed.")}
          </AlertDescription>
          <Button
            appearance="form"
            type="button"
            variant="outline"
            onClick={() =>
              isFetchNextPageError ? retryNextPage() : void refetch()
            }
          >
            {isFetchNextPageError ? "Retry loading suppliers" : "Try again"}
          </Button>
        </Alert>
      ) : null}

      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all loaded suppliers"
        summary={`${rows.length} supplier${rows.length === 1 ? "" : "s"} loaded`}
      >
        {view === "table" ? (
          <FinanceSupplierTableSettings table={table} />
        ) : null}
      </DirectoryToolbar>

      {persistenceError ? (
        <Alert
          appearance="dashboard"
          variant="destructive"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <AlertDescription>{persistenceError}</AlertDescription>
          <Button
            appearance="form"
            type="button"
            variant="outline"
            onClick={retryPersistence}
          >
            Retry saving columns
          </Button>
        </Alert>
      ) : null}

      {!rows.length ? (
        <FinanceSupplierEmptyState filtered={filtered} />
      ) : view !== "table" ? (
        <DirectoryCollection view={view} label="Supplier">
          {rows.map((row) => {
            const supplier = row.original
            const open = () =>
              void setParams({
                financeSheet: "supplier-statement",
                supplierId: supplier.id,
              })
            return (
              <DirectoryRecord
                key={row.id}
                row={row}
                view={view}
                selectLabel={`Select ${supplier.name}`}
                title={supplier.name}
                onOpen={open}
                description={
                  <span className="font-mono text-xs">{supplier.code}</span>
                }
                actions={
                  <ViewSupplierButton supplier={supplier} onOpen={open} />
                }
              />
            )
          })}
        </DirectoryCollection>
      ) : (
        <section
          ref={tableScroll.setContainerRef}
          className={TABLE_SCROLL_CONTAINER_CLASS}
          aria-label="Supplier directory"
        >
          <DndContext
            id="finance-suppliers-table-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table
              className="block text-sm"
              style={{ width: table.getTotalSize(), minWidth: "100%" }}
            >
              <FinanceSupplierTableHeader
                table={table}
                tableScroll={tableScroll}
                sortableColumnIds={sortableColumnIds}
                getStickyStyle={getStickyStyle}
                getStickyClassName={getStickyClassName}
                isVisible={isVisible}
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
                      onRowOpen={(selectedRow) =>
                        void setParams({
                          financeSheet: "supplier-statement",
                          supplierId: selectedRow.original.id,
                        })
                      }
                      nonClickableColumns={NON_CLICKABLE_COLUMNS}
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
          type="button"
          className="w-fit"
          variant="outline"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? "Loading…" : "Load more suppliers"}
        </Button>
      ) : null}
      <SelectionBar table={table} />
    </div>
  )
}
