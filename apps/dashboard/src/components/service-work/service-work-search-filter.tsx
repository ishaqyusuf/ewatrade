"use client"

import { SearchFilter } from "@/components/search-filter"
import {
  SERVICE_DUE_FILTERS,
  SERVICE_PRIORITY_FILTERS,
} from "@/hooks/use-service-work-filter-params"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { useTRPC } from "@/trpc/client"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"

const dueLabels = {
  all: "Any due date",
  overdue: "Overdue",
  today: "Due today",
} as const
const priorityLabels = {
  normal: "Normal priority",
  urgent: "Urgent priority",
} as const

export function ServiceWorkSearchFilter({
  canManage,
}: {
  canManage: boolean
}) {
  const trpc = useTRPC()
  const { filter, setFilter } = useServiceWorkParams()
  const assignees = useQuery({
    ...trpc.services.assignees.queryOptions(),
    enabled: canManage,
  })
  const chips = [
    ...(filter.priority
      ? [
          {
            id: "priority",
            label: priorityLabels[filter.priority],
            onRemove: () => void setFilter({ priority: null }),
          },
        ]
      : []),
    ...(filter.due && filter.due !== "all"
      ? [
          {
            id: "due",
            label: dueLabels[filter.due],
            onRemove: () => void setFilter({ due: null }),
          },
        ]
      : []),
    ...(filter.assigneeUserId
      ? [
          {
            id: "assignee",
            label:
              assignees.data?.find((item) => item.id === filter.assigneeUserId)
                ?.name ?? "Assigned user",
            onRemove: () => void setFilter({ assigneeUserId: null }),
          },
        ]
      : []),
  ]
  return (
    <SearchFilter
      placeholder="Search service work..."
      value={filter.query ?? ""}
      onSearch={(query) => void setFilter({ query: query || null })}
      onClear={() => void setFilter(null)}
      filters={chips}
    >
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Priority</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-40 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
          >
            {SERVICE_PRIORITY_FILTERS.map((priority) => (
              <DropdownMenuCheckboxItem
                key={priority}
                checked={filter.priority === priority}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void setFilter({ priority: checked ? priority : null })
                }
              >
                {priorityLabels[priority]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Due date</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-40 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
          >
            {SERVICE_DUE_FILTERS.map((due) => (
              <DropdownMenuCheckboxItem
                key={due}
                checked={filter.due === due || (!filter.due && due === "all")}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void setFilter({ due: checked ? due : null })
                }
              >
                {dueLabels[due]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {canManage ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Assignee</DropdownMenuSubTrigger>
            <DropdownMenuSubContent
              appearance="dashboard"
              className="min-w-40 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
            >
              {(assignees.data ?? []).map((assignee) => (
                <DropdownMenuCheckboxItem
                  key={assignee.id}
                  checked={filter.assigneeUserId === assignee.id}
                  closeOnClick={false}
                  onCheckedChange={(checked) =>
                    void setFilter({
                      assigneeUserId: checked ? assignee.id : null,
                    })
                  }
                >
                  {assignee.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
      </DropdownMenuGroup>
    </SearchFilter>
  )
}
