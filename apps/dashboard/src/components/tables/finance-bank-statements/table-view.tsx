"use client"

import type {
  FinanceBankStatementRow,
  FinanceBook,
} from "@/components/finance/types"
import {
  DirectoryCollection,
  DirectoryRecord,
  DirectoryToolbar,
  SelectionBar,
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
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { Table as ReactTable } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { formatStatementRange, getStatementAccountName } from "./columns"
import { FinanceBankStatementEmptyState } from "./empty-states"
import { FinanceBankStatementTableSkeleton } from "./skeleton"
import {
  FinanceBankStatementTableHeader,
  FinanceBankStatementTableSettings,
} from "./table-header"

const ROW_HEIGHT = 57
const STICKY_COLUMNS = [
  { id: "select", width: 50 },
  { id: "reference", width: 240 },
  { id: "actions", side: "right" as const, width: 96 },
]
const FIXED_COLUMN_IDS = ["select", "reference"]
const NON_CLICKABLE_COLUMNS = new Set(["select", "actions"])

export function FinanceBankStatementTableView({
  table,
  book,
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
  table: ReactTable<FinanceBankStatementRow>
  book: FinanceBook
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
      <FinanceBankStatementTableSkeleton
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
          {errorMessage || "Statements could not be loaded."}
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
                ? "More statements could not be loaded."
                : "Statements could not be refreshed.")}
          </AlertDescription>
          <Button
            appearance="form"
            type="button"
            variant="outline"
            onClick={() =>
              isFetchNextPageError ? retryNextPage() : void refetch()
            }
          >
            {isFetchNextPageError ? "Retry loading statements" : "Try again"}
          </Button>
        </Alert>
      ) : null}

      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all loaded bank statements"
        summary={`${rows.length} statement${rows.length === 1 ? "" : "s"} loaded`}
      >
        {view === "table" ? (
          <FinanceBankStatementTableSettings table={table} />
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
        <FinanceBankStatementEmptyState filtered={filtered} />
      ) : view !== "table" ? (
        <DirectoryCollection view={view} label="Bank statement">
          {rows.map((row) => {
            const statement = row.original
            const open = () =>
              void setParams({
                financeSheet: "bank-statement",
                statementId: statement.id,
              })
            return (
              <DirectoryRecord
                key={row.id}
                row={row}
                view={view}
                selectLabel={`Select ${statement.reference}`}
                title={statement.reference}
                onOpen={open}
                description={`${getStatementAccountName(book, statement)} · ${formatStatementRange(statement)}`}
                highlight={{
                  label: "Closing balance",
                  value: formatFinanceMoney(
                    statement.closingBalanceMinor,
                    statement.currencyCode,
                  ),
                }}
                details={[
                  {
                    label: "Transactions",
                    value: (
                      <span className="tabular-nums">{statement.rowCount}</span>
                    ),
                  },
                ]}
                actions={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Review ${statement.reference}`}
                    onClick={open}
                  >
                    Review
                  </Button>
                }
              />
            )
          })}
        </DirectoryCollection>
      ) : (
        <section
          ref={tableScroll.setContainerRef}
          className="max-h-[560px] overflow-auto overscroll-contain border border-border"
          aria-label="Bank statements"
        >
          <DndContext
            id="finance-bank-statements-table-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table
              className="block text-sm"
              style={{ width: table.getTotalSize(), minWidth: "100%" }}
            >
              <FinanceBankStatementTableHeader
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
                          financeSheet: "bank-statement",
                          statementId: selectedRow.original.id,
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
          {isFetchingNextPage ? "Loading…" : "Load more statements"}
        </Button>
      ) : null}
      <SelectionBar table={table} />
    </div>
  )
}
