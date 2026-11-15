import { cn } from "@ewatrade/ui"
import type { ReactNode } from "react"

export function ReportSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "grid min-w-0 gap-5 rounded-[var(--ui-radius-surface)] border border-border bg-card p-4 sm:p-6",
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {description ? (
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function ReportSectionSkeleton({
  count,
  title,
}: { count: number; title: string }) {
  return (
    <section aria-label={`Loading ${title}`} className="grid min-w-0 gap-4">
      <h2 className="font-semibold">{title}</h2>
      <div
        aria-hidden="true"
        data-summary-grid
        data-summary-skeleton
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {Array.from({ length: count }, (_, index) => (
          <div
            className="h-28 animate-pulse rounded-[var(--ui-radius-surface)] bg-muted"
            key={`${title}-${index + 1}`}
          />
        ))}
      </div>
    </section>
  )
}
