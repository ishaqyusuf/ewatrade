import { cn } from "@ewatrade/ui"
import type { ReactNode } from "react"

export type ReportBarRow = {
  key: string
  label: ReactNode
  /** Extra words beside the label, such as "4 items". */
  labelNote?: string
  value: number
  valueLabel: string
  /** Second line under the value, such as "95 sold" or "61% of requests". */
  detail?: string
  barClassName?: string
  /** Shown as the row's tooltip; every value is also printed, so this only adds detail. */
  hint?: string
  icon?: ReactNode
}

/**
 * Horizontal bars with the label and value always printed. `stacked` puts the
 * bar under the label (narrow cards); `inline` keeps label, bar and value on
 * one row from 768px up.
 */
export function ReportBarList({
  label,
  layout = "inline",
  max,
  rows,
}: {
  label: string
  layout?: "inline" | "stacked"
  max?: number
  rows: ReportBarRow[]
}) {
  const largest = max ?? Math.max(0, ...rows.map((row) => row.value))
  return (
    <ol aria-label={label} className="grid gap-1">
      {rows.map((row) => {
        const width = largest > 0 ? (row.value / largest) * 100 : 0
        return (
          <li
            className={cn(
              "-mx-1.5 grid items-center gap-x-3 gap-y-1 rounded px-1.5 py-1 text-sm hover:bg-muted/60",
              layout === "stacked"
                ? "grid-cols-[minmax(0,1fr)_auto]"
                : "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]",
            )}
            key={row.key}
            title={row.hint}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {row.icon}
              <span className="truncate">{row.label}</span>
              {row.labelNote ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {row.labelNote}
                </span>
              ) : null}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "block h-3",
                layout === "stacked"
                  ? "col-span-2 row-start-2"
                  : "col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1",
              )}
            >
              <span
                className={cn(
                  "block h-full rounded-r",
                  row.value > 0 ? "min-w-0.5" : "",
                  row.barClassName ?? "bg-primary",
                )}
                style={{ width: `${width}%` }}
              />
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-right tabular-nums",
                row.value ? "font-semibold" : "text-muted-foreground",
              )}
            >
              {row.valueLabel}
              {row.detail ? (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {row.detail}
                </span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
