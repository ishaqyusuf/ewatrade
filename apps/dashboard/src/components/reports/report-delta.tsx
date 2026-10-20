import { reportDelta } from "./report-metrics"

/** "▲ +12% vs previous 30 days"; nothing when both periods are zero. */
export function ReportDelta({
  current,
  days,
  previous,
}: {
  current: number
  days: number
  previous: number | undefined
}) {
  if (previous === undefined) return null
  const delta = reportDelta(current, previous)
  if (!delta) return null
  const period = `previous ${days} ${days === 1 ? "day" : "days"}`
  if (delta.kind === "same") return <>Same as the {period}</>
  if (delta.kind === "new") return <>None in the {period}</>
  const up = delta.kind === "up"
  return (
    <span className="inline-flex items-center gap-1">
      <span
        aria-hidden="true"
        className={
          up
            ? "text-[10px] text-[var(--report-product)]"
            : "text-[10px] text-destructive"
        }
      >
        {up ? "▲" : "▼"}
      </span>
      <span className="font-semibold text-foreground">
        {up ? "+" : "−"}
        {delta.percent}%
      </span>
      <span className="sr-only">{up ? "up" : "down"}</span> vs {period}
    </span>
  )
}
