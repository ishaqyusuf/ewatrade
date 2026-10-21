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

// Finance pages workshop 01: Still to pay and Missing receipt beside the payment states.
const statuses = [
  { id: "OPEN", label: "Still to pay" },
  { id: "UNPAID", label: "Unpaid" },
  { id: "PARTIAL", label: "Partly paid" },
  { id: "PAID", label: "Paid" },
  { id: "NO_RECEIPT", label: "Missing receipt" },
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
            label: "Show",
            allLabel: "All expenses",
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
          <DropdownMenuSubTrigger>Show</DropdownMenuSubTrigger>
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
