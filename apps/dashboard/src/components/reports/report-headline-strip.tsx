import { cn } from "@ewatrade/ui"
import type { ReactNode } from "react"

export type ReportHeadline = {
  label: string
  value: ReactNode
  detail?: ReactNode
  /** Greys out a zero so non-zero figures stand out. */
  muted?: boolean
  /** Money uses the smaller compact-summary value size on phones. */
  money?: boolean
}

/**
 * One bordered strip of headline figures on wider screens. Below 768px it
 * follows the compact mobile summaries contract (two-column cards, opted in
 * through `data-summary-grid`). Dividers come from the 1px grid gap, so any
 * column count keeps single borders.
 */
export function ReportHeadlineStrip({
  items,
  label,
}: {
  items: ReportHeadline[]
  label: string
}) {
  return (
    <dl
      aria-label={label}
      data-summary-grid
      className="grid min-w-0 grid-cols-2 gap-2 md:gap-px md:border md:border-border md:bg-border xl:grid-cols-4"
    >
      {items.map((item) => (
        <div
          className="grid min-w-0 content-start gap-1 border border-border bg-background p-3 md:gap-1.5 md:border-0 md:px-5 md:py-4"
          key={item.label}
        >
          <dt className="text-xs text-muted-foreground md:text-sm">
            {item.label}
          </dt>
          <dd
            data-summary-money={item.money || undefined}
            className={cn(
              "break-words font-normal leading-tight tabular-nums md:text-3xl",
              item.money ? "text-lg" : "text-2xl",
              item.muted && "text-muted-foreground",
            )}
          >
            {item.value}
          </dd>
          {item.detail ? (
            <dd data-summary-detail className="text-xs text-muted-foreground">
              {item.detail}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  )
}

export function ReportHeadlineStripSkeleton({ count }: { count: number }) {
  return (
    <div
      aria-hidden="true"
      data-summary-grid
      data-summary-skeleton
      className="grid grid-cols-2 gap-2 md:gap-px md:border md:border-border md:bg-border xl:grid-cols-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          className="h-[4.75rem] border border-border bg-background p-3 md:h-28 md:border-0 md:p-5"
          key={`headline-skeleton-${index + 1}`}
        >
          <div className="h-full animate-pulse bg-muted" />
        </div>
      ))}
    </div>
  )
}
