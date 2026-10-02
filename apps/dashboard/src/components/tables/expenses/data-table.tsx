"use client"

import type { FinanceBook } from "@/components/finance/types"
import { expenseSortFields } from "@/hooks/sort-params"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useSortParams } from "@/hooks/use-sort-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { useTRPC } from "@/trpc/client"
import type { TableSettings } from "@/utils/table-settings"
import { useInfiniteQuery } from "@tanstack/react-query"
import {
  type RowSelectionState,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useEffect, useMemo, useRef, useState } from "react"
import { expenseColumns } from "./columns"
import { ExpenseTableView } from "./table-view"

const FIXED_COLUMN_IDS = ["description"]

export function ExpenseDataTable({
  book,
  initialSettings,
}: {
  book: FinanceBook
  initialSettings?: Partial<TableSettings>
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
  const selectionScope = [
    book.id,
    expenseQuery,
    expenseStatus ?? "",
    sort?.field ?? "",
    sort?.direction ?? "",
  ].join(":")
  const previousSelectionScope = useRef(selectionScope)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const tableSettings = useTableSettings({
    tableId: "expenses",
    initialSettings,
    columnIds,
    fixedColumnIds: FIXED_COLUMN_IDS,
  })

  useEffect(() => {
    if (previousSelectionScope.current === selectionScope) return
    previousSelectionScope.current = selectionScope
    setRowSelection({})
  }, [selectionScope])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: true,
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
