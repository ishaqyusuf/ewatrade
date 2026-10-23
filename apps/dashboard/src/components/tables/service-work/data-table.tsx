"use client"
import type { WorkJob } from "@/components/service-work/service-utils"
import { useJobQuickStep } from "@/components/service-work/use-job-quick-step"
import { useLoadedRowSelection } from "@/components/tables/core"
import { serviceWorkSortFields } from "@/hooks/sort-params"
import { getServiceWorkQueuePageInput } from "@/hooks/use-service-work-filter-params"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useSortParams } from "@/hooks/use-sort-params"
import { useTableSettings } from "@/hooks/use-table-settings"
import { useTRPC } from "@/trpc/client"
import type { DirectoryView } from "@/utils/directory-view-settings"
import { type TableSettings, getColumnIds } from "@/utils/table-settings"
import { useQuery, useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { useMemo } from "react"
import {
  type ServiceWorkColumnActions,
  createServiceWorkColumns,
} from "./columns"
import { ServiceWorkTableView } from "./table-view"
import { useServiceWorkBatch } from "./use-batch-actions"
const FIXED = ["select", "order"]
const getJobId = (job: WorkJob) => job.id
export function ServiceWorkDataTable({
  canManage,
  storeId,
  timeZone,
  initialSettings,
  view,
}: {
  canManage: boolean
  storeId: string
  timeZone: string
  initialSettings?: Partial<TableSettings>
  view: DirectoryView
}) {
  const trpc = useTRPC()
  const { filter, hasFilters, setParams } = useServiceWorkParams()
  const { sort } = useSortParams({ fields: serviceWorkSortFields })
  const query = useSuspenseInfiniteQuery(
    trpc.services.queuePage.infiniteQueryOptions(
      {
        ...getServiceWorkQueuePageInput(filter),
        storeId,
        sort: sort ?? { field: "createdAt", direction: "desc" },
      },
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
  const assignees = useQuery(
    trpc.services.assignees.queryOptions(undefined, {
      enabled: canManage,
      retry: false,
    }),
  )
  const quick = useJobQuickStep()
  const assigneeNames = useMemo(
    () =>
      new Map((assignees.data ?? []).map((person) => [person.id, person.name])),
    [assignees.data],
  )
  const actions = useMemo<ServiceWorkColumnActions>(
    () => ({
      assigneeName: (userId) =>
        userId ? (assigneeNames.get(userId) ?? null) : null,
      canManage,
      isPending: quick.isPending,
      openJob: (id) =>
        void setParams({ jobId: id, jobStep: null, serviceSheet: "job" }),
      openStep: (id, step) =>
        void setParams({ jobId: id, jobStep: step, serviceSheet: "job" }),
      quickStep: (job, step) => void quick.run(job, step),
      timeZone,
    }),
    [assigneeNames, canManage, quick, setParams, timeZone],
  )
  const columns = useMemo(() => createServiceWorkColumns(actions), [actions])
  const columnIds = useMemo(() => getColumnIds(columns), [columns])
  const settings = useTableSettings({
    tableId: "service-work",
    columnIds,
    fixedColumnIds: FIXED,
    initialSettings,
  })
  // Selection is general; batch status and message actions stay manager-only.
  const [selection, setSelection] = useLoadedRowSelection({
    rows: data,
    getRowId: getJobId,
    scope: JSON.stringify([storeId, filter]),
  })
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: getJobId,
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
      view={view}
      timeZone={timeZone}
      actions={actions}
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
