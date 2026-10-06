"use client"

import type { FinanceBillRow, FinanceBook } from "@/components/finance/types"
import { useLoadedRowSelection } from "@/components/tables/core"
import { expenseSortFields } from "@/hooks/sort-params"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useSortParams } from "@/hooks/use-sort-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { useInfiniteQuery } from "@tanstack/react-query"
import { getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { useMemo } from "react"
import { expenseColumns } from "./columns"
import { ExpenseTableView } from "./table-view"

const FIXED_COLUMN_IDS = ["select", "description"]
const getBillId = (bill: FinanceBillRow) => bill.id

export function ExpenseDataTable({
  book,
  initialSettings,
  view,
}: {
  book: FinanceBook
  initialSettings?: Partial<TableSettings>
  view: DirectoryView
}) {
  const trpc = useTRPC()
  const { expenseQuery, expenseStatus, setParams } = useFinanceParams()
  const { sort } = useSortParams({
    fields: expenseSortFields,
  })
  const query = useInfiniteQuery(
    trpc.finance.bills.infiniteQueryOptions(
      {
        bookId: book.id,
        query: expenseQuery || undefined,
        status: expenseStatus ?? undefined,
        sort,
        limit: 30,
      },
      {
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  const data = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  )
  const columns = useMemo(
    () =>
      expenseColumns(
        book.currencyCode,
        book.timezone,
        (id) => void setParams({ financeSheet: "bill", billId: id }),
      ),
    [book.currencyCode, book.timezone, setParams],
  )
  const columnIds = useMemo(
    () =>
      columns.map(
        (column) =>
          column.id ??
          ("accessorKey" in column ? String(column.accessorKey) : ""),
      ),
    [columns],
  )
  // Sorting keeps loaded selections; query, status and Book changes clear them.
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows: data,
    getRowId: getBillId,
    scope: JSON.stringify([book.id, expenseQuery, expenseStatus ?? ""]),
  })
  const tableSettings = useTableSettings({
    tableId: "expenses",
    initialSettings,
    columnIds,
    fixedColumnIds: FIXED_COLUMN_IDS,
  })

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getBillId,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      rowSelection,
      columnVisibility: tableSettings.columnVisibility,
      columnSizing: tableSettings.columnSizing,
      columnOrder: tableSettings.columnOrder,
    },
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: tableSettings.setColumnVisibility,
    onColumnSizingChange: tableSettings.setColumnSizing,
    onColumnOrderChange: tableSettings.setColumnOrder,
  })

  return (
    <ExpenseTableView
      book={book}
      table={table}
      view={view}
      sort={sort}
      summary={query.data?.pages[0]}
      filtered={Boolean(expenseQuery || expenseStatus)}
      isPending={query.isPending}
      isInitialError={query.isError && !query.data}
      isFetchNextPageError={query.isFetchNextPageError}
      isRefetchError={query.isRefetchError}
      errorMessage={query.error?.message ?? ""}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      fetchNextPage={() => query.fetchNextPage()}
      refetch={() => query.refetch()}
      persistenceError={tableSettings.persistenceError}
      retryPersistence={tableSettings.retryPersistence}
    />
  )
}
