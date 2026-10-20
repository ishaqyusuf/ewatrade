import type { GeneralAnswer } from "@ewatrade/assistant/general/contracts"
import { staffHistoryEventTitle } from "./staff-history-event"

const date = new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" })
const formatDate = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : date.format(parsed)
}

export function StaffHistorySheetHeader({
  filters,
}: {
  filters: Extract<
    NonNullable<GeneralAnswer["target"]>,
    { kind: "staff_history" }
  >["filters"]
}) {
  const from = filters.from ? formatDate(filters.from) : null
  const to = filters.to ? formatDate(filters.to) : null
  const lines = [
    from ? `From ${from}` : null,
    to ? `Until ${to}` : null,
    filters.eventType ? staffHistoryEventTitle(filters.eventType) : null,
    filters.stream
      ? filters.stream === "LIFECYCLE"
        ? "Role and status"
        : "Stores"
      : null,
  ].filter((line): line is string => Boolean(line))
  if (!lines.length) return null
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}
