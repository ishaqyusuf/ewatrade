import type { LifecyclePlay } from "../../contract"
import { ADOPTION_CTA, daysSince } from "./shared"

export const CUSTOM_DOMAIN_MIN_DAYS = 14

/**
 * P05: site live for 14+ days and still on the free address. The plan's "with
 * visits" is dropped: no storefront visit data exists. Keep P05 off the
 * rollout allowlist while Website & domain is held back.
 */
export const customDomainPlay: LifecyclePlay = {
  id: "P05_custom_domain",
  family: "adoption",
  consent: "productTips",
  channels: ["email"],
  realtime: false,
  eligible: ({ now, snapshot }) => {
    if (!snapshot.storefrontPublished || snapshot.customDomain) return null
    const publishedAt = snapshot.storefrontPublishedAt
    if (!publishedAt) return null
    const liveDays = daysSince(publishedAt, now)
    if (liveDays < CUSTOM_DOMAIN_MIN_DAYS) return null
    return {
      periodKey: "once",
      templateKey: "lifecycle-custom-domain",
      data: { catalogItems: snapshot.catalogItems, liveDays },
      ctaPath: ADOPTION_CTA.domains,
    }
  },
  success: {
    windowDays: 14,
    achieved: (_sentOn, current) => current.customDomain,
  },
}
