export function financeDisplayDate(value: Date | string, withTime = false) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "Date unavailable"
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    ...(withTime
      ? { hour: "2-digit" as const, minute: "2-digit" as const }
      : {}),
  }).format(date)
}
