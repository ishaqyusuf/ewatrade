"use client"

import { EmptyState, NoResults } from "@/components/tables/core"
import { useFinanceParams } from "@/hooks/use-finance-params"

export function FinanceSupplierEmptyState({
  filtered,
}: {
  filtered: boolean
}) {
  const { setParams } = useFinanceParams()

  if (filtered) {
    return (
      <NoResults
        appearance="form"
        onClear={() => void setParams({ supplierQuery: null })}
      />
    )
  }

  return (
    <EmptyState
      appearance="form"
      title="No suppliers yet"
      description="Add the suppliers you buy from to record separate payables and advances."
      actionLabel="Add supplier"
      onAction={() =>
        void setParams({ financeSheet: "supplier", supplierId: null })
      }
    />
  )
}
