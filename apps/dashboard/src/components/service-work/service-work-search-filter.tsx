"use client"

import { SearchFilter } from "@/components/search-filter"
import {
  SERVICE_DUE_FILTERS,
  SERVICE_PRIORITY_FILTERS,
  SERVICE_STAGE_FILTERS,
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
import { ServiceStatusSquare } from "./service-status"

const dueLabels = {
  all: "Any time",
  overdue: "Late",
  today: "Due today",
} as const
const priorityLabels = {
  normal: "Not urgent",
  urgent: "Urgent",
} as const

const stageLabels = {
  all: "All statuses",
  open: "Open",
  todo: "Not started",
  doing: "In progress",
  stuck: "Stuck",
  ready: "Ready for customer",
  done: "Completed",
  cancelled: "Cancelled",
} as const

const stageColors = {
  all: "all",
  open: "open",
  todo: "queued",
  doing: "in_progress",
  stuck: "blocked",
  ready: "ready_for_handoff",
  done: "completed",
  cancelled: "cancelled",
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
    ...(filter.stage && filter.stage !== "all"
      ? [
          {
            id: "stage",
            label: stageLabels[filter.stage],
            onRemove: () => void setFilter({ stage: null }),
          },
        ]
      : []),
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
                ?.name ?? "Someone",
            onRemove: () => void setFilter({ assigneeUserId: null }),
          },
        ]
      : []),
  ]
  return (
    <SearchFilter
      mobileFilters={{
        groups: [
          {
            id: "stage",
            label: "Status",
            allLabel: "All statuses",
            options: SERVICE_STAGE_FILTERS.filter(
              (value) => value !== "all",
            ).map((value) => ({ value, label: stageLabels[value] })),
          },
          {
            id: "priority",
            label: "Urgent",
            allLabel: "Any",
            options: SERVICE_PRIORITY_FILTERS.map((value) => ({
              value,
              label: priorityLabels[value],
            })),
          },
          {
            id: "due",
            label: "Due",
            allLabel: "Any time",
            options: SERVICE_DUE_FILTERS.filter((value) => value !== "all").map(
              (value) => ({ value, label: dueLabels[value] }),
            ),
          },
          ...(canManage
            ? [
                {
                  id: "assignee",
                  label: "Who",
                  allLabel: "Anyone",
                  options: (assignees.data ?? []).map((item) => ({
                    value: item.id,
                    label: item.name,
                  })),
                  loading: assignees.isPending,
                  error: assignees.isError,
                  onRetry: () => void assignees.refetch(),
                },
              ]
            : []),
        ],
        values: {
          stage: filter.stage && filter.stage !== "all" ? [filter.stage] : [],
          priority: filter.priority ? [filter.priority] : [],
          due: filter.due && filter.due !== "all" ? [filter.due] : [],
          assignee: filter.assigneeUserId ? [filter.assigneeUserId] : [],
        },
        onApply: (draft) =>
          setFilter({
            stage:
              SERVICE_STAGE_FILTERS.find(
                (value) => value === draft.stage?.[0],
              ) ?? null,
            priority:
              SERVICE_PRIORITY_FILTERS.find(
                (value) => value === draft.priority?.[0],
              ) ?? null,
            due:
              SERVICE_DUE_FILTERS.find((value) => value === draft.due?.[0]) ??
              null,
            ...(canManage
              ? { assigneeUserId: draft.assignee?.[0] ?? null }
              : {}),
          }),
      }}
      placeholder="Search customer, order or service"
      value={filter.query ?? ""}
      onSearch={(query) => void setFilter({ query: query || null })}
      onClear={() => void setFilter(null)}
      filters={chips}
    >
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-40 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
          >
            {SERVICE_STAGE_FILTERS.map((stage) => (
              <DropdownMenuCheckboxItem
                key={stage}
                checked={(filter.stage ?? "all") === stage}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void setFilter({
                    stage: checked && stage !== "all" ? stage : null,
                  })
                }
              >
                <ServiceStatusSquare status={stageColors[stage]} />
                {stageLabels[stage]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Urgent</DropdownMenuSubTrigger>
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
          <DropdownMenuSubTrigger>Due</DropdownMenuSubTrigger>
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
            <DropdownMenuSubTrigger>Who</DropdownMenuSubTrigger>
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
