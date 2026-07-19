import { Archive01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function InventoryEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center text-center">
      <HugeiconsIcon
        icon={Archive01Icon}
        className="size-6 text-muted-foreground"
      />
      <p className="mt-3 font-medium">
        {filtered ? "No matching balances" : "No inventory balances"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtered
          ? "Clear or change your search."
          : "Create a Product to establish its canonical balance."}
      </p>
    </div>
  )
}
