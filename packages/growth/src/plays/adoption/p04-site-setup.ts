import type { LifecyclePlay } from "../../contract"
import { ADOPTION_CTA } from "./shared"

export const SITE_SETUP_MIN_ITEMS = 5

/** P04: 5+ items and no published storefront. */
export const siteSetupPlay: LifecyclePlay = {
  id: "P04_site_setup",
  family: "adoption",
  consent: "productTips",
  channels: ["email", "in_app"],
  realtime: false,
  eligible: ({ snapshot }) => {
    if (snapshot.stage === "dormant") return null
    if (snapshot.storefrontPublished) return null
    if (snapshot.catalogItems < SITE_SETUP_MIN_ITEMS) return null
    return {
      periodKey: "once",
      templateKey: "lifecycle-site-setup",
      inAppKey: "site_setup",
      data: { catalogItems: snapshot.catalogItems },
      ctaPath: ADOPTION_CTA.sitePublish,
    }
  },
  success: {
    windowDays: 14,
    achieved: (_sentOn, current) => current.storefrontPublished,
  },
}
