"use client"

import { DashboardTable } from "@/components/dashboard/dashboard-table"
import { usePrescriptionFilterParams } from "@/hooks/use-prescription-filter-params"
import { usePrescriptionParams } from "@/hooks/use-prescription-params"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useSuspenseInfiniteQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import { createPrescriptionColumns } from "./columns"
import { PrescriptionEmptyState, PrescriptionNoResults } from "./empty-states"

export function PrescriptionDataTable({
  storeId,
  timeZone,
}: {
  storeId: string
  timeZone: string
}) {
  const trpc = useTRPC()
  const { filter, hasFilters } = usePrescriptionFilterParams()
  const { setParams } = usePrescriptionParams()
  const query = useSuspenseInfiniteQuery(
    trpc.prescriptions.queue.infiniteQueryOptions(
      {
        pageSize: 25,
        q: filter.q,
        sort: filter.sort,
        sources: filter.sources,
        statuses: filter.statuses,
        storeId,
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
  const columns = useMemo(() => createPrescriptionColumns(timeZone), [timeZone])

  return (
    <div className="grid gap-3">
      <DashboardTable
        rows={rows}
        columns={columns}
        getRowKey={(request) => request.id}
        emptyState={
          hasFilters ? <PrescriptionNoResults /> : <PrescriptionEmptyState />
        }
        onRowClick={(request) =>
          setParams({
            prescriptionId: request.id,
            prescriptionSheet: "details",
          })
        }
      />
      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
