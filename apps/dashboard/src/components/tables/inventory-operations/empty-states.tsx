"use client"
import { useDashboardEmptyState } from "@ewatrade/events/dashboard-client"
import { Button } from "@ewatrade/ui"
export function OperationsEmpty({
  filtered,
  onClear,
}: { filtered: boolean; onClear: () => void }) {
  useDashboardEmptyState("inventory-operations")
  return (
    <div className="grid justify-items-center gap-3 border border-border py-20 text-center">
      <h2 className="text-lg font-medium">
        {filtered ? "No changes match" : "No stock changes yet"}
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Clear the search or pick All changes."
          : "Changes appear here when you add, count, sell or move stock."}
      </p>
      {filtered ? (
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}
