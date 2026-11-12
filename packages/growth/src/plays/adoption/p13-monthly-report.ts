import { type LifecyclePlay, monthKey } from "../../contract"
import { ADOPTION_CTA, isHabitOrLater } from "./shared"

/** Sweep catch-up: day 1 is the target, days 2–3 cover a missed run. */
export const MONTHLY_REPORT_LAST_SEND_DAY = 3

/** P13: day 1 of each month, Habit stage and above, last month's numbers. */
export const monthlyReportPlay: LifecyclePlay = {
  id: "P13_monthly_report",
  family: "retention",
  consent: "monthlyReport",
  channels: ["email"],
  realtime: false,
  eligible: ({ now, snapshot }) => {
    if (now.getUTCDate() > MONTHLY_REPORT_LAST_SEND_DAY) return null
    if (!isHabitOrLater(snapshot.stage)) return null
    if (snapshot.ordersLastMonth === 0) return null
    const reportMonth = monthKey(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
    )
    return {
      periodKey: reportMonth,
      templateKey: "lifecycle-monthly-report",
      data: {
        reportMonth,
        ordersLastMonth: snapshot.ordersLastMonth,
        salesMinorLastMonth: Number(snapshot.salesMinorLastMonth),
        currencyCode: snapshot.currencyCode,
      },
      ctaPath: ADOPTION_CTA.reports,
    }
  },
  // Plan: open rate, with retention as the proxy. Active in the window counts.
  success: {
    windowDays: 7,
    achieved: (_sentOn, current) => current.ordersLast7 > 0,
  },
}
