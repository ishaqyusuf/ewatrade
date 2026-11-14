import { cn } from "@ewatrade/ui"
import { PackageIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

/** The amber crate mark used wherever returnables appear. */
export function ReturnableBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      <HugeiconsIcon icon={PackageIcon} className="size-[18px]" />
    </span>
  )
}
