import type { LifecyclePlay } from "../../contract"
import { ADOPTION_CTA, activeSince, daysInactive } from "./shared"

export const AT_RISK_MIN_INACTIVE_DAYS = 10

/** P14: was in Habit, now 10+ days without activity (stage `at_risk`). */
export const atRiskPlay: LifecyclePlay = {
  id: "P14_at_risk",
  family: "retention",
  consent: "productTips",
  channels: ["email"],
  realtime: false,
  eligible: ({ now, snapshot }) => {
    if (snapshot.stage !== "at_risk" || !snapshot.lastActiveAt) return null
    const inactiveDays = daysInactive(snapshot, now)
    if (inactiveDays < AT_RISK_MIN_INACTIVE_DAYS) return null
    return {
      // One nudge per quiet spell: a new spell starts after new activity.
      periodKey: `since:${snapshot.lastActiveAt.toISOString().slice(0, 10)}`,
      templateKey: "lifecycle-at-risk",
      data: {
        inactiveDays,
        ordersTotal: snapshot.ordersTotal,
        catalogItems: snapshot.catalogItems,
      },
      ctaPath: ADOPTION_CTA.home,
    }
  },
  success: { windowDays: 7, achieved: activeSince },
}
