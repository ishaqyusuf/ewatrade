"use client"

import { SearchFilter } from "@/components/search-filter"
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs"

export const customerBalanceFilters = [
  { id: "owe", label: "Owes you" },
  { id: "late", label: "Owing over 30 days" },
  { id: "ahead", label: "Paid ahead" },
  { id: "paid", label: "Paid up" },
] as const
export const customerBalanceSorts = [
  { id: "owed", label: "Owes the most" },
  { id: "oldest", label: "Owing longest" },
  { id: "name", label: "Name A–Z" },
] as const

export function useCustomerBalanceParams() {
  return useQueryStates(
    {
      customerSearch: parseAsString.withDefault(""),
      customerFilter: parseAsStringLiteral(
        customerBalanceFilters.map((item) => item.id),
      ),
      customerSort: parseAsStringLiteral(
        customerBalanceSorts.map((item) => item.id),
      ).withDefault("owed"),
    },
    { history: "push" },
  )
}

/** Search with a Show filter, like Spending. */
export function CustomerBalanceSearch() {
  const [params, setParams] = useCustomerBalanceParams()
  const current = customerBalanceFilters.find(
    (item) => item.id === params.customerFilter,
  )
  return (
    <SearchFilter
      placeholder="Search Customers..."
      value={params.customerSearch}
      onSearch={(value) => void setParams({ customerSearch: value || null })}
      onClear={() =>
        void setParams({ customerSearch: null, customerFilter: null })
      }
      mobileFilters={{
        groups: [
          {
            id: "show",
            label: "Show",
            allLabel: "All Customers",
            options: customerBalanceFilters.map((item) => ({
              value: item.id,
              label: item.label,
            })),
          },
        ],
        values: { show: params.customerFilter ? [params.customerFilter] : [] },
        onApply: (draft) =>
          setParams({
            customerFilter:
              customerBalanceFilters.find((item) => item.id === draft.show?.[0])
                ?.id ?? null,
          }),
      }}
      filters={
        current
          ? [
              {
                id: "show",
                label: current.label,
                onRemove: () => void setParams({ customerFilter: null }),
              },
            ]
          : []
      }
    >
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Show</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            sideOffset={14}
            alignOffset={-4}
          >
            {customerBalanceFilters.map((item) => (
              <DropdownMenuCheckboxItem
                key={item.id}
                checked={params.customerFilter === item.id}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void setParams({ customerFilter: checked ? item.id : null })
                }
              >
                {item.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
    </SearchFilter>
  )
}

export function CustomerBalanceSortMenu() {
  const [params, setParams] = useCustomerBalanceParams()
  const current =
    customerBalanceSorts.find((item) => item.id === params.customerSort) ??
    customerBalanceSorts[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="outline" className="rounded-none" />
        }
      >
        {current.label}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          data-icon="inline-end"
          className="text-muted-foreground"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent appearance="dashboard" align="end">
        <DropdownMenuRadioGroup
          aria-label="Sort Customers"
          value={current.id}
          onValueChange={(value) => {
            const option = customerBalanceSorts.find(
              (item) => item.id === value,
            )
            if (option) void setParams({ customerSort: option.id })
          }}
        >
          {customerBalanceSorts.map((item) => (
            <DropdownMenuRadioItem key={item.id} value={item.id} closeOnClick>
              {item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
