/** Date-only customer preference, represented at UTC noon; never a booked time. */
export function storefrontPreferredDate(
  value: string,
  timezone: string,
  now = new Date(),
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new RangeError("Choose a valid date.")
  const date = new Date(`${value}T12:00:00Z`)
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new RangeError("Choose a valid date.")
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    now,
  )
  if (value <= today) throw new RangeError("Choose a date after today.")
  if (
    date.getTime() >
    new Date(`${today}T12:00:00Z`).getTime() + 180 * 86_400_000
  )
    throw new RangeError("Choose a date within the next six months.")
  return date
}

/** Refuse clock folds/gaps rather than silently choosing a different local slot. */
export function storefrontPreferredTime(
  day: string,
  time: string,
  timezone: string,
  now = new Date(),
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new RangeError("Choose a valid preferred date and time.")
  const target = new Date(`${day}T${time}:00Z`)
  if (
    !Number.isFinite(target.getTime()) ||
    target.toISOString().slice(0, 10) !== day
  )
    throw new RangeError("Choose a valid preferred date and time.")
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
  const local = (date: Date) => {
    const parts = formatter.formatToParts(date)
    const at = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value
    return `${at("year")}-${at("month")}-${at("day")}T${at("hour")}:${at("minute")}:${at("second")}Z`
  }
  const candidates = new Set<number>()
  for (const delta of [-86_400_000, 0, 86_400_000]) {
    const probe = new Date(target.getTime() + delta)
    const offset = new Date(local(probe)).getTime() - probe.getTime()
    const candidate = new Date(target.getTime() - offset)
    if (local(candidate) === `${day}T${time}:00Z`)
      candidates.add(candidate.getTime())
  }
  if (candidates.size !== 1)
    throw new RangeError(
      "That local time is ambiguous or unavailable. Choose another time.",
    )
  const instant = new Date([...candidates][0] as number)
  if (instant <= now) throw new RangeError("Choose a time later than now.")
  if (instant.getTime() > now.getTime() + 181 * 86_400_000)
    throw new RangeError("Choose a date within the next six months.")
  return instant
}
