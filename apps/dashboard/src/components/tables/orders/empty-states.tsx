import { ShoppingCart01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function OrdersEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center text-center">
      <HugeiconsIcon
        icon={ShoppingCart01Icon}
        className="size-6 text-muted-foreground"
      />
      <p className="mt-3 font-medium">
        {filtered ? "No matching orders" : "No orders yet"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtered ? "Clear or change your search." : "New orders appear here."}
      </p>
    </div>
  )
}
