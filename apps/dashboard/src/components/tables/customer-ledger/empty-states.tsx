import { EmptyState } from "@/components/tables/core"
export function CustomerLedgerEmptyState({
  onRefresh,
}: { onRefresh: () => void }) {
  return (
    <EmptyState
      title="No recorded customer activity"
      description="Opening balances and customer receipts appear here when recorded."
      actionLabel="Refresh statement"
      onAction={onRefresh}
    />
  )
}
