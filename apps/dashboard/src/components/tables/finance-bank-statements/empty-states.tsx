"use client"
import { useDashboardEmptyState } from "@ewatrade/events/dashboard-client"

import { EmptyState, NoResults } from "@/components/tables/core"
import { useFinanceParams } from "@/hooks/use-finance-params"

export function FinanceBankStatementEmptyState({
  filtered,
}: { filtered: boolean }) {
  useDashboardEmptyState("finance-bank-statements")
  const { setParams } = useFinanceParams()
  if (filtered)
    return (
      <NoResults
        appearance="form"
        onClear={() => void setParams({ bankAccountId: null })}
      />
    )
  return (
    <EmptyState
      appearance="form"
      title="No bank statements yet"
      description="Upload the CSV file from your bank to check each line against what you recorded."
      actionLabel="Upload statement"
      onAction={() =>
        void setParams({ financeSheet: "bank-import", statementId: null })
      }
    />
  )
}
