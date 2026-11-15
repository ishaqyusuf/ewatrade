/**
 * A posting date for review lines, in the book's timezone:
 * "14 Nov 2026, 6:01 pm". Never the raw ISO/UTC value.
 */
export function generalReviewTime(iso: string, timeZone: string) {
  const at = new Date(iso)
  if (!Number.isFinite(at.getTime())) return "Posting date pending"
  const options = (zone: string): Intl.DateTimeFormatOptions => ({
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: zone,
  })
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat("en-GB", options(timeZone)).formatToParts(
      at,
    )
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", options("UTC")).formatToParts(at)
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? ""
  return `${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} ${part("dayPeriod").toLowerCase().replace(/\./g, "")}`
}
