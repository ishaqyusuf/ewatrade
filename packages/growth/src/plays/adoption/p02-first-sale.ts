import type { LifecyclePlay } from "../../contract"
import { ADOPTION_CTA, daysSince } from "./shared"

export const FIRST_SALE_MIN_ITEMS = 3
export const FIRST_SALE_MIN_DAYS = 2

/** P02: items are in, but no sale recorded 2 days after signup. */
export const firstSalePlay: LifecyclePlay = {
  id: "P02_first_sale",
  family: "adoption",
  consent: "productTips",
  channels: ["email", "in_app"],
  realtime: false,
  eligible: ({ now, snapshot }) => {
    if (snapshot.stage === "dormant") return null
    if (snapshot.catalogItems < FIRST_SALE_MIN_ITEMS) return null
    if (snapshot.ordersTotal > 0) return null
    if (daysSince(snapshot.businessCreatedAt, now) < FIRST_SALE_MIN_DAYS)
      return null
    return {
      periodKey: "once",
      templateKey: "lifecycle-first-sale",
      inAppKey: "first_sale",
      data: { catalogItems: snapshot.catalogItems },
      ctaPath: ADOPTION_CTA.newSale,
    }
  },
  success: {
    windowDays: 7,
    achieved: (_sentOn, current) => current.ordersTotal > 0,
  },
}
