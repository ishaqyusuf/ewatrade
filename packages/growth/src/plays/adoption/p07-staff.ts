import type { LifecyclePlay } from "../../contract"
import { ADOPTION_CTA, isPaidPlan } from "./shared"

export const STAFF_MIN_ORDERS_THIS_MONTH = 30
/** 6+ days a week over the last 4 weeks. */
export const STAFF_MIN_ACTIVE_DAYS_28 = 24

/**
 * P07: busy owner with no staff. With 0 staff the owner records every order,
 * so "records 90% of orders while working 6+ days a week" reduces to the
 * active-days test. Staff accounts are a paid feature.
 */
export const staffPlay: LifecyclePlay = {
  id: "P07_staff",
  family: "adoption",
  consent: "productTips",
  channels: ["email"],
  realtime: false,
  eligible: ({ snapshot }) => {
    if (!isPaidPlan(snapshot) || snapshot.staffCount > 0) return null
    const busyMonth = snapshot.ordersThisMonth >= STAFF_MIN_ORDERS_THIS_MONTH
    const everyDay = snapshot.activeDays28 >= STAFF_MIN_ACTIVE_DAYS_28
    if (!busyMonth && !everyDay) return null
    return {
      periodKey: "once",
      templateKey: "lifecycle-staff",
      data: {
        ordersThisMonth: snapshot.ordersThisMonth,
        activeDays28: snapshot.activeDays28,
      },
      ctaPath: ADOPTION_CTA.staffInvite,
    }
  },
  success: {
    windowDays: 14,
    achieved: (_sentOn, current) => current.staffCount > 0,
  },
}
