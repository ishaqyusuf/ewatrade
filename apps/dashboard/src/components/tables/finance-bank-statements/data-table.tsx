"use client"

import type { FinanceBook } from "@/components/finance/types"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { useTRPC } from "@/trpc/client"
import type { TableSettings } from "@/utils/table-settings"
import { useInfiniteQuery } from "@tanstack/react-query"
import { getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { useMemo } from "react"
import { financeBankStatementColumns } from "./columns"
import { FinanceBankStatementTableView } from "./table-view"

const FIXED_COLUMN_IDS = ["reference"]

export function FinanceBankStatementDataTable({
  book,
  initialSettings,
}: {
  book: FinanceBook
  initialSettings?: Partial<TableSettings>
}) {
  const trpc = useTRPC()
  const { bankAccountId, setParams } = useFinanceParams()
  const query = useInfiniteQuery(
    trpc.finance.bankStatements.list.infiniteQueryOptions(
      {
        bookId: book.id,
        accountId: bankAccountId || undefined,
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
      financeBankStatementColumns(
        book,
        (id) =>
          void setParams({
            financeSheet: "bank-statement",
            statementId: id,
          }),
      ),
    [book, setParams],
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
  const tableSettings = useTableSettings({
    tableId: "finance-bank-statements",
    initialSettings,
    columnIds,
    fixedColumnIds: FIXED_COLUMN_IDS,
  })
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      columnVisibility: tableSettings.columnVisibility,
      columnSizing: tableSettings.columnSizing,
      columnOrder: tableSettings.columnOrder,
    },
    onColumnVisibilityChange: tableSettings.setColumnVisibility,
    onColumnSizingChange: tableSettings.setColumnSizing,
    onColumnOrderChange: tableSettings.setColumnOrder,
  })

  return (
    <FinanceBankStatementTableView
      table={table}
      filtered={Boolean(bankAccountId.trim())}
      isPending={query.isPending}
      hasData={Boolean(query.data)}
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
