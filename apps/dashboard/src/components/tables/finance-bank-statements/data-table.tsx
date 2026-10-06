"use client"

import type {
  FinanceBankStatementRow,
  FinanceBook,
} from "@/components/finance/types"
import { useLoadedRowSelection } from "@/components/tables/core"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { useInfiniteQuery } from "@tanstack/react-query"
import { getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { useMemo } from "react"
import { financeBankStatementColumns } from "./columns"
import { FinanceBankStatementTableView } from "./table-view"

const FIXED_COLUMN_IDS = ["select", "reference"]
const getStatementId = (statement: FinanceBankStatementRow) => statement.id

export function FinanceBankStatementDataTable({
  book,
  initialSettings,
  view,
}: {
  book: FinanceBook
  initialSettings?: Partial<TableSettings>
  view: DirectoryView
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
  // Selection holds original import identities; it does not authorize matching.
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows: data,
    getRowId: getStatementId,
    scope: JSON.stringify([book.id, bankAccountId]),
  })
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
    getRowId: getStatementId,
    onRowSelectionChange: setRowSelection,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      columnVisibility: tableSettings.columnVisibility,
      columnSizing: tableSettings.columnSizing,
      columnOrder: tableSettings.columnOrder,
      rowSelection,
    },
    onColumnVisibilityChange: tableSettings.setColumnVisibility,
    onColumnSizingChange: tableSettings.setColumnSizing,
    onColumnOrderChange: tableSettings.setColumnOrder,
  })

  return (
    <FinanceBankStatementTableView
      table={table}
      book={book}
      view={view}
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
