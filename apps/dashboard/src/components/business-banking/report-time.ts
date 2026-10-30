/** Business-time display for reports and notices; no phone or messaging code. */
export function formatReportTime(
  value: Date | string | null,
  timeZone: string,
) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value))
}
