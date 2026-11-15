import { businessDayKey, businessDayKeys } from "@ewatrade/utils/business-day"

/** Calendar day ("2026-10-19") of an instant in `timeZone` (UTC by default). */
export function utcDayKey(value: Date, timeZone = "UTC") {
  return timeZone === "UTC"
    ? value.toISOString().slice(0, 10)
    : businessDayKey(value, timeZone)
}

/**
 * Every day that starts in `[from, to)`, so quiet days appear as zeros. With a
 * business time zone the days run from local midnight (Lagos: 23:00 UTC).
 */
export function utcDayKeys(from: Date, to: Date, timeZone = "UTC") {
  return businessDayKeys(from, to, timeZone)
}

/** Counts (and optional amounts) per day, one entry for every day in the window. */
export function countByUtcDay<Field extends string>(
  window: { from: Date; to: Date },
  series: Record<Field, Array<{ at: Date | null; amountMinor?: number }>>,
  timeZone = "UTC",
) {
  const fields = Object.keys(series) as Field[]
  const days = new Map(
    utcDayKeys(window.from, window.to, timeZone).map((date) => [
      date,
      Object.fromEntries([
        ["date", date],
        ...fields.map((field) => [field, 0]),
      ]) as { date: string } & Record<Field, number>,
    ]),
  )
  for (const field of fields) {
    for (const entry of series[field]) {
      if (!entry.at || entry.at < window.from || entry.at >= window.to) continue
      const day = days.get(utcDayKey(entry.at, timeZone))
      if (day) (day as Record<Field, number>)[field] += entry.amountMinor ?? 1
    }
  }
  return [...days.values()]
}
