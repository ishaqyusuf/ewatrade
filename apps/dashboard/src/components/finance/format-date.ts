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

/** Year, month and day of an instant in a time zone (UTC when not given). */
function dayParts(value: Date | string, timeZone = "UTC") {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(value))
    .split("-")
  return { year, month: MONTHS[Number(month) - 1], day: Number(day) }
}

/** "14 Oct 2026": the one date format Finance lists and sheets use. */
export function formatFinanceDate(value: Date | string, timeZone?: string) {
  const { year, month, day } = dayParts(value, timeZone)
  return `${day} ${month} ${year}`
}

/** "14 Oct": for rows inside a list, where the year is usually the current one. */
export function formatFinanceShortDate(
  value: Date | string,
  timeZone?: string,
) {
  const { month, day } = dayParts(value, timeZone)
  return `${day} ${month}`
}
