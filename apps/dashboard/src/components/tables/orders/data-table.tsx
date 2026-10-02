"use client"

import { orderSortFields } from "@/hooks/sort-params"
import { getOrderListPageInput } from "@/hooks/use-order-filter-params"
import { useOrderParams } from "@/hooks/use-order-params"
import { useSortParams } from "@/hooks/use-sort-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { useTRPC } from "@/trpc/client"
import type { TableSettings } from "@/utils/table-settings"
import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { useMemo } from "react"
import { orderColumns } from "./columns"
import { OrdersEmptyState } from "./empty-states"
import { OrdersTableView } from "./table-view"

const FIXED_COLUMN_IDS = ["orderNumber"]

export function OrdersDataTable({
  storeId,
  initialSettings,
}: {
  storeId: string
  initialSettings?: Partial<TableSettings>
}) {
  const trpc = useTRPC()
  const { filter, hasFilters } = useOrderParams()
  const { sort, toggleSort } = useSortParams({ fields: orderSortFields })
  const query = useSuspenseInfiniteQuery(
    trpc.orders.listPage.infiniteQueryOptions(
      { ...getOrderListPageInput(filter), sort, storeId },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  const rows = useMemo(
    () => query.data.pages.flatMap((page) => page.items),
    [query.data.pages],
  )
  const columns = useMemo(() => orderColumns(), [])
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
    tableId: "orders",
    initialSettings,
    columnIds,
    fixedColumnIds: FIXED_COLUMN_IDS,
  })
  const table = useReactTable({
    data: rows,
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
    <OrdersTableView
      table={table}
      sort={sort}
      toggleSort={toggleSort}
      filtered={hasFilters}
      errorMessage={query.error?.message ?? ""}
      isInitialError={query.isError && !query.data}
      isFetchNextPageError={query.isFetchNextPageError}
      isRefetchError={query.isRefetchError}
      isFetchingNextPage={query.isFetchingNextPage}
      hasNextPage={query.hasNextPage}
      fetchNextPage={() => query.fetchNextPage()}
      refetch={() => query.refetch()}
      persistenceError={tableSettings.persistenceError}
      retryPersistence={tableSettings.retryPersistence}
    />
  )
}
