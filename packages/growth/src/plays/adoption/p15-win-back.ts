import type { LifecyclePlay } from "../../contract"
import { ADOPTION_CTA, activeSince, daysInactive } from "./shared"

export const WIN_BACK_MIN_INACTIVE_DAYS = 30

/** P15: 30+ days dormant. Sent once per business, ever. */
export const winBackPlay: LifecyclePlay = {
  id: "P15_win_back",
  family: "retention",
  consent: "productTips",
  channels: ["email"],
  realtime: false,
  eligible: ({ now, snapshot }) => {
    if (snapshot.stage !== "dormant") return null
    const inactiveDays = daysInactive(snapshot, now)
    if (inactiveDays < WIN_BACK_MIN_INACTIVE_DAYS) return null
    return {
      periodKey: "once",
      templateKey: "lifecycle-win-back",
      data: { inactiveDays, ordersTotal: snapshot.ordersTotal },
      ctaPath: ADOPTION_CTA.home,
    }
  },
  success: { windowDays: 14, achieved: activeSince },
}
