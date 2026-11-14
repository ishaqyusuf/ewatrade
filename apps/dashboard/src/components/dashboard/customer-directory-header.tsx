"use client"

import {
  type CustomerFilter,
  customerFilters,
} from "@/components/customers/customer-list"
import { FilterPills } from "@/components/inventory/filter-pills"
import { PageFab } from "@/components/page-fab/page-fab"
import { SearchField } from "@/components/search-field"
import { Button } from "@ewatrade/ui"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

/** Search, the balance filter (owners and admins) and Add customer. */
export function CustomerDirectoryHeader({
  query,
  canSeeBalances,
  onSearch,
  filter,
  onFilterChange,
  onAddCustomer,
}: {
  query: string
  canSeeBalances: boolean
  onSearch: (value: string) => void
  filter: CustomerFilter
  onFilterChange: (filter: CustomerFilter) => void
  onAddCustomer: () => void
}) {
  return (
    <div className="grid gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <SearchField
          className="min-w-0 flex-1 sm:max-w-[420px]"
          placeholder="Search name or phone"
          value={query}
          onSearch={onSearch}
        />
        <Button onClick={onAddCustomer} className="ml-auto max-sm:hidden">
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          Add customer
        </Button>
        <PageFab label="Add customer" onClick={onAddCustomer} />
      </div>
      {canSeeBalances ? (
        <FilterPills
          label="Show"
          options={customerFilters}
          value={filter}
          onChange={onFilterChange}
        />
      ) : null}
    </div>
  )
}
