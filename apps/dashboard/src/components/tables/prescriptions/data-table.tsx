"use client"

import { useLoadedRowSelection } from "@/components/tables/core"
import {
  type PRESCRIPTION_SORT_FIELDS,
  usePrescriptionFilterParams,
} from "@/hooks/use-prescription-filter-params"
import {
  prescriptionSheetModeForStatus,
  usePrescriptionParams,
} from "@/hooks/use-prescription-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import type { TableSettings } from "@/utils/table-settings"
import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { useCallback, useMemo } from "react"
import { type PrescriptionQueueRow, createPrescriptionColumns } from "./columns"
import { PrescriptionEmptyState, PrescriptionNoResults } from "./empty-states"
import { PrescriptionTableView } from "./table-view"

const FIXED_COLUMN_IDS = ["select", "reference"]
const getRequestId = (request: PrescriptionQueueRow) => request.id

export function PrescriptionDataTable({
  storeId,
  timeZone,
  initialSettings,
  view,
}: {
  storeId: string
  timeZone: string
  initialSettings?: Partial<TableSettings>
  view: DirectoryView
}) {
  const trpc = useTRPC()
  const { filter, setFilter } = usePrescriptionFilterParams()
  const { setParams } = usePrescriptionParams()
  const query = useSuspenseInfiniteQuery(
    trpc.prescriptions.queue.infiniteQueryOptions(
      {
        assignees: filter.assignees,
        from: filter.from,
        pageSize: 25,
        q: filter.q,
        sort: filter.sort,
        sources: filter.sources,
        statuses: filter.statuses,
        storeId,
        to: filter.to,
      },
      {
        getNextPageParam: (lastPage) => lastPage.meta.cursor ?? undefined,
        retry: false,
      },
    ),
  )
  const rows = useMemo(
    () => query.data.pages.flatMap((page) => page.data),
    [query.data.pages],
  )
  const [rowSelection, setRowSelection] = useLoadedRowSelection({
    rows,
    getRowId: getRequestId,
    scope: JSON.stringify([storeId, { ...filter, sort: undefined }]),
  })
  const openRequest = useCallback(
    (id: string, status: (typeof rows)[number]["status"]) => {
      void setParams({
        prescriptionId: id,
        prescriptionSheet: prescriptionSheetModeForStatus(status),
      })
    },
    [setParams],
  )
  const columns = useMemo(
    () => createPrescriptionColumns(timeZone, openRequest),
    [openRequest, timeZone],
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
    tableId: "prescriptions",
    initialSettings,
    columnIds,
    fixedColumnIds: FIXED_COLUMN_IDS,
  })
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getRequestId,
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
  const toggleSort = useCallback(
    (field: (typeof PRESCRIPTION_SORT_FIELDS)[number]) => {
      const direction =
        filter.sort?.[0] === field && filter.sort[1] === "asc" ? "desc" : "asc"
      void setFilter({ ...filter, sort: [field, direction] })
    },
    [filter, setFilter],
  )
  const hasFilters = Boolean(
    filter.assignees?.length ||
      filter.from ||
      filter.q ||
      filter.sources?.length ||
      filter.statuses?.length ||
      filter.to,
  )

  return (
    <PrescriptionTableView
      table={table}
      view={view}
      timeZone={timeZone}
      sort={filter.sort}
      toggleSort={toggleSort}
      onRowOpen={openRequest}
      isInitialError={query.isError && !query.data}
      isFetchNextPageError={query.isFetchNextPageError}
      isRefetchError={query.isRefetchError}
      errorMessage={query.error?.message ?? ""}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      fetchNextPage={() => query.fetchNextPage()}
      refetch={() => query.refetch()}
      emptyState={
        hasFilters ? <PrescriptionNoResults /> : <PrescriptionEmptyState />
      }
      persistenceError={tableSettings.persistenceError}
      retryPersistence={tableSettings.retryPersistence}
    />
  )
}
