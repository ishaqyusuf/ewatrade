import { ToolsIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function ServiceWorkEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center text-center">
      <HugeiconsIcon
        icon={ToolsIcon}
        className="size-6 text-muted-foreground"
      />
      <p className="mt-3 font-medium">
        {filtered ? "No matching work" : "No active tracked work"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtered
          ? "Clear or change your search."
          : "Charge-only Services remain in Orders."}
      </p>
    </div>
  )
}
