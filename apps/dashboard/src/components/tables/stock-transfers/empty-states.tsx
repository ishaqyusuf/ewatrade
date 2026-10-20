"use client"
import { useDashboardEmptyState } from "@ewatrade/events/dashboard-client"
import { Button } from "@ewatrade/ui"
export function TransfersEmpty({
  filtered,
  onClear,
}: { filtered: boolean; onClear: () => void }) {
  useDashboardEmptyState("stock-transfers")
  return (
    <div className="grid justify-items-center gap-3 border border-border py-20 text-center">
      <h2 className="text-lg font-medium">
        {filtered ? "No transfers match" : "No transfers yet"}
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {filtered
          ? "Clear the search or pick All."
          : "Send stock to another store and it shows here until it is received."}
      </p>
      {filtered ? (
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}
