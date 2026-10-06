"use client"

import { SearchFilter } from "@/components/search-filter"
import {
  type DomainConnectionStatus,
  useDomainFilterParams,
} from "@/hooks/use-domain-filter-params"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@ewatrade/ui"

const statuses = [
  ["ACTIVE", "Active"],
  ["OWNERSHIP_PENDING", "Ownership pending"],
  ["DNS_CONFIGURING", "Configuring DNS"],
  ["VERIFYING", "Verifying"],
  ["FAILED", "Needs attention"],
  ["DISCONNECTED", "Disconnected"],
] as const

export function DomainSearchFilter() {
  const {
    query,
    setFilters,
    statuses: selectedStatuses,
  } = useDomainFilterParams()
  const statusLabels = new Map(statuses)
  const toggleStatus = (status: DomainConnectionStatus, checked: boolean) => {
    const next = checked
      ? [...new Set([...selectedStatuses, status])]
      : selectedStatuses.filter((value) => value !== status)
    setFilters({ domainStatuses: next })
  }
  return (
    <SearchFilter
      mobileFilters={{
        groups: [
          {
            id: "status",
            label: "Connection status",
            multiple: true,
            allLabel: "All statuses",
            options: statuses.map(([value, label]) => ({ value, label })),
          },
        ],
        values: { status: selectedStatuses },
        onApply: (draft) =>
          setFilters({
            domainStatuses: statuses
              .filter(([value]) => draft.status?.includes(value))
              .map(([value]) => value),
          }),
      }}
      placeholder="Search domains..."
      value={query}
      onSearch={(value) => setFilters({ domainQuery: value || null })}
      onClear={() => setFilters({ domainQuery: null, domainStatuses: null })}
      filters={[
        ...selectedStatuses.map((status) => ({
          id: `status-${status}`,
          label: statusLabels.get(status) ?? status,
          onRemove: () => toggleStatus(status, false),
        })),
      ]}
    >
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Connection status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-48 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
            sideOffset={14}
            alignOffset={-4}
          >
            {statuses.map(([value, label]) => (
              <DropdownMenuCheckboxItem
                key={value}
                checked={selectedStatuses.includes(value)}
                closeOnClick={false}
                onCheckedChange={(checked) => toggleStatus(value, checked)}
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
    </SearchFilter>
  )
}
