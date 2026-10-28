export type ReceiptDateInput = {
  dateTimeIso: string | null
  dateOnly: string | null
  dateRaw: string | null
  dateAmbiguous: boolean
}
export type ReceiptDateDisposition =
  | "unknown"
  | "ambiguous"
  | "old"
  | "future"
  | "within_window"

function validCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ]
  return days !== undefined && day >= 1 && day <= days
}
function preciseInstant(value: string) {
  const parts =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    )
  if (
    !parts ||
    !parts[1] ||
    !validCalendarDate(parts[1]) ||
    Number(parts[2]) > 23 ||
    Number(parts[3]) > 59 ||
    Number(parts[4]) > 59
  )
    return null
  const zone = parts[5]
  if (!zone) return null
  if (zone !== "Z") {
    const hours = Number(zone.slice(1, 3))
    const minutes = Number(zone.slice(4, 6))
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0))
      return null
  }
  const instant = new Date(value)
  return Number.isFinite(instant.getTime()) ? instant : null
}

/** A date-only receipt describes an interval, never an invented midnight/zone. */
export function checkManualReceiptDate(
  input: ReceiptDateInput,
  policy: { oldestAcceptableAt: Date; latestAcceptableAt: Date },
): ReceiptDateDisposition {
  if (
    ![policy.oldestAcceptableAt, policy.latestAcceptableAt].every((value) =>
      Number.isFinite(value.getTime()),
    ) ||
    policy.oldestAcceptableAt > policy.latestAcceptableAt
  )
    throw new Error("Invalid receipt date policy.")
  const numericDate = input.dateRaw
    ?.trim()
    .match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-]\d{4}(?:\s|$)/)
  if (
    input.dateAmbiguous ||
    (numericDate &&
      Number(numericDate[1]) <= 12 &&
      Number(numericDate[2]) <= 12 &&
      Number(numericDate[1]) !== Number(numericDate[2]))
  )
    return "ambiguous"
  if (input.dateTimeIso) {
    const instant = preciseInstant(input.dateTimeIso)
    if (!instant) return "unknown"
    if (instant < policy.oldestAcceptableAt) return "old"
    if (instant > policy.latestAcceptableAt) return "future"
    return "within_window"
  }
  if (!input.dateOnly || !validCalendarDate(input.dateOnly)) return "unknown"
  const utcDayStart = Date.parse(`${input.dateOnly}T00:00:00.000Z`)
  // Across supported civil zones UTC-12 through UTC+14, every instant that could
  // belong to that printed local date is inside this half-open 50-hour envelope.
  const earliest = utcDayStart - 14 * 3600_000
  const latestExclusive = utcDayStart + 86400_000 + 12 * 3600_000
  if (latestExclusive <= policy.oldestAcceptableAt.getTime()) return "old"
  if (earliest > policy.latestAcceptableAt.getTime()) return "future"
  if (
    earliest >= policy.oldestAcceptableAt.getTime() &&
    latestExclusive <= policy.latestAcceptableAt.getTime()
  )
    return "within_window"
  return "unknown"
}
