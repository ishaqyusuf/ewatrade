"use client"
import { useDashboardEmptyState } from "@ewatrade/events/dashboard-client"
import { Button } from "@ewatrade/ui"
export function CustomerDirectoryEmptyState({
  query,
  onClearSearch,
  onAddCustomer,
}: {
  query: string
  onClearSearch: () => void
  onAddCustomer?: () => void
}) {
  useDashboardEmptyState("customers")
  const search = query.trim()
  return (
    <div className="grid min-h-40 place-items-center border border-border px-4 py-8 text-center">
      <div className="grid justify-items-center gap-1">
        <p className="font-medium">
          {search ? `No customers match “${search}”` : "No customers yet"}
        </p>
        <p className="text-sm text-muted-foreground">
          {search
            ? "Check the spelling, or search by phone number."
            : "Customers show up here after their first Order, or when you add one."}
        </p>
        {search ? (
          <Button variant="outline" className="mt-3" onClick={onClearSearch}>
            Clear search
          </Button>
        ) : onAddCustomer ? (
          <Button className="mt-3" onClick={onAddCustomer}>
            Add customer
          </Button>
        ) : null}
      </div>
    </div>
  )
}
