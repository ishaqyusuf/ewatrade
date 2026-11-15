/**
 * Business calendar days. A day key ("2026-11-15") is a date on the business's
 * wall clock; its start is local midnight in the business time zone, so
 * "Today" in Lagos starts at 23:00 UTC the evening before. DST-safe.
 */

const DAY_MS = 86_400_000

/** Calendar day (YYYY-MM-DD) of an instant in `timeZone`. */
export function businessDayKey(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant)
}

function dayParts(day: string): [number, number, number] {
  const [y = Number.NaN, m = Number.NaN, d = Number.NaN] = day
    .split("-")
    .map(Number)
  return [y, m, d]
}

/** `day` moved by whole calendar days. */
export function shiftDayKey(day: string, days: number) {
  const [y, m, d] = dayParts(day)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Milliseconds `timeZone` is ahead of UTC at `instant`. */
export function zoneOffsetMs(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  )
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** UTC instant of local midnight starting `day` in `timeZone`. */
export function businessDayStart(day: string, timeZone: string) {
  const [y, m, d] = dayParts(day)
  const guess = Date.UTC(y, m - 1, d)
  let instant = guess - zoneOffsetMs(guess, timeZone)
  // A second pass settles days whose offset changes around midnight.
  instant = guess - zoneOffsetMs(instant, timeZone)
  return new Date(instant)
}

/**
 * Every business day from the one containing `from` up to (not including) the
 * day that starts at or after `to`, quiet days included.
 */
export function businessDayKeys(from: Date, to: Date, timeZone: string) {
  const keys: string[] = []
  let key = businessDayKey(from, timeZone)
  // Bounded by the window length plus a margin, so a bad zone can't spin.
  const limit = Math.ceil((to.getTime() - from.getTime()) / DAY_MS) + 2
  for (let index = 0; index < limit; index += 1) {
    if (businessDayStart(key, timeZone) >= to) break
    keys.push(key)
    key = shiftDayKey(key, 1)
  }
  return keys
}
