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
import { orderStatusLabels } from "./order-status"

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
          {
            id: "payment",
            label: "Payment",
            allLabel: "Any payment",
            options: [{ value: "owing", label: "Money due" }],
          },
        ],
        values: {
          status: filter.status ? [filter.status] : [],
          payment: filter.owing ? ["owing"] : [],
        },
        onApply: (draft) =>
          setFilter({
            status:
              ORDER_STATUSES.find((value) => value === draft.status?.[0]) ??
              null,
            owing: draft.payment?.[0] === "owing",
          }),
      }}
      placeholder="Search orders"
      value={filter.query ?? ""}
      onSearch={(query) => void setFilter({ query: query || null })}
      onClear={() => void setFilter(null)}
      filters={[
        ...(filter.owing
          ? [
              {
                id: "owing",
                label: "Money due",
                onRemove: () => void setFilter({ owing: false }),
              },
            ]
          : []),
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
        <DropdownMenuCheckboxItem
          checked={filter.owing}
          closeOnClick={false}
          onCheckedChange={(checked) => void setFilter({ owing: checked })}
        >
          Money due
        </DropdownMenuCheckboxItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            className="min-w-40 max-w-[calc(100vw-32px)] bg-popover p-0 shadow-md before:hidden"
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
