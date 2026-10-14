/** Date-only Finance inputs use UTC; the first bookkeeping day starts at its exact opening time. */
export function financePostingDayStart(day: string, startsAt: Date | string) {
  const start = new Date(
    startsAt instanceof Date ? startsAt.getTime() : startsAt,
  )
  return day === start.toISOString().slice(0, 10)
    ? start
    : new Date(`${day}T00:00:00.000Z`)
}
