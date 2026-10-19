import type {
  ServiceCommerceBookingAvailabilityException,
  ServiceCommerceBookingAvailabilityRule,
  ServiceCommerceBookingCancellationConsequence,
  ServiceCommerceBookingCustomerCapability,
  ServiceCommerceBookingNotificationIntent,
  ServiceCommerceBookingStatus,
} from "./schemas"

const BOOKING_TRANSITIONS: Record<
  ServiceCommerceBookingStatus,
  ServiceCommerceBookingStatus[]
> = {
  arrived: ["cancelled", "in_service"],
  cancelled: [],
  completed: [],
  confirmed: ["arrived", "cancelled", "no_show", "scheduled"],
  in_service: ["completed"],
  no_show: [],
  scheduled: ["cancelled", "confirmed"],
}

const CONSUMING_BOOKING_STATUSES = new Set<ServiceCommerceBookingStatus>([
  "scheduled",
  "confirmed",
  "arrived",
  "in_service",
])

const WEEKDAYS: Record<string, number> = {
  Fri: 5,
  Mon: 1,
  Sat: 6,
  Sun: 0,
  Thu: 4,
  Tue: 2,
  Wed: 3,
}

function overlaps(
  left: { endAt: Date; startAt: Date },
  right: { endAt: Date; startAt: Date },
) {
  return left.startAt < right.endAt && right.startAt < left.endAt
}

function localSlotParts(at: Date, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ""
  const localEpoch = new Date(0)
  localEpoch.setUTCFullYear(
    Number(part("year")),
    Number(part("month")) - 1,
    Number(part("day")),
  )
  localEpoch.setUTCHours(
    Number(part("hour")),
    Number(part("minute")),
    Number(part("second")),
    0,
  )
  return {
    minuteOfDay: Number(part("hour")) * 60 + Number(part("minute")),
    second: Number(part("second")),
    weekday: WEEKDAYS[part("weekday")] ?? -1,
    offset: localEpoch.getTime() - Math.floor(at.getTime() / 1_000) * 1_000,
  }
}

function localTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

function matchesAvailabilityRules(
  rules: ServiceCommerceBookingAvailabilityRule[],
  slot: { endAt: Date; startAt: Date },
  timezone: string,
  openings: ServiceCommerceBookingAvailabilityException[],
) {
  if (rules.length === 0) return true
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    weekday: "short",
  })
  // OPEN exceptions and recurring hours form a union. Check only the gaps not
  // covered by an explicit opening; mere overlap never opens the whole slot.
  const gaps: Array<{ start: number; end: number }> = []
  let uncovered = slot.startAt.getTime()
  for (const opening of [...openings].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  )) {
    const start = Math.max(slot.startAt.getTime(), opening.startAt.getTime())
    const end = Math.min(slot.endAt.getTime(), opening.endAt.getTime())
    if (start > uncovered) gaps.push({ start: uncovered, end: start })
    uncovered = Math.max(uncovered, end)
  }
  if (uncovered < slot.endAt.getTime())
    gaps.push({ start: uncovered, end: slot.endAt.getTime() })
  const intervals = rules.map((rule) => ({
    days: rule.daysOfWeek,
    start: localTimeToMinutes(rule.startLocalTime),
    end: localTimeToMinutes(rule.endLocalTime),
  }))
  for (const gap of gaps) {
    let instant = gap.start
    while (instant < gap.end) {
      const local = localSlotParts(new Date(instant), formatter)
      if (
        !intervals.some(
          (rule) =>
            rule.days.includes(local.weekday) &&
            local.minuteOfDay >= rule.start &&
            local.minuteOfDay < rule.end,
        )
      )
        return false
      // Rules have local-minute precision; retain exact UTC subsecond endpoints.
      // A clock fold/gap can occur before the next local minute. Split at that
      // transition too, so neither repeated nor skipped civil time is guessed.
      const nextMinute =
        Math.floor(instant / 1_000) * 1_000 + (60 - local.second) * 1_000
      let boundary = Math.min(gap.end, nextMinute)
      if (
        boundary - instant > 1 &&
        localSlotParts(new Date(boundary - 1), formatter).offset !==
          local.offset
      ) {
        let low = instant + 1
        let high = boundary - 1
        while (low < high) {
          const middle = low + Math.floor((high - low) / 2)
          if (
            localSlotParts(new Date(middle), formatter).offset === local.offset
          )
            low = middle + 1
          else high = middle
        }
        boundary = low
      }
      instant = boundary
    }
  }
  return true
}

export function assertServiceCommerceBookingTransition(
  from: ServiceCommerceBookingStatus,
  to: ServiceCommerceBookingStatus,
) {
  if (!BOOKING_TRANSITIONS[from].includes(to)) {
    throw new Error(`Booking cannot move from ${from} to ${to}.`)
  }
}

export function deriveServiceCommerceBookingNextOperations(
  status: ServiceCommerceBookingStatus,
) {
  switch (status) {
    case "scheduled":
      return ["confirm", "cancel"] as const
    case "confirmed":
      return ["arrive", "reschedule", "cancel", "mark_no_show"] as const
    case "arrived":
      return ["start", "cancel"] as const
    case "in_service":
      return ["complete"] as const
    default:
      return [] as const
  }
}

