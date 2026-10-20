"use client"
import { OpenFinanceSheet } from "@/components/finance/open-finance-sheet"
import { useDashboardEmptyState } from "@ewatrade/events/dashboard-client"
export function ExpenseEmptyState({ filtered }: { filtered: boolean }) {
  useDashboardEmptyState("expenses")
  return (
    <div className="grid justify-items-center gap-3 border-y border-border py-16 text-center">
      <h3 className="font-medium">
        {filtered ? "Nothing matches" : "No expenses yet"}
      </h3>
      <p className="max-w-md text-sm text-muted-foreground">
        {filtered
          ? "Change the search or filter to see more."
          : "Add what you spend, who you paid and anything still to pay."}
      </p>
      {!filtered ? (
        <OpenFinanceSheet mode="expense" primary>
          Add expense
        </OpenFinanceSheet>
      ) : null}
    </div>
  )
}
