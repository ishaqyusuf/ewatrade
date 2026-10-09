"use client"

import { orderStatusLabels } from "@/components/orders/order-status"
import { SearchFilter } from "@/components/search-filter"
import { ORDER_STATUSES } from "@/hooks/use-order-filter-params"
import { useOrderParams } from "@/hooks/use-order-params"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@ewatrade/ui"

export function OrdersSearchFilter() {
  const { filter, setFilter } = useOrderParams()
  return (
    <SearchFilter
      mobileFilters={{
        groups: [
          {
            id: "status",
            label: "Status",
            allLabel: "All statuses",
            options: ORDER_STATUSES.map((value) => ({
              value,
              label: orderStatusLabels[value],
            })),
          },
        ],
        values: { status: filter.status ? [filter.status] : [] },
        onApply: (draft) =>
          setFilter({
            status:
              ORDER_STATUSES.find((value) => value === draft.status?.[0]) ??
              null,
          }),
      }}
      placeholder="Search orders..."
      value={filter.query ?? ""}
      onSearch={(query) => void setFilter({ query: query || null })}
      onClear={() => void setFilter(null)}
      filters={[
        ...(filter.status
          ? [
              {
                id: "status",
                label: orderStatusLabels[filter.status],
                onRemove: () => void setFilter({ status: null }),
              },
            ]
          : []),
      ]}
    >
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-40 max-w-[calc(100vw-32px)] rounded-none bg-popover p-0 shadow-md before:hidden"
            sideOffset={14}
            alignOffset={-4}
          >
            {ORDER_STATUSES.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={filter.status === status}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void setFilter({ status: checked ? status : null })
                }
              >
                {orderStatusLabels[status]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
    </SearchFilter>
  )
}
