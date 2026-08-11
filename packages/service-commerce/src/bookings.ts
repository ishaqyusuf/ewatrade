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

function localSlotParts(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ""
  return {
    minuteOfDay: Number(part("hour")) * 60 + Number(part("minute")),
    weekday: WEEKDAYS[part("weekday")] ?? -1,
  }
}

function localTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

function matchesAvailabilityRule(
  rules: ServiceCommerceBookingAvailabilityRule[],
  slot: { endAt: Date; startAt: Date },
  timezone: string,
) {
  if (rules.length === 0) return true
  const start = localSlotParts(slot.startAt, timezone)
  const end = localSlotParts(slot.endAt, timezone)
  if (start.weekday !== end.weekday) return false
  return rules.some(
    (rule) =>
      rule.daysOfWeek.includes(start.weekday) &&
      start.minuteOfDay >= localTimeToMinutes(rule.startLocalTime) &&
      end.minuteOfDay <= localTimeToMinutes(rule.endLocalTime),
  )
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
  if (slot.endAt <= slot.startAt) {
    return { eligible: false, reason: "invalid_slot", remainingCapacity: 0 }
  }
  const now = input.now ?? new Date()
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
  const hasOpenException = matchingExceptions.some(
    (exception) => exception.kind === "open",
  )
  if (
    !matchesAvailabilityRule(
      input.availability.rules,
      slot,
      input.availability.timezone,
    ) &&
    !hasOpenException
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
