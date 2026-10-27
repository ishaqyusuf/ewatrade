/** Staff reschedule/cancel rules shown in the Appointments sheet. */

export type StaffBookingRow = {
  id: string
  status: string
  revision: number
  startAt: string
  endAt: string
  timezone: string
  resource: { id: string; label: string }
}

// Mirrors deriveServiceCommerceBookingNextOperations; the server rechecks both.
export function bookingActions(status: string) {
  return {
    canReschedule: status === "confirmed",
    canCancel: ["scheduled", "confirmed", "arrived"].includes(status),
  }
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Booked",
  confirmed: "Booked",
  arrived: "Arrived",
  in_service: "In progress",
  completed: "Done",
  cancelled: "Cancelled",
  no_show: "Missed",
}

export function bookingStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ")
}

export const RESCHEDULE_REASONS = [
  { value: "staff_customer_asked", label: "Customer asked to move it" },
  { value: "staff_unavailable", label: "Staff not available" },
  { value: "staff_schedule_changed", label: "Our schedule changed" },
  { value: "staff_other", label: "Another reason" },
] as const

export const CANCEL_REASONS = [
  { value: "staff_customer_asked", label: "Customer asked to cancel" },
  { value: "staff_unavailable", label: "Staff not available" },
  { value: "staff_business_closed", label: "We’re closed then" },
  { value: "staff_duplicate", label: "Booked twice" },
  { value: "staff_other", label: "Another reason" },
] as const

/** Wall-clock day in the booking's time zone, as YYYY-MM-DD. */
export function zonedDayKey(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(at)
}

function zoneOffsetMs(at: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
      minute: "numeric",
      month: "numeric",
      second: "numeric",
      timeZone,
      year: "numeric",
    })
      .formatToParts(new Date(at))
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>
  const wall = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  )
  return wall - Math.floor(at / 1000) * 1000
}

function zonedMidnight(dayKey: string, timeZone: string) {
  const [year = 0, month = 1, day = 1] = dayKey.split("-").map(Number)
  const guess = Date.UTC(year, month - 1, day)
  const first = guess - zoneOffsetMs(guess, timeZone)
  // A second pass settles days where the offset changes (daylight saving).
  return guess - zoneOffsetMs(first, timeZone)
}

/** The UTC window covering one wall-clock day in the booking's time zone. */
export function zonedDayWindow(dayKey: string, timeZone: string) {
  const from = zonedMidnight(dayKey, timeZone)
  const [year = 0, month = 1, day = 1] = dayKey.split("-").map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10)
  return { from: new Date(from), to: new Date(zonedMidnight(next, timeZone)) }
}

/** Today and the following days, in the booking's time zone. */
export function upcomingDayKeys(now: Date, timeZone: string, count: number) {
  const today = zonedDayKey(now, timeZone)
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number)
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(year, month - 1, day + index)).toISOString().slice(0, 10),
  )
}

export function formatDayKey(dayKey: string) {
  const [year = 0, month = 1, day = 1] = dayKey.split("-").map(Number)
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function formatSlotTime(at: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(at))
}

export function formatBookingWhen(
  booking: Pick<StaffBookingRow, "endAt" | "startAt" | "timezone">,
) {
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: booking.timezone,
    weekday: "short",
  }).format(new Date(booking.startAt))
  return `${day}, ${formatSlotTime(booking.startAt, booking.timezone)}–${formatSlotTime(booking.endAt, booking.timezone)}`
}

type CommandFailure = { message?: string; data?: { code?: string } | null }

/** Plain words for the failures staff can act on; the server message otherwise. */
export function bookingCommandError(error: unknown) {
  const failure = (error ?? {}) as CommandFailure
  const message = failure.message ?? ""
  const code = failure.data?.code
  if (code === "CONFLICT" && /no longer available/i.test(message))
    return {
      kind: "slot_taken" as const,
      message: "That time was just taken. Pick another open time.",
    }
  if (code === "CONFLICT" && /changed/i.test(message))
    return {
      kind: "stale" as const,
      message:
        "This booking changed since you opened it. We refreshed it. Check it and try again.",
    }
  if (code === "FORBIDDEN" && /access/i.test(message))
    return {
      kind: "forbidden" as const,
      message: "Your access doesn’t allow changing bookings for this store.",
    }
  return {
    kind: "other" as const,
    message: message || "That didn’t save. Try again.",
  }
}

/**
 * Reuse one operation id while retrying the same change, so a lost response
 * can't book twice; a different change gets a new id.
 */
export function operationIdFor(
  current: { key: string; id: string } | null,
  payload: unknown,
  createId: () => string,
) {
  const key = JSON.stringify(payload)
  return current?.key === key ? current : { key, id: createId() }
}
