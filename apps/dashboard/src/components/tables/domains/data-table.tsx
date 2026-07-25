"use client"

import { DashboardTable } from "@/components/dashboard/dashboard-table"
import { useDomainFilterParams } from "@/hooks/use-domain-filter-params"
import { useDomainParams } from "@/hooks/use-domain-params"
import { useTRPC } from "@/trpc/client"
import { useSuspenseQuery } from "@tanstack/react-query"
import { useMemo } from "react"
import { domainColumns } from "./columns"
import { DomainsEmptyState } from "./empty-states"

export function DomainDataTable() {
  const trpc = useTRPC()
  const { query, statuses } = useDomainFilterParams()
  const { setParams } = useDomainParams()
  const { data } = useSuspenseQuery(trpc.domains.list.queryOptions({}))
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return data.filter((domain) => {
      const matchesStatus =
        statuses.length === 0 || statuses.includes(domain.status)
      const matchesQuery =
        !normalized ||
        [domain.hostname, domain.provider, domain.status, domain.store.name]
          .join(" ")
          .toLowerCase()
          .includes(normalized)
      return matchesStatus && matchesQuery
    })
  }, [data, query, statuses])

  return (
    <DashboardTable
      columns={domainColumns((domain) =>
        setParams({ domainId: domain.id, domainMode: "details" }),
      )}
      emptyState={
        <DomainsEmptyState filtered={Boolean(query || statuses.length)} />
      }
      getRowKey={(domain) => domain.id}
      onRowClick={(domain) =>
        setParams({ domainId: domain.id, domainMode: "details" })
      }
      rows={rows}
    />
  )
}
