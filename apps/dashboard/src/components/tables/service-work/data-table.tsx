"use client"

import { DashboardTable } from "@/components/dashboard/dashboard-table"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"
import { useSuspenseQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { createServiceWorkColumns } from "./columns"
import { ServiceWorkEmptyState } from "./empty-states"

export function ServiceWorkDataTable({
  storeId,
  timeZone,
}: { storeId: string; timeZone: string }) {
  const trpc = useTRPC()
  const { query, setParams } = useServiceWorkParams()
  const { data } = useSuspenseQuery(
    trpc.services.queue.queryOptions({ limit: 200, storeId }, { retry: false }),
  )
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return data
    return data.filter((job) =>
      [
        job.orderNumber,
        job.summary,
        ...job.lines.flatMap((line) => [
          line.catalogItemName,
          line.variantName,
          line.offeringName,
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    )
  }, [data, query])
  const columns = useMemo(
    () =>
      createServiceWorkColumns(
        (jobId) => setParams({ jobId, serviceSheet: "job" }),
        timeZone,
      ),
    [setParams, timeZone],
  )

  return (
    <DashboardTable
      rows={rows}
      columns={columns}
      getRowKey={(job) => job.id}
      emptyState={<ServiceWorkEmptyState filtered={Boolean(query.trim())} />}
    />
  )
}
