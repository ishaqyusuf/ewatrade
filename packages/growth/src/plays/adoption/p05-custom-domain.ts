import type { LifecyclePlay } from "../../contract"
import { ADOPTION_CTA, daysSince } from "./shared"

export const CUSTOM_DOMAIN_MIN_DAYS = 14

/**
 * P05: site live for 14+ days and still on the free address. The snapshot has
 * no publish date or visit count yet, so "live 14+ days" is read as: published
 * a week ago too, and the business is 14+ days old. Keep P05 off the rollout
 * allowlist while Website & domain is held back.
 */
export const customDomainPlay: LifecyclePlay = {
  id: "P05_custom_domain",
  family: "adoption",
  consent: "productTips",
  channels: ["email"],
  realtime: false,
  eligible: ({ now, snapshot, weekAgo }) => {
    if (!snapshot.storefrontPublished || snapshot.customDomain) return null
    if (!weekAgo?.storefrontPublished) return null
    if (daysSince(snapshot.businessCreatedAt, now) < CUSTOM_DOMAIN_MIN_DAYS)
      return null
    return {
      periodKey: "once",
      templateKey: "lifecycle-custom-domain",
      data: { catalogItems: snapshot.catalogItems },
      ctaPath: ADOPTION_CTA.domains,
    }
  },
  success: {
    windowDays: 14,
    achieved: (_sentOn, current) => current.customDomain,
  },
}
