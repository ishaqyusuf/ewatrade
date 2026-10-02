"use client"
import { serviceWorkSortFields } from "@/hooks/sort-params"
import { getServiceWorkQueuePageInput } from "@/hooks/use-service-work-filter-params"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useSortParams } from "@/hooks/use-sort-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { useTRPC } from "@/trpc/client"
import { type TableSettings, getColumnIds } from "@/utils/table-settings"
import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import {
  type RowSelectionState,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useEffect, useMemo, useRef, useState } from "react"
import { createServiceWorkColumns } from "./columns"
import { ServiceWorkTableView } from "./table-view"
import { useServiceWorkBatch } from "./use-batch-actions"
const FIXED = ["order"]
export function ServiceWorkDataTable({
  canManage,
  storeId,
  timeZone,
  initialSettings,
}: {
  canManage: boolean
  storeId: string
  timeZone: string
  initialSettings?: Partial<TableSettings>
}) {
  const trpc = useTRPC()
  const { filter, hasFilters, setParams } = useServiceWorkParams()
  const { sort } = useSortParams({ fields: serviceWorkSortFields })
  const query = useSuspenseInfiniteQuery(
    trpc.services.queuePage.infiniteQueryOptions(
      { ...getServiceWorkQueuePageInput(filter), storeId, sort },
      {
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        retry: false,
      },
    ),
  )
  const data = useMemo(
    () => query.data.pages.flatMap((page) => page.items),
    [query.data],
  )
  const columns = useMemo(
    () =>
      createServiceWorkColumns(
        (id) => void setParams({ jobId: id, serviceSheet: "job" }),
        timeZone,
        canManage,
      ),
    [setParams, timeZone, canManage],
  )
  const columnIds = useMemo(() => getColumnIds(columns), [columns])
  const settings = useTableSettings({
    tableId: "service-work",
    columnIds,
    fixedColumnIds: FIXED,
    initialSettings,
  })
  const [selection, setSelection] = useState<RowSelectionState>({})
  const scope = JSON.stringify([storeId, canManage, filter, sort])
  const lastScope = useRef(scope)
  useEffect(() => {
    if (lastScope.current === scope) return
    lastScope.current = scope
    setSelection({})
  }, [scope])
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    enableRowSelection: canManage,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    state: {
      rowSelection: selection,
      columnVisibility: settings.columnVisibility,
      columnSizing: settings.columnSizing,
      columnOrder: settings.columnOrder,
    },
    onRowSelectionChange: setSelection,
    onColumnVisibilityChange: settings.setColumnVisibility,
    onColumnSizingChange: settings.setColumnSizing,
    onColumnOrderChange: settings.setColumnOrder,
  })
  const selectedJobs = table
    .getSelectedRowModel()
    .rows.map((row) => row.original)
  const batch = useServiceWorkBatch(selectedJobs, () =>
    table.resetRowSelection(),
  )
  return (
    <ServiceWorkTableView
      table={table}
      filtered={hasFilters}
      sort={sort}
      batch={batch}
      canManage={canManage}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      isFetchNextPageError={query.isFetchNextPageError}
      isRefetchError={query.isRefetchError}
      errorMessage={query.error?.message ?? ""}
      fetchNextPage={() => query.fetchNextPage()}
      refetch={() => query.refetch()}
      persistenceError={settings.persistenceError}
      retryPersistence={settings.retryPersistence}
    />
  )
}
