"use client"

import { EmptyState, NoResults } from "@/components/tables/core"
import { useFinanceParams } from "@/hooks/use-finance-params"

export function FinanceBankStatementEmptyState({
  filtered,
}: { filtered: boolean }) {
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
      description="Import an original CSV statement to compare bank transactions with your posted records."
      actionLabel="Import statement"
      onAction={() =>
        void setParams({ financeSheet: "bank-import", statementId: null })
      }
    />
  )
}
