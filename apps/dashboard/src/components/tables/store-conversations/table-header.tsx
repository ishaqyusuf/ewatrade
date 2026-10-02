"use client"

import { SearchFilter } from "@/components/search-filter"
import type {
  getStoreConversationQueueInput,
  useStoreConversationParams,
} from "@/hooks/use-store-conversation-params"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@ewatrade/ui"
import { useEffect, useState } from "react"

type Params = ReturnType<typeof useStoreConversationParams>

const requestKinds = [
  ["commerce_inquiry", "Product"],
  ["service_request", "Service"],
  ["prescription_request", "Prescription"],
] as const
const assignments = [
  ["all", "All assignments"],
  ["unassigned", "Unassigned"],
  ["mine", "Assigned to me"],
  ["assigned", "Assigned"],
] as const
const slas = [
  ["all", "All response times"],
  ["awaiting_response", "Awaiting response"],
  ["overdue", "Overdue"],
] as const
const sorts = [
  ["last_customer_activity:desc", "Newest activity"],
  ["last_customer_activity:asc", "Oldest activity"],
  ["response_due_at:asc", "Response due first"],
] as const

export function StoreConversationTableHeader({
  input,
  params,
  stores,
}: {
  input: ReturnType<typeof getStoreConversationQueueInput>
  params: Params
  stores: Array<{ id: string; name: string }>
}) {
  const [queryDraft, setQueryDraft] = useState(params.q ?? "")
  useEffect(() => setQueryDraft(params.q ?? ""), [params.q])
  const currentSort = `${input.sort[0]}:${input.sort[1]}`
  const selectedKinds = input.requestKinds
  const toggleKind = (
    kind: (typeof requestKinds)[number][0],
    checked: boolean,
  ) => {
    const next = checked
      ? [...new Set([...selectedKinds, kind])]
      : selectedKinds.filter((value) => value !== kind)
    void params.setFilters({ requestKinds: next })
  }
  const selectedAssignment = input.assignment
  const selectedSla = input.sla
  const selectedStore = params.store
  const storeName = stores.find((store) => store.id === selectedStore)?.name
  const selectedSortLabel = sorts.find(([value]) => value === currentSort)?.[1]
  const chips = [
    ...(selectedStore
      ? [
          {
            id: "store",
            label: storeName ?? "Store",
            onRemove: () => void params.setFilters({ store: null }),
          },
        ]
      : []),
    ...(selectedAssignment !== "all"
      ? [
          {
            id: "assignment",
            label:
              assignments.find(
                ([value]) => value === selectedAssignment,
              )?.[1] ?? "Assignment",
            onRemove: () => void params.setFilters({ assignment: "all" }),
          },
        ]
      : []),
    ...(selectedSla !== "all"
      ? [
          {
            id: "sla",
            label:
              slas.find(([value]) => value === selectedSla)?.[1] ??
              "Response time",
            onRemove: () => void params.setFilters({ sla: "all" }),
          },
        ]
      : []),
    ...(selectedSortLabel && currentSort !== "last_customer_activity:desc"
      ? [
          {
            id: "sort",
            label: selectedSortLabel,
            onRemove: () =>
              void params.setFilters({
                direction: "desc",
                sort: "last_customer_activity",
              }),
          },
        ]
      : []),
    ...selectedKinds.map((kind) => ({
      id: `kind-${kind}`,
      label: requestKinds.find(([value]) => value === kind)?.[1] ?? kind,
      onRemove: () => toggleKind(kind, false),
    })),
  ]
  return (
    <SearchFilter
      placeholder="Search conversations..."
      value={queryDraft}
      onSearch={(value) => {
        setQueryDraft(value)
        void params.setFilters({ q: value.trim() || null })
      }}
      onClear={() => {
        setQueryDraft("")
        void params.setFilters({
          q: null,
          assignment: null,
          sla: null,
          sort: null,
          direction: null,
          requestKinds: null,
          store: null,
        })
      }}
      filters={chips}
    >
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Store</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-48 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
          >
            <DropdownMenuCheckboxItem
              checked={!selectedStore}
              closeOnClick={false}
              onCheckedChange={() => void params.setFilters({ store: null })}
            >
              Current store
            </DropdownMenuCheckboxItem>
            {stores.map((store) => (
              <DropdownMenuCheckboxItem
                key={store.id}
                checked={selectedStore === store.id}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void params.setFilters({ store: checked ? store.id : null })
                }
              >
                {store.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Assignment</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-48 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
          >
            {assignments.map(([value, label]) => (
              <DropdownMenuCheckboxItem
                key={value}
                checked={selectedAssignment === value}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void params.setFilters({
                    assignment: checked ? value : "all",
                  })
                }
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Response SLA</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-48 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
          >
            {slas.map(([value, label]) => (
              <DropdownMenuCheckboxItem
                key={value}
                checked={selectedSla === value}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void params.setFilters({ sla: checked ? value : "all" })
                }
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Sort</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-48 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
          >
            {sorts.map(([value, label]) => {
              const [sort, direction] = value.split(":")
              return (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={currentSort === value}
                  closeOnClick={false}
                  onCheckedChange={() =>
                    void params.setFilters({
                      direction: direction as Params["direction"],
                      sort: sort as Params["sort"],
                    })
                  }
                >
                  {label}
                </DropdownMenuCheckboxItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Request kinds</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-48 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
          >
            {requestKinds.map(([kind, label]) => (
              <DropdownMenuCheckboxItem
                key={kind}
                checked={selectedKinds.includes(kind)}
                closeOnClick={false}
                onCheckedChange={(checked) => toggleKind(kind, checked)}
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
