"use client"

import type { FinanceBook } from "@/components/finance/types"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { useTRPC } from "@/trpc/client"
import type { TableSettings } from "@/utils/table-settings"
import { useInfiniteQuery } from "@tanstack/react-query"
import { getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { useDeferredValue, useMemo } from "react"
import { financeSupplierColumns } from "./columns"
import { FinanceSupplierTableView } from "./table-view"

const FIXED_COLUMN_IDS = ["code"]

export function FinanceSupplierDataTable({
  book,
  initialSettings,
}: {
  book: FinanceBook
  initialSettings?: Partial<TableSettings>
}) {
  const trpc = useTRPC()
  const { supplierQuery, setParams } = useFinanceParams()
  const deferredSearch = useDeferredValue(supplierQuery)
  const query = useInfiniteQuery(
    trpc.finance.suppliers.infiniteQueryOptions(
      {
        bookId: book.id,
        query: deferredSearch.trim() || undefined,
        limit: 30,
      },
      {
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  const data = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? [],
    [query.data],
  )
  const columns = useMemo(
    () =>
      financeSupplierColumns(
        (id) =>
          void setParams({
            financeSheet: "supplier-statement",
            supplierId: id,
          }),
      ),
    [setParams],
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
    tableId: "finance-suppliers",
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
    <FinanceSupplierTableView
      table={table}
      filtered={Boolean(supplierQuery.trim())}
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
