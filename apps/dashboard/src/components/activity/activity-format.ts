import { businessDay, shiftDay } from "@/hooks/use-activity-filter-params"
import type {
  BusinessActivityCategory,
  BusinessActivityView,
} from "@ewatrade/notifications/business-events"
import { formatFinanceMoney } from "@ewatrade/utils/finance-money"

export const ACTIVITY_CATEGORY_LABELS: Record<
  BusinessActivityCategory,
  string
> = {
  orders: "Orders",
  payments: "Payments",
  staff: "Staff",
  inventory: "Inventory",
  catalog: "Catalog",
  services: "Services",
  customers: "Customers",
  finance: "Finance",
  communications: "Messages",
  settings: "Settings",
  imports: "Imports",
}

export type ActivityDayGroup = {
  day: string
  title: string
  subtitle: string | null
  items: BusinessActivityView[]
}

/** Groups newest-first rows by the Business calendar day they happened. */
export function groupActivityByDay(
  items: BusinessActivityView[],
  timeZone: string,
  now: Date,
): ActivityDayGroup[] {
  const today = businessDay(now, timeZone)
  const yesterday = shiftDay(today, -1)
  const groups: ActivityDayGroup[] = []
  for (const item of items) {
    const day = businessDay(new Date(item.occurredAt), timeZone)
    let group = groups.at(-1)
    if (group?.day !== day) {
      const pretty = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
        ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
      }).format(new Date(item.occurredAt))
      group = {
        day,
        title:
          day === today ? "Today" : day === yesterday ? "Yesterday" : pretty,
        subtitle: day === today || day === yesterday ? pretty : null,
        items: [],
      }
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
}

export function formatActivityTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

export function formatActivityDateTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso))
}

/** Backdated or late-synced facts keep their original day and say so. */
export function wasRecordedLater(
  event: BusinessActivityView,
  timeZone: string,
) {
  return (
    businessDay(new Date(event.recordedAt), timeZone) !==
    businessDay(new Date(event.occurredAt), timeZone)
  )
}

export function formatActivityAmount(event: BusinessActivityView) {
  if (!event.amount) return null
  return formatFinanceMoney(event.amount.minor, event.amount.currencyCode)
}

export function isNegativeAmount(event: BusinessActivityView) {
  return Boolean(event.amount?.minor.startsWith("-"))
}

/**
 * Splits the server summary so the recorded actor's name can be emphasised.
 * Falls back to the plain summary; never invents an author.
 */
export function splitActivitySummary(event: BusinessActivityView) {
  const name = event.actor.coverage === "recorded" ? event.actor.name : null
  if (name && event.summary.startsWith(`${name} `))
    return { actor: name, rest: event.summary.slice(name.length) }
  return { actor: null, rest: event.summary }
}

/**
 * Row title without the author, who is shown in the subtitle instead:
 * "Ishaq recorded payment for ORD-031" → "Payment for ORD-031".
 */
export function activityTitle(event: BusinessActivityView) {
  const { actor, rest } = splitActivitySummary(event)
  const text = actor ? rest.trim().replace(/^recorded\s+/i, "") : event.summary
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Whether rows name their Store: only when the viewer can see several Stores
 * and isn't already filtered to exactly one. Unknown choices keep it shown.
 */
export function showActivityStore(
  storeChoices: number | null,
  selectedStores: number,
) {
  return (storeChoices === null || storeChoices > 1) && selectedStores !== 1
}

/** Who did it, for the subtitle; never guessed when not recorded. */
export function activityAuthor(
  event: BusinessActivityView,
  viewerMembershipId: string | null = null,
) {
  if (event.actor.coverage !== "recorded" || !event.actor.name)
    return "Unknown person"
  if (viewerMembershipId && event.actor.membershipId === viewerMembershipId)
    return "You"
  return event.actor.name
}

const NEGATIVE_STATUSES = new Set([
  "cancelled",
  "canceled",
  "reversed",
  "refunded",
  "declined",
  "failed",
  "voided",
])

export function activityStatusTone(value: string) {
  return NEGATIVE_STATUSES.has(value.toLowerCase()) ? "negative" : "neutral"
}

export function formatActivityStatus(value: string) {
  const text = value.replaceAll("_", " ").toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * True when the canonical command recorded the event through the AI assistant.
 * Record-time provenance only; a missing origin shows no flag, never a guess.
 */
export function recordedThroughAssistant(event: BusinessActivityView) {
  return event.origin?.channel === "assistant"
}

/** "STORE_MANAGER" → "Store manager"; null → "". */
export function formatRole(role: string | null) {
  return role ? formatActivityStatus(role) : ""
}
