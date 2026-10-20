"use client"
import { useDashboardEmptyState } from "@ewatrade/events/dashboard-client"
import { Archive01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function InventoryEmptyState({ filtered }: { filtered: boolean }) {
  useDashboardEmptyState("inventory")
  return (
    <div className="flex min-h-56 flex-col items-center justify-center text-center">
      <HugeiconsIcon
        icon={Archive01Icon}
        className="size-6 text-muted-foreground"
      />
      <p className="mt-3 font-medium">
        {filtered ? "No products match" : "No stock yet"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtered
          ? "Clear the search or pick All stock."
          : "Add stock with Stock in, or set opening stock on a Product."}
      </p>
    </div>
  )
}
