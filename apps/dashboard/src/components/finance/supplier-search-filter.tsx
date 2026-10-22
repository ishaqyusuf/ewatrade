"use client"

import { SearchFilter } from "@/components/search-filter"
import { useFinanceParams } from "@/hooks/use-finance-params"
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@ewatrade/ui"

const supplierFilters = [
  { id: "owe", label: "You owe" },
  { id: "overdue", label: "Overdue" },
  { id: "ahead", label: "Paid ahead" },
  { id: "paid", label: "Paid up" },
] as const

/** Search Suppliers with a Show filter, like Spending. */
export function FinanceSupplierSearchFilter() {
  const { supplierQuery, supplierFilter, setParams } = useFinanceParams()
  const current = supplierFilters.find((item) => item.id === supplierFilter)
  return (
    <SearchFilter
      maxLength={160}
      placeholder="Search Suppliers..."
      value={supplierQuery}
      onSearch={(value) =>
        void setParams({ supplierQuery: value.trim() || null })
      }
      onClear={() =>
        void setParams({ supplierQuery: null, supplierFilter: null })
      }
      mobileFilters={{
        groups: [
          {
            id: "show",
            label: "Show",
            allLabel: "All Suppliers",
            options: supplierFilters.map((item) => ({
              value: item.id,
              label: item.label,
            })),
          },
        ],
        values: { show: supplierFilter ? [supplierFilter] : [] },
        onApply: (draft) =>
          setParams({
            supplierFilter:
              supplierFilters.find((item) => item.id === draft.show?.[0])?.id ??
              null,
          }),
      }}
      filters={
        current
          ? [
              {
                id: "show",
                label: current.label,
                onRemove: () => void setParams({ supplierFilter: null }),
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
            {supplierFilters.map((item) => (
              <DropdownMenuCheckboxItem
                key={item.id}
                checked={supplierFilter === item.id}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void setParams({ supplierFilter: checked ? item.id : null })
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
