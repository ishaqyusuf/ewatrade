import type { BusinessReportTarget } from "@ewatrade/assistant/general/business-report-target"

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/** "2026-11-14" → "14 Nov 2026"; anything else is shown as given. */
function day(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}`
}

/** The day before an exclusive "before" date. */
function dayBefore(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime())) return value
  return day(new Date(date.getTime() - 86_400_000).toISOString())
}

/** The report's dates in plain words; filters the assistant applied. */
export function BusinessReportSheetHeader({
  target,
}: { target: BusinessReportTarget }) {
  const filters = target.request.filters
  return (
    <div className="grid gap-1 text-sm text-muted-foreground">
      {"before" in filters ? (
        <p>
          {day(filters.from)} to {dayBefore(filters.before)}
        </p>
      ) : "through" in filters ? (
        <p>
          {day(filters.from)} to {day(filters.through)}
        </p>
      ) : "asOfDate" in filters ? (
        <p>On {day(filters.asOfDate)}</p>
      ) : (
        <p>Right now</p>
      )}
      {"query" in filters && filters.query ? (
        <p>Customers matching “{filters.query}”</p>
      ) : null}
    </div>
  )
}
