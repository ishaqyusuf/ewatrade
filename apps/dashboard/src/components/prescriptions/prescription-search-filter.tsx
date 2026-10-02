"use client"

import { DateRangeFilter } from "@/components/date-range-filter"
import { SearchFilter } from "@/components/search-filter"
import {
  PRESCRIPTION_SOURCES,
  PRESCRIPTION_STATUSES,
  usePrescriptionFilterParams,
} from "@/hooks/use-prescription-filter-params"
import { useTRPC } from "@/trpc/client"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

function label(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function PrescriptionSearchFilter({ storeId }: { storeId: string }) {
  const trpc = useTRPC()
  const { filter, setFilter } = usePrescriptionFilterParams()
  const context = useQuery(
    trpc.prescriptions.queueContext.queryOptions({ storeId }),
  )
  const assignees = context.data?.assignees ?? []
  const rangeActive = Boolean(filter.from || filter.to)
  const toggleArray = <T extends string>(
    values: T[] | null,
    value: T,
    checked: boolean,
  ): T[] | null => {
    const next = checked
      ? [...new Set([...(values ?? []), value])]
      : (values ?? []).filter((entry) => entry !== value)
    return next.length ? next : null
  }
  const chips = [
    ...(filter.statuses ?? []).map((status) => ({
      id: `status-${status}`,
      label: label(status),
      onRemove: () =>
        void setFilter({
          statuses: toggleArray(filter.statuses, status, false),
        }),
    })),
    ...(filter.assignees ?? []).map((id) => ({
      id: `assignee-${id}`,
      label: assignees.find((person) => person.id === id)?.name ?? "Assignee",
      onRemove: () =>
        void setFilter({ assignees: toggleArray(filter.assignees, id, false) }),
    })),
    ...(rangeActive
      ? [
          {
            id: "date-range",
            label: `${filter.from ?? "Any date"} – ${filter.to ? `before ${filter.to}` : "Any date"}`,
            onRemove: () => void setFilter({ from: null, to: null }),
          },
        ]
      : []),
    ...(filter.sources ?? []).map((source) => ({
      id: `source-${source}`,
      label: label(source),
      onRemove: () =>
        void setFilter({ sources: toggleArray(filter.sources, source, false) }),
    })),
  ]
  return (
    <SearchFilter
      placeholder="Search prescription requests..."
      value={filter.q ?? ""}
      onSearch={(q) => void setFilter({ q: q || null })}
      onClear={() => void setFilter(null)}
      filters={chips}
    >
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-52 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
          >
            {PRESCRIPTION_STATUSES.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={filter.statuses?.includes(status) ?? false}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void setFilter({
                    statuses: toggleArray(filter.statuses, status, checked),
                  })
                }
              >
                {label(status)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Assignee</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-48 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
          >
            {assignees.map((assignee) => (
              <DropdownMenuCheckboxItem
                key={assignee.id}
                checked={filter.assignees?.includes(assignee.id) ?? false}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void setFilter({
                    assignees: toggleArray(
                      filter.assignees,
                      assignee.id,
                      checked,
                    ),
                  })
                }
              >
                {assignee.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Date range</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="w-[min(680px,calc(100vw-32px))] max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
            sideOffset={14}
            alignOffset={-4}
          >
            <DateRangeFilter
              start={filter.from}
              end={filter.to}
              endExclusive
              onSelect={({ start, end }) =>
                void setFilter({ from: start, to: end })
              }
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Source</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-48 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
          >
            {PRESCRIPTION_SOURCES.map((source) => (
              <DropdownMenuCheckboxItem
                key={source}
                checked={filter.sources?.includes(source) ?? false}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void setFilter({
                    sources: toggleArray(filter.sources, source, checked),
                  })
                }
              >
                {label(source)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
    </SearchFilter>
  )
}
