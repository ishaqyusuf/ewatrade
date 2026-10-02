"use client"

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

const labels: Record<(typeof ORDER_STATUSES)[number], string> = {
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  CONFIRMED: "Confirmed",
  DRAFT: "Draft",
  FULFILLING: "Fulfilling",
  OUT_FOR_DELIVERY: "Out for delivery",
  PENDING: "Pending",
  READY_FOR_PICKUP: "Ready for pickup",
  REFUNDED: "Refunded",
}

export function OrdersSearchFilter() {
  const { filter, setFilter } = useOrderParams()
  return (
    <SearchFilter
      placeholder="Search orders..."
      value={filter.query ?? ""}
      onSearch={(query) => void setFilter({ query: query || null })}
      onClear={() => void setFilter(null)}
      filters={[
        ...(filter.status
          ? [
              {
                id: "status",
                label: labels[filter.status],
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
                {labels[status]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
    </SearchFilter>
  )
}
