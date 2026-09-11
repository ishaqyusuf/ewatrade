import type {
  StoreConversationAvailabilityRecovery,
  StoreConversationCustomerWording,
  StoreConversationPublicAvailabilityReason,
  StoreConversationServiceInterval,
} from "./schemas/store-conversation-availability"

export const DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS: StoreConversationServiceInterval[] =
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    endMinute: 1_440,
    startMinute: 0,
  }))

export type StoreConversationAvailabilityProjection = {
  available: boolean
  customerMessage: string | null
  reason: StoreConversationPublicAvailabilityReason | null
  recovery: StoreConversationAvailabilityRecovery[]
  reopensAt: Date | null
  state: "available" | "unavailable_indefinitely" | "unavailable_until"
}

export type StoreConversationAvailabilitySettingsProjection = {
  customerWording: StoreConversationCustomerWording
  manualPaused: boolean
  pausedAt: Date | null
  revision: number
  timezone: string
  unreadNotificationGraceSeconds: number
  weeklyHours: StoreConversationServiceInterval[]
}

type ZonedParts = {
  day: number
  dayOfWeek: number
  hour: number
  minute: number
  month: number
  year: number
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function zonedParts(value: Date, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
  }).formatToParts(value)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  return {
    day: Number(get("day")),
    dayOfWeek: WEEKDAYS.indexOf(get("weekday")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    month: Number(get("month")),
    year: Number(get("year")),
  }
}

function localEpoch(parts: Omit<ZonedParts, "dayOfWeek">) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  )
}

function sameLocalMinute(
  value: Date,
  timezone: string,
  target: Omit<ZonedParts, "dayOfWeek">,
) {
  const actual = zonedParts(value, timezone)
  return (
    actual.year === target.year &&
    actual.month === target.month &&
    actual.day === target.day &&
    actual.hour === target.hour &&
    actual.minute === target.minute
  )
}

function instantsForLocalMinute(
  target: Omit<ZonedParts, "dayOfWeek">,
  timezone: string,
) {
  const targetEpoch = localEpoch(target)
  const offsets = new Set<number>()
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = new Date(targetEpoch + hours * 60 * 60_000)
    const local = zonedParts(sample, timezone)
    offsets.add(
      localEpoch({
        day: local.day,
        hour: local.hour,
        minute: local.minute,
        month: local.month,
        year: local.year,
      }) - sample.getTime(),
    )
  }
  return [...offsets]
    .map((offset) => new Date(targetEpoch - offset))
    .filter((value) => sameLocalMinute(value, timezone, target))
    .sort((left, right) => left.getTime() - right.getTime())
}

function addLocalDays(parts: ZonedParts, days: number) {
  const value = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  )
  return {
    day: value.getUTCDate(),
    dayOfWeek: value.getUTCDay(),
    month: value.getUTCMonth() + 1,
    year: value.getUTCFullYear(),
  }
}

function nextScheduleOpening(input: {
  now: Date
  timezone: string
  weeklyHours: StoreConversationServiceInterval[]
}) {
  const nowLocal = zonedParts(input.now, input.timezone)
  for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
    const date = addLocalDays(nowLocal, dayOffset)
    const intervals = input.weeklyHours
      .filter((interval) => interval.dayOfWeek === date.dayOfWeek)
      .sort((left, right) => left.startMinute - right.startMinute)
    for (const interval of intervals) {
      const currentMinute = nowLocal.hour * 60 + nowLocal.minute
      if (dayOffset === 0 && interval.startMinute <= currentMinute) continue
      for (
        let minute = interval.startMinute;
        minute < interval.endMinute;
        minute += 1
      ) {
        const candidates = instantsForLocalMinute(
          {
            day: date.day,
            hour: Math.floor(minute / 60),
            minute: minute % 60,
            month: date.month,
            year: date.year,
          },
          input.timezone,
        )
        const future = candidates.find(
          (candidate) => candidate.getTime() > input.now.getTime(),
        )
        if (future) return future
      }
    }
  }
  return null
}

function safeCustomerMessage(
  reason: StoreConversationPublicAvailabilityReason,
  wording: StoreConversationCustomerWording,
) {
  if (reason === "outside_service_hours") {
    return "The Store is outside its chat service hours."
  }
  void wording
  return "The Store is not accepting new chat messages right now."
}

export function evaluateStoreConversationAvailability(input: {
  chatEnabled: boolean
  customerWording?: StoreConversationCustomerWording
  eligibleAttendant: boolean
  eligibleVerticals: readonly ("pharmacy" | "service")[]
  manualPaused: boolean
  now: Date
  profileReady: boolean
  timezone: string
  weeklyHours: StoreConversationServiceInterval[]
}): StoreConversationAvailabilityProjection {
  const wording = input.customerWording ?? "temporarily_unavailable"
  const local = zonedParts(input.now, input.timezone)
  const minute = local.hour * 60 + local.minute
  const insideHours = input.weeklyHours.some(
    (interval) =>
      interval.dayOfWeek === local.dayOfWeek &&
      interval.startMinute <= minute &&
      minute < interval.endMinute,
  )
  let reason: StoreConversationPublicAvailabilityReason | null = null
  if (input.manualPaused) reason = "store_temporarily_unavailable"
  else if (!input.chatEnabled || !input.profileReady)
    reason = "chat_unavailable"
  else if (!input.eligibleAttendant) reason = "team_unavailable"
  else if (input.eligibleVerticals.length === 0) reason = "service_unavailable"
  else if (!insideHours) reason = "outside_service_hours"
  if (!reason) {
    return {
      available: true,
      customerMessage: null,
      reason: null,
      recovery: [],
      reopensAt: null,
      state: "available",
    }
  }
  const reopensAt =
    reason === "outside_service_hours"
      ? nextScheduleOpening({
          now: input.now,
          timezone: input.timezone,
          weeklyHours: input.weeklyHours,
        })
      : null
  return {
    available: false,
    customerMessage: safeCustomerMessage(reason, wording),
    reason,
    recovery: reopensAt
      ? ["view_history", "wait_until_reopen", "notify_when_available"]
      : ["view_history", "notify_when_available"],
    reopensAt,
    state: reopensAt ? "unavailable_until" : "unavailable_indefinitely",
  }
}
