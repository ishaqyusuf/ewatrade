"use client"

import type { FinanceBook } from "@/components/finance/types"
import { useLoadedRowSelection } from "@/components/tables/core"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { useInfiniteQuery, useQueries } from "@tanstack/react-query"
import { getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { useDeferredValue, useMemo } from "react"
import { type FinanceSupplierListRow, financeSupplierColumns } from "./columns"
import { FinanceSupplierTableView } from "./table-view"

const FIXED_COLUMN_IDS = ["select", "name"]
const getSupplierId = (supplier: FinanceSupplierListRow) => supplier.id

type SupplierBalance = {
  supplierId: string
  owedMinor: string
  paidAheadMinor: string
}
function combineSupplierBalances(
  results: Array<{ data?: { items: SupplierBalance[] } }>,
) {
  return new Map(
    results.flatMap((result) =>
      (result.data?.items ?? []).map(
        (item) => [item.supplierId, item] as const,
      ),
    ),
  )
}

export function FinanceSupplierDataTable({
  book,
  initialSettings,
  view,
}: {
  book: FinanceBook
  initialSettings?: Partial<TableSettings>
  view: DirectoryView
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
  // Balances load per page, apart from the supplier identities. `combine`
  // keeps one Map per change, so rows stay stable between renders.
  const balances = useQueries({
    queries: (query.data?.pages ?? []).map((page) =>
      trpc.finance.supplierBalances.queryOptions({
        bookId: book.id,
        supplierIds: page.data.map((supplier) => supplier.id),
      }),
    ),
    combine: combineSupplierBalances,
  })
  const data = useMemo<FinanceSupplierListRow[]>(
    () =>
      (query.data?.pages.flatMap((page) => page.data) ?? []).map(
        (supplier) => ({
          ...supplier,
          owedMinor: balances.get(supplier.id)?.owedMinor,
          paidAheadMinor: balances.get(supplier.id)?.paidAheadMinor,
        }),
      ),
    [query.data, balances],
  )
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows: data,
    getRowId: getSupplierId,
    scope: JSON.stringify([book.id, deferredSearch.trim()]),
  })
  const columns = useMemo(
    () =>
      financeSupplierColumns(
        (id) =>
          void setParams({
            financeSheet: "supplier-statement",
            supplierId: id,
          }),
        book.currencyCode,
      ),
    [setParams, book.currencyCode],
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
    getRowId: getSupplierId,
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
    <FinanceSupplierTableView
      table={table}
      currencyCode={book.currencyCode}
      view={view}
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
