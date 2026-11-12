// Business lifecycle stage (plan §3, stage table). Pure.
//
// Precedence, first match wins:
//   dormant   no activity for 30+ days
//   at_risk   was Habit or later, now 0 active days in the last 10
//   paying    on a paid plan with a paid subscription (billing live)
//   expanding at 80%+ of any finite plan limit
//   habit     activated and active on 8+ of the last 28 days
//   activated first order recorded and 3+ catalog items
//   signed_up everything else

import type { GrowthSnapshot, GrowthStage } from "./contract"

export const STAGE_RULES = {
  activatedMinItems: 3,
  habitMinActiveDays28: 8,
  atRiskInactiveDays: 10,
  dormantInactiveDays: 30,
  expandingLimitPressure: 0.8,
} as const

const SETTLED: ReadonlySet<GrowthStage> = new Set([
  "habit",
  "expanding",
  "paying",
  "at_risk",
])

export type StageInput = Pick<
  GrowthSnapshot,
  | "activeDays28"
  | "ordersTotal"
  | "catalogItems"
  | "limitPressure"
  | "lastActiveAt"
  | "businessCreatedAt"
> & {
  now: Date
  /** Yesterday's (most recent earlier) stage, or null for a first snapshot. */
  previousStage: GrowthStage | null
  /** A paid plan the business actually pays for (not the launch default). */
  paying: boolean
}

function daysSince(at: Date, now: Date) {
  return (now.getTime() - at.getTime()) / 86_400_000
}

export function computeStage(input: StageInput): GrowthStage {
  const lastSeen = input.lastActiveAt ?? input.businessCreatedAt
  const idleDays = daysSince(lastSeen, input.now)

  if (idleDays >= STAGE_RULES.dormantInactiveDays) return "dormant"
  if (
    input.previousStage &&
    SETTLED.has(input.previousStage) &&
    idleDays >= STAGE_RULES.atRiskInactiveDays
  )
    return "at_risk"
  if (input.paying) return "paying"
  if (
    Object.values(input.limitPressure).some(
      (pressure) =>
        typeof pressure === "number" &&
        pressure >= STAGE_RULES.expandingLimitPressure,
    )
  )
    return "expanding"

  const activated =
    input.ordersTotal > 0 && input.catalogItems >= STAGE_RULES.activatedMinItems
  if (!activated) return "signed_up"
  if (input.activeDays28 >= STAGE_RULES.habitMinActiveDays28) return "habit"
  return "activated"
}