export function evaluateServiceCommerceBookingSlot(input: {
  availability: {
    exceptions?: ServiceCommerceBookingAvailabilityException[]
    rules: ServiceCommerceBookingAvailabilityRule[]
    timezone: string
  }
  bookings: Array<{
    endAt: Date
    quantity: number
    startAt: Date
    status: ServiceCommerceBookingStatus
  }>
  capacity: number
  endAt: Date
  holds: Array<{
    endAt: Date
    expiresAt: Date
    quantity: number
    startAt: Date
    status: "active" | "confirmed" | "expired" | "released"
  }>
  leadTimeMinutes: number
  now?: Date
  startAt: Date
}):
  | {
      eligible: false
      reason:
        | "capacity_exhausted"
        | "ambiguous_exception"
        | "exception_closed"
        | "lead_time"
        | "outside_availability"
        | "invalid_slot"
      remainingCapacity: 0
    }
  | { eligible: true; remainingCapacity: number } {
  const slot = { endAt: input.endAt, startAt: input.startAt }
  const now = input.now ?? new Date()
  if (
    ![slot.startAt, slot.endAt, now].every(
      (value) => value instanceof Date && Number.isFinite(value.getTime()),
    ) ||
    slot.endAt <= slot.startAt
  ) {
    return { eligible: false, reason: "invalid_slot", remainingCapacity: 0 }
  }
  if (slot.startAt.getTime() < now.getTime() + input.leadTimeMinutes * 60_000) {
    return { eligible: false, reason: "lead_time", remainingCapacity: 0 }
  }
  const matchingExceptions = (input.availability.exceptions ?? []).filter(
    (exception) => overlaps(slot, exception),
  )
  if (matchingExceptions.some((exception) => exception.kind === "closed")) {
    return { eligible: false, reason: "exception_closed", remainingCapacity: 0 }
  }
  const capacityOverrides = matchingExceptions.filter(
    (exception) => exception.kind === "capacity_override",
  )
  if (
    capacityOverrides.length > 1 &&
    new Set(capacityOverrides.map((exception) => exception.capacity)).size > 1
  ) {
    return {
      eligible: false,
      reason: "ambiguous_exception",
      remainingCapacity: 0,
    }
  }
  const effectiveCapacity = capacityOverrides[0]?.capacity ?? input.capacity
  if (
    !matchesAvailabilityRules(
      input.availability.rules,
      slot,
      input.availability.timezone,
      matchingExceptions.filter((exception) => exception.kind === "open"),
    )
  ) {
    return {
      eligible: false,
      reason: "outside_availability",
      remainingCapacity: 0,
    }
  }
  const bookedQuantity = input.bookings
    .filter(
      (booking) =>
        CONSUMING_BOOKING_STATUSES.has(booking.status) &&
        overlaps(slot, booking),
    )
    .reduce((total, booking) => total + booking.quantity, 0)
  const heldQuantity = input.holds
    .filter(
      (hold) =>
        hold.status === "active" &&
        hold.expiresAt > now &&
        overlaps(slot, hold),
    )
    .reduce((total, hold) => total + hold.quantity, 0)
  const remainingCapacity = Math.max(
    0,
    effectiveCapacity - bookedQuantity - heldQuantity,
  )
  return remainingCapacity > 0
    ? { eligible: true, remainingCapacity }
    : { eligible: false, reason: "capacity_exhausted", remainingCapacity: 0 }
}

export function isServiceCommerceCustomerBookingCapabilityUsable(input: {
  capability: ServiceCommerceBookingCustomerCapability
  currentStateRevision: number
  now?: Date
  purpose: ServiceCommerceBookingCustomerCapability["purpose"]
}) {
  const now = input.now ?? new Date()
  return (
    input.capability.expiresAt > now &&
    input.capability.purpose === input.purpose &&
    input.capability.revokedAt === null &&
    input.capability.stateRevision === input.currentStateRevision
  )
}

export function projectServiceCommerceBookingCancellationConsequence(input: {
  bookingId: string
  cancellationAllowed: boolean
  policy: "full_before_cutoff" | "manual_review" | "none"
  refundableAmountMinor: number
  stateRevision: number
}): ServiceCommerceBookingCancellationConsequence {
  const refundOutcome =
    !input.cancellationAllowed || input.policy === "none"
      ? "none"
      : input.policy === "manual_review"
        ? "manual_review"
        : "refund_eligible"
  return {
    bookingId: input.bookingId,
    cancellationAllowed: input.cancellationAllowed,
    refundAmountMinor:
      refundOutcome === "refund_eligible" ? input.refundableAmountMinor : null,
    refundOutcome,
    stateRevision: input.stateRevision,
  }
}

export function projectServiceCommerceBookingNotificationIntent(input: {
  bookingId: string
  event: "cancelled" | "confirmed" | "reminder" | "rescheduled"
  scheduledEndAt: Date
  scheduledStartAt: Date
  stateRevision: number
  storeId: string
  tenantId: string
}): ServiceCommerceBookingNotificationIntent {
  const kindByEvent = {
    cancelled: "booking_cancellation",
    confirmed: "booking_confirmation",
    reminder: "booking_reminder",
    rescheduled: "booking_change",
  } as const
  return {
    bookingId: input.bookingId,
    kind: kindByEvent[input.event],
    scheduledEndAt: input.scheduledEndAt,
    scheduledStartAt: input.scheduledStartAt,
    stateRevision: input.stateRevision,
    storeId: input.storeId,
    tenantId: input.tenantId,
  }
}
