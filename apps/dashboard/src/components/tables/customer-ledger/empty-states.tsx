"use client"
import { EmptyState } from "@/components/tables/core"
import { useDashboardEmptyState } from "@ewatrade/events/dashboard-client"
export function CustomerLedgerEmptyState({
  onRefresh,
}: { onRefresh: () => void }) {
  useDashboardEmptyState("customer-ledger")
  return (
    <EmptyState
      title="No recorded customer activity"
      description="Opening balances and customer receipts appear here when recorded."
      actionLabel="Refresh statement"
      onAction={onRefresh}
    />
  )
}
