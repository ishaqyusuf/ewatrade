import type { GrowthSnapshot, GrowthStage } from "../../contract"

const DAY_MS = 86_400_000

/** Whole UTC days from `from` to `now` (0 on the same instant, never negative). */
export function daysSince(from: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS))
}

/** Recorded a first order and stocked 3+ items, and still active. */
const ACTIVATED_OR_LATER: readonly GrowthStage[] = [
  "activated",
  "habit",
  "expanding",
  "paying",
]

/** Habit stage and above (plan §3, monthly value report). */
const HABIT_OR_LATER: readonly GrowthStage[] = ["habit", "expanding", "paying"]

export const isActivatedOrLater = (stage: GrowthStage) =>
  ACTIVATED_OR_LATER.includes(stage)

export const isHabitOrLater = (stage: GrowthStage) =>
  HABIT_OR_LATER.includes(stage)

/** Finance and staff are paid features; Free businesses get upgrade plays instead. */
export const isPaidPlan = (snapshot: GrowthSnapshot) =>
  snapshot.planId !== "free"

/** Days since the business last did anything, counting signup as activity. */
export function daysInactive(snapshot: GrowthSnapshot, now: Date) {
  return daysSince(snapshot.lastActiveAt ?? snapshot.businessCreatedAt, now)
}

/** Became active again after the message went out. */
export function activeSince(sentOn: GrowthSnapshot, current: GrowthSnapshot) {
  if (!current.lastActiveAt) return false
  if (!sentOn.lastActiveAt) return true
  return current.lastActiveAt.getTime() > sentOn.lastActiveAt.getTime()
}

/**
 * Dashboard paths each CTA opens (behind the signed `/go/:token` redirect).
 * Mobile maps the play's `inAppKey` to its own screen; see the Home card.
 */
export const ADOPTION_CTA = {
  newSale: "/?orderSheet=create",
  assistantChannel: "/account/whatsapp",
  sitePublish: "/storefront",
  domains: "/settings/domains",
  moneyAccounts: "/finance/accounts?financeSheet=account",
  staffInvite: "/staff?staffSheet=invite",
  reports: "/analytics",
  home: "/",
} as const
