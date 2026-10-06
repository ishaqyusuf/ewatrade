"use client"

import type { FinanceBillRow, FinanceBook } from "@/components/finance/types"
import {
  BottomBar,
  DirectoryCollection,
  DirectoryRecord,
  DirectoryToolbar,
  VirtualRow,
} from "@/components/tables/core"
import type { expenseSortFields } from "@/hooks/sort-params"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll"
import { useStickyColumns } from "@/hooks/use-sticky-columns"
import { useTableDnd } from "@/hooks/use-table-dnd"
import { useTableScroll } from "@/hooks/use-table-scroll"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { DndContext, closestCenter } from "@dnd-kit/core"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button, Table, TableBody } from "@ewatrade/ui"
import { Badge } from "@ewatrade/ui"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"
import type { Table as ReactTable } from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { AnimatePresence } from "framer-motion"
import { ExpenseBottomBar } from "./bottom-bar"
import { expenseStatusLabels, formatExpenseDate } from "./columns"
import { ExpenseEmptyState } from "./empty-states"
import { ExpenseTableSkeleton } from "./skeleton"
import { ExpenseTableHeader, ExpenseTableSettings } from "./table-header"

const ROW_HEIGHT = 57
const STICKY_COLUMNS = [
  { id: "select", width: 50 },
  { id: "description", width: 260 },
  { id: "actions", side: "right" as const, width: 80 },
]
const FIXED_COLUMN_IDS = ["select", "description"]
const NON_CLICKABLE_COLUMNS = new Set(["select", "actions"])
type ExpenseSort = {
  field: (typeof expenseSortFields)[number]
  direction: "asc" | "desc"
}
type FinanceBillsPage = RouterOutputs["finance"]["bills"]

export function ExpenseTableView({
  book,
  table,
  view,
  sort,
  summary,
  filtered,
  isPending,
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
  book: FinanceBook
  table: ReactTable<FinanceBillRow>
  view: DirectoryView
  sort?: ExpenseSort
  summary?: FinanceBillsPage
  filtered: boolean
  isPending: boolean
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
  const { sensors, handleDragEnd, sortableColumnIds } = useTableDnd(table, {
    fixedColumnIds: FIXED_COLUMN_IDS,
  })
  const { getStickyStyle, getStickyClassName, isVisible } = useStickyColumns({
    table,
    stickyColumns: STICKY_COLUMNS,
  })
  const tableScroll = useTableScroll({
    useColumnWidths: true,
    startFromColumn: 2,
  })
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
  const { setParams } = useFinanceParams()
  const selectedRows = table
    .getSelectedRowModel()
    .rows.map((row) => row.original)
  const currency = book.currencyCode
  if (isPending)
    return (
      <ExpenseTableSkeleton
        view={view}
        settings={{
          columns: table.getState().columnVisibility,
          sizing: table.getState().columnSizing,
          order: table.getState().columnOrder,
        }}
      />
    )
  if (!summary && isInitialError) {
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
  if (!summary)
    return (
      <ExpenseTableSkeleton
        view={view}
        settings={{
          columns: table.getState().columnVisibility,
          sizing: table.getState().columnSizing,
          order: table.getState().columnOrder,
        }}
      />
    )

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 border-y border-border py-5 sm:grid-cols-3">
        {(
          [
            ["Expenses incurred", summary.summary.incurredMinor],
            ["Paid against these bills", summary.summary.paidAgainstBillsMinor],
            ["Outstanding", summary.summary.outstandingMinor],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums">
              {formatFinanceMoney(value, currency)}
            </p>
          </div>
        ))}
      </div>

      {isFetchNextPageError || isRefetchError ? (
        <div className="flex items-center justify-between gap-3" role="alert">
          <p className="text-sm text-destructive">
            {errorMessage || "Expenses could not be refreshed."}
          </p>
          <Button
            appearance="form"
            variant="outline"
            onClick={() =>
              isFetchNextPageError ? retryNextPage() : void refetch()
            }
          >
            {isFetchNextPageError ? "Retry loading expenses" : "Try again"}
          </Button>
        </div>
      ) : null}

      <DirectoryToolbar
        table={table}
        view={view}
        selectAllLabel="Select all loaded expenses"
        summary={`${summary.count} expenses · ${sortCaption(sort)}`}
      >
        {view === "table" ? <ExpenseTableSettings table={table} /> : null}
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
        <ExpenseEmptyState filtered={filtered} />
      ) : view !== "table" ? (
        <DirectoryCollection view={view} label="Expense">
          {rows.map((row) => {
            const bill = row.original
            const open = () =>
              void setParams({ financeSheet: "bill", billId: bill.id })
            return (
              <DirectoryRecord
                key={row.id}
                row={row}
                view={view}
                selectLabel={`Select ${bill.description}`}
                title={bill.description}
                onOpen={open}
                description={`${bill.payeeName} · ${formatExpenseDate(
                  bill.incurredAt,
                  book.timezone,
                )}`}
                badges={
                  <Badge variant="outline">
                    {expenseStatusLabels[bill.status]}
                  </Badge>
                }
                highlight={{
                  label: "Outstanding",
                  value: formatFinanceMoney(bill.outstandingMinor, currency),
                }}
                details={[
                  {
                    label: "Total",
                    value: formatFinanceMoney(bill.totalMinor, currency),
                  },
                  {
                    label: "Paid",
                    value: formatFinanceMoney(bill.paidMinor, currency),
                  },
                ]}
                actions={
                  <Button
                    aria-label={`View expense ${bill.description}`}
                    className="rounded-none"
                    size="sm"
                    variant="ghost"
                    onClick={open}
                  >
                    View
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
          aria-label="Expense records"
        >
          <DndContext
            id="expenses-table-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table
              className="block text-sm"
              style={{ width: table.getTotalSize(), minWidth: "100%" }}
            >
              <ExpenseTableHeader
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
          className="w-fit"
          variant="outline"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? "Loading…" : "Load more expenses"}
        </Button>
      ) : null}
      <AnimatePresence>
        {selectedRows.length ? (
          <BottomBar
            selectedCount={selectedRows.length}
            onDeselect={() => table.resetRowSelection()}
          >
            <ExpenseBottomBar rows={selectedRows} currency={currency} />
          </BottomBar>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function sortCaption(sort?: ExpenseSort) {
  if (!sort) return "newest expense date first"
  const labels: Record<(typeof expenseSortFields)[number], string> = {
    incurredAt: "expense date",
    description: "description",
    payeeName: "payee",
    totalMinor: "total amount",
    paidMinor: "amount paid",
  }
  return `sorted by ${labels[sort.field]} ${sort.direction === "asc" ? "ascending" : "descending"}`
}
