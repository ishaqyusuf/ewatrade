export function parseDateOnly(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [year, month, day] = value.split("-").map(Number)
  if (year === undefined || month === undefined || day === undefined)
    return undefined
  const date = new Date(year, month - 1, day)
  return formatDateOnly(date) === value ? date : undefined
}

export function formatDateOnly(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function shiftDateOnly(value: string, days: number) {
  const date = parseDateOnly(value)
  if (!date) return value
  date.setDate(date.getDate() + days)
  return formatDateOnly(date)
}

export function getDatePresets(now = new Date()) {
  const year = now.getFullYear()
  const month = now.getMonth()
  const quarter = Math.floor(month / 3) * 3
  const range = (label: string, start: Date, end: Date) => ({
    label,
    start: formatDateOnly(start),
    end: formatDateOnly(end),
  })
  const presets = [
    range("This month", new Date(year, month, 1), new Date(year, month + 1, 0)),
    range("Last month", new Date(year, month - 1, 1), new Date(year, month, 0)),
    range(
      "This quarter",
      new Date(year, quarter, 1),
      new Date(year, quarter + 3, 0),
    ),
    range(
      "Last quarter",
      new Date(year, quarter - 3, 1),
      new Date(year, quarter, 0),
    ),
    range("Year to date", new Date(year, 0, 1), now),
    range("Last year", new Date(year - 1, 0, 1), new Date(year - 1, 11, 31)),
  ]
  for (const days of [30, 60, 90]) {
    const start = new Date(now)
    start.setDate(start.getDate() - days)
    presets.push(range(`Last ${days} days`, start, now))
  }
  return presets
}
