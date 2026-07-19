import { Package01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function CatalogEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
        <HugeiconsIcon
          icon={Package01Icon}
          className="size-5 text-muted-foreground"
        />
      </div>
      <p className="mt-3 text-sm font-medium">
        {filtered ? "No matching items" : "No items yet"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {filtered
          ? "Clear or change your filters."
          : "Add your first Product or Service."}
      </p>
    </div>
  )
}
