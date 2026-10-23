"use client"

import { SearchFilter } from "@/components/search-filter"
import { DropdownMenuCheckboxItem } from "@ewatrade/ui"
import { useQueryStates } from "nuqs"
import { parseAsString } from "nuqs/server"
import { requestStatus } from "./service-utils"

const statuses = [
  "SUBMITTED",
  "NEEDS_INFORMATION",
  "QUOTED",
  "CONVERTED",
  "DECLINED",
]
export function useServiceRequestFilters() {
  return useQueryStates({
    requestQuery: parseAsString,
    requestStatus: parseAsString,
  })
}
export function ServiceRequestSearchFilter() {
  const [filter, setFilter] = useServiceRequestFilters()
  return (
    <SearchFilter
      placeholder="Search customer, request or service"
      value={filter.requestQuery ?? ""}
      onSearch={(value) => void setFilter({ requestQuery: value || null })}
      onClear={() =>
        void setFilter({ requestQuery: null, requestStatus: null })
      }
      filters={
        filter.requestStatus
          ? [
              {
                id: "status",
                label: requestStatus(filter.requestStatus).label,
                onRemove: () => void setFilter({ requestStatus: null }),
              },
            ]
          : []
      }
      mobileFilters={{
        groups: [
          {
            id: "status",
            label: "Status",
            allLabel: "All statuses",
            options: statuses.map((value) => ({
              value,
              label: requestStatus(value).label,
            })),
          },
        ],
        values: { status: filter.requestStatus ? [filter.requestStatus] : [] },
        onApply: (draft) =>
          setFilter({ requestStatus: draft.status?.[0] ?? null }),
      }}
    >
      {statuses.map((status) => (
        <DropdownMenuCheckboxItem
          key={status}
          checked={filter.requestStatus === status}
          closeOnClick={false}
          onCheckedChange={(checked) =>
            void setFilter({ requestStatus: checked ? status : null })
          }
        >
          {requestStatus(status).label}
        </DropdownMenuCheckboxItem>
      ))}
    </SearchFilter>
  )
}
