import type {
  CustomerChannelConnection,
  CustomerChannelRecommendation,
} from "./types"

/** Plain words for the values the Customer channels page shows. */

export const CONNECTION_READINESS_LABELS: Record<
  CustomerChannelConnection["readiness"],
  string
> = {
  blocked: "Blocked",
  configuration_required: "Needs settings",
  ready: "Ready",
  test_required: "Needs a test",
}

export const CONNECTION_LIFECYCLE_LABELS: Record<
  CustomerChannelConnection["lifecycle"],
  string
> = {
  active: "Live",
  pending: "Not live yet",
  revoked: "Removed",
  suspended: "Paused",
}

export function connectionStoresLabel(stores: Array<{ name: string }>) {
  if (stores.length === 0) return "Not used by any store yet"
  const names = stores.map((store) => store.name)
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
  return `Used by ${list}`
}

export type ConversationMode = "both" | "ewatrade_chat" | "whatsapp"

export const CONVERSATION_MODE_OPTIONS: Array<{
  description: string
  label: string
  value: ConversationMode
}> = [
  {
    description: "Your WhatsApp number.",
    label: "WhatsApp",
    value: "whatsapp",
  },
  {
    description: "The chat on your store link.",
    label: "EwaTrade chat",
    value: "ewatrade_chat",
  },
  { description: "Customers pick either one.", label: "Both", value: "both" },
]

export function conversationModeLabel(value: string) {
  if (value === "ewatrade_chat") return "EwaTrade chat"
  if (value === "whatsapp") return "WhatsApp"
  if (value === "both") return "WhatsApp and EwaTrade chat"
  return "Not available"
}

const QUOTE_SOURCE_LABELS = {
  commerce_inquiry: "Customer enquiry",
  prescription: "Prescription",
  service: "Service request",
} as const

export function quoteSourceLabel(sourceKind: string) {
  return (
    QUOTE_SOURCE_LABELS[sourceKind as keyof typeof QUOTE_SOURCE_LABELS] ??
    "Quote"
  )
}

export function peopleCount(count: number) {
  if (count === 0) return "No one yet"
  return count === 1 ? "1 person" : `${count} people`
}

/** The onboarding suggestion as one short sentence. */
export function channelRecommendationSummary(
  recommendation: CustomerChannelRecommendation,
) {
  const whatsapp = recommendation.recommendedChannels.includes("whatsapp")
  const web = recommendation.recommendedChannels.includes("web")
  const reach = whatsapp
    ? recommendation.connectionMode === "central_with_branch_choice"
      ? "one WhatsApp number for all your stores"
      : "one WhatsApp number for each store"
    : web
      ? "chat on your store link"
      : "a way for customers to reach you"
  const replies =
    recommendation.attendantMode === "team_attendants"
      ? "your team replies"
      : "you reply"
  const pharmacy = recommendation.policyReviewRequired
    ? " Pharmacy stores also need the pharmacy compliance check."
    : ""
  return `Suggested when you signed up: ${reach}, and ${replies}. This is only a suggestion; nothing is turned on.${pharmacy}`
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
// Shown Monday first.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function formatMinute(minute: number) {
  const value = minute % 1440
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  const suffix = hours < 12 ? "am" : "pm"
  const hour = hours % 12 === 0 ? 12 : hours % 12
  return `${hour}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}${suffix}`
}

/** "Mon–Fri, 8am–6pm" style summary of the weekly chat hours. */
export function chatHoursSummary(
  intervals: Array<{
    dayOfWeek: number
    endMinute: number
    startMinute: number
  }>,
) {
  if (intervals.length === 0) return "Closed every day"
  const signature = (day: number) =>
    intervals
      .filter((interval) => interval.dayOfWeek === day)
      .sort((left, right) => left.startMinute - right.startMinute)
      .map((interval) =>
        interval.startMinute === 0 && interval.endMinute === 1440
          ? "all day"
          : `${formatMinute(interval.startMinute)}–${interval.endMinute === 1440 ? "midnight" : formatMinute(interval.endMinute)}`,
      )
      .join(", ")

  const groups: Array<{ days: number[]; hours: string }> = []
  for (const day of DAY_ORDER) {
    const hours = signature(day)
    if (!hours) continue
    const last = groups.at(-1)
    const previousDay = DAY_ORDER[DAY_ORDER.indexOf(day) - 1]
    if (last && last.hours === hours && last.days.at(-1) === previousDay) {
      last.days.push(day)
    } else {
      groups.push({ days: [day], hours })
    }
  }
  if (groups.length > 3) {
    const openDays = new Set(intervals.map((interval) => interval.dayOfWeek))
    return `Open ${openDays.size} days a week`
  }
  const everyDay = groups.length === 1 && groups[0]?.days.length === 7
  if (everyDay) {
    const hours = groups[0]?.hours ?? ""
    return hours === "all day" ? "All day, every day" : `Every day, ${hours}`
  }
  return groups
    .map((group) => {
      const first = DAY_SHORT[group.days[0] ?? 0]
      const last = DAY_SHORT[group.days.at(-1) ?? 0]
      const days =
        group.days.length === 1
          ? first
          : group.days.length === 2
            ? `${first} and ${last}`
            : `${first}–${last}`
      return `${days}, ${group.hours}`
    })
    .join(" · ")
}
