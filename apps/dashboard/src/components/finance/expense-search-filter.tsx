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

const statuses = [
  { id: "UNPAID", label: "Unpaid" },
  { id: "PARTIAL", label: "Partly paid" },
  { id: "PAID", label: "Paid" },
  { id: "VOID", label: "Cancelled" },
] as const

export function ExpenseSearchFilter() {
  const { expenseQuery, expenseStatus, setParams } = useFinanceParams()
  return (
    <SearchFilter
      mobileFilters={{
        groups: [
          {
            id: "status",
            label: "Payment status",
            allLabel: "All statuses",
            options: statuses.map((item) => ({
              value: item.id,
              label: item.label,
            })),
          },
        ],
        values: { status: expenseStatus ? [expenseStatus] : [] },
        onApply: (draft) =>
          setParams({
            expenseStatus:
              statuses.find((item) => item.id === draft.status?.[0])?.id ??
              null,
          }),
      }}
      value={expenseQuery}
      placeholder="Search expenses..."
      onSearch={(value) => void setParams({ expenseQuery: value || null })}
      onClear={() =>
        void setParams({ expenseQuery: null, expenseStatus: null })
      }
      filters={
        expenseStatus
          ? [
              {
                id: "status",
                label:
                  statuses.find((entry) => entry.id === expenseStatus)?.label ??
                  expenseStatus,
                onRemove: () => void setParams({ expenseStatus: null }),
              },
            ]
          : []
      }
    >
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Payment status</DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            appearance="dashboard"
            sideOffset={14}
            alignOffset={-4}
          >
            {statuses.map((status) => (
              <DropdownMenuCheckboxItem
                key={status.id}
                checked={expenseStatus === status.id}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  void setParams({ expenseStatus: checked ? status.id : null })
                }
              >
                {status.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuGroup>
    </SearchFilter>
  )
}
