"use client"

import {
  PRESCRIPTION_SOURCES,
  PRESCRIPTION_STATUSES,
  usePrescriptionFilterParams,
} from "@/hooks/use-prescription-filter-params"
import { Button } from "@ewatrade/ui"
import { Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useState } from "react"

function label(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function PrescriptionSearchFilter() {
  const { filter, hasFilters, setFilter } = usePrescriptionFilterParams()
  const [query, setQuery] = useState(filter.q ?? "")

  useEffect(() => setQuery(filter.q ?? ""), [filter.q])

  return (
    <div className="flex w-full flex-col gap-2 lg:flex-row lg:items-center">
      <form
        className="relative w-full max-w-md"
        onSubmit={(event) => {
          event.preventDefault()
          setFilter({ q: query.trim() || null })
        }}
      >
        <HugeiconsIcon
          icon={Search01Icon}
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          aria-label="Search prescription requests"
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search request reference"
        />
      </form>
      <select
        aria-label="Filter by status"
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
        value={filter.statuses?.[0] ?? ""}
        onChange={(event) =>
          setFilter({
            statuses: event.target.value
              ? [event.target.value as (typeof PRESCRIPTION_STATUSES)[number]]
              : null,
          })
        }
      >
        <option value="">All statuses</option>
        {PRESCRIPTION_STATUSES.map((status) => (
          <option key={status} value={status}>
            {label(status)}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by source"
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
        value={filter.sources?.[0] ?? ""}
        onChange={(event) =>
          setFilter({
            sources: event.target.value
              ? [event.target.value as (typeof PRESCRIPTION_SOURCES)[number]]
              : null,
          })
        }
      >
        <option value="">All channels</option>
        {PRESCRIPTION_SOURCES.map((source) => (
          <option key={source} value={source}>
            {label(source)}
          </option>
        ))}
      </select>
      {hasFilters ? (
        <Button type="button" variant="ghost" onClick={() => setFilter(null)}>
          Clear
        </Button>
      ) : null}
    </div>
  )
}
