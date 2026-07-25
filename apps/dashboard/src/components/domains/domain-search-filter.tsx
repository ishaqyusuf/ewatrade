"use client"

import { useDomainFilterParams } from "@/hooks/use-domain-filter-params"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function DomainSearchFilter() {
  const { query, setFilters, statuses } = useDomainFilterParams()
  const selectedStatus = statuses[0] ?? ""

  return (
    <div className="flex max-w-2xl flex-col gap-2 sm:flex-row">
      <label className="relative flex-1">
        <span className="sr-only">Search domains</span>
        <HugeiconsIcon
          icon={Search01Icon}
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Search your domains"
          value={query}
          onChange={(event) =>
            setFilters({ domainQuery: event.target.value || null })
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setFilters({ domainQuery: null })
            }
          }}
        />
      </label>
      <label>
        <span className="sr-only">Filter by connection status</span>
        <select
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          value={selectedStatus}
          onChange={(event) =>
            setFilters({
              domainStatuses: event.target.value ? [event.target.value] : null,
            })
          }
        >
          <option value="">All connections</option>
          <option value="ACTIVE">Active</option>
          <option value="OWNERSHIP_PENDING">Ownership pending</option>
          <option value="DNS_CONFIGURING">Configuring DNS</option>
          <option value="VERIFYING">Verifying</option>
          <option value="FAILED">Needs attention</option>
        </select>
      </label>
    </div>
  )
}
