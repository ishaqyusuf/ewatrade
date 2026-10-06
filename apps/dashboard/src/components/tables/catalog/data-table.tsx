"use client"

import { useLoadedRowSelection } from "@/components/tables/core"
import { catalogSortFields } from "@/hooks/sort-params"
import { useCatalogDetailParams } from "@/hooks/use-catalog-detail-params"
import { getCatalogListPageInput } from "@/hooks/use-catalog-filter-params"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useSortParams } from "@/hooks/use-sort-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { type TableSettings, getColumnIds } from "@/utils/table-settings"
import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { useCallback, useMemo } from "react"
import { type CatalogRow, createCatalogColumns } from "./columns"
import { CatalogTableView } from "./table-view"

const FIXED_COLUMN_IDS = ["select", "item"]
const getCatalogItemId = (item: CatalogRow) => item.id

export function CatalogDataTable({
  initialSettings,
  storeId,
  view,
}: {
  storeId: string
  initialSettings?: Partial<TableSettings>
  view: DirectoryView
}) {
  const trpc = useTRPC()
  const { open } = useCatalogDetailParams()
  const { filter, hasFilters, setParams } = useCatalogItemParams()
  const { sort } = useSortParams({ fields: catalogSortFields })
  const query = useSuspenseInfiniteQuery(
    trpc.catalog.listItemsPage.infiniteQueryOptions(
      {
        ...getCatalogListPageInput(filter),
        sort,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  const rows = useMemo(
    () => query.data.pages.flatMap((page) => page.items),
    [query.data],
  )
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows,
    getRowId: getCatalogItemId,
    scope: JSON.stringify([storeId, filter.kind, filter.status, filter.query]),
  })
  const openUnits = useCallback(
    (productId: string) => void setParams({ productUnits: productId }),
    [setParams],
  )
  const columns = useMemo(
    () => createCatalogColumns(openUnits, storeId, open),
    [openUnits, storeId, open],
  )
  const columnIds = useMemo(() => getColumnIds(columns), [columns])
  const tableSettings = useTableSettings({
    tableId: "catalog",
    initialSettings,
    columnIds,
    fixedColumnIds: FIXED_COLUMN_IDS,
  })
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getCatalogItemId,
    manualSorting: true,
    onRowSelectionChange: setRowSelection,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      sorting: sort
        ? [{ id: sort.field, desc: sort.direction === "desc" }]
        : [],
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
    <CatalogTableView
      table={table}
      view={view}
      storeId={storeId}
      openUnits={openUnits}
      openDetail={open}
      hasFilters={hasFilters}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      isFetchNextPageError={query.isFetchNextPageError}
      isRefetchError={query.isRefetchError}
      errorMessage={query.error?.message ?? ""}
      persistenceError={tableSettings.persistenceError}
      retryPersistence={tableSettings.retryPersistence}
      refetch={() => query.refetch()}
      fetchNextPage={() => query.fetchNextPage()}
    />
  )
}
