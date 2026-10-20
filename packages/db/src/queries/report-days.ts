const DAY_MS = 86_400_000

/** UTC calendar day ("2026-10-19"); report windows use UTC day boundaries. */
export function utcDayKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

/** Every UTC day in `[from, to)`, so quiet days appear as zeros. */
export function utcDayKeys(from: Date, to: Date) {
  const keys: string[] = []
  const start = Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  )
  for (let time = start; time < to.getTime(); time += DAY_MS)
    keys.push(utcDayKey(new Date(time)))
  return keys
}

/** Counts (and optional amounts) per UTC day, one entry for every day in the window. */
export function countByUtcDay<Field extends string>(
  window: { from: Date; to: Date },
  series: Record<Field, Array<{ at: Date | null; amountMinor?: number }>>,
) {
  const fields = Object.keys(series) as Field[]
  const days = new Map(
    utcDayKeys(window.from, window.to).map((date) => [
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
      const day = days.get(utcDayKey(entry.at))
      if (day) (day as Record<Field, number>)[field] += entry.amountMinor ?? 1
    }
  }
  return [...days.values()]
}
