import type { LifecycleTemplateInput } from "../templates/lifecycle-adoption"

/** Shared links and names for lifecycle email previews (gallery 30–36). */
const base = {
  businessName: "Amina Home & Trade",
  firstName: "Amina",
  ctaHref: "https://app.ewatrade.com/go/preview-token",
  unsubscribeUrl: "https://app.ewatrade.com/email-preferences?token=preview",
  preferencesUrl: "https://app.ewatrade.com/account",
} satisfies Omit<LifecycleTemplateInput, "data">

const starter = {
  recommendedPlanId: "starter",
  recommendedPlanName: "Starter",
  recommendedPriceLabel: "₦5,000/month",
  checkoutAvailable: true,
  ctaLabel: "Upgrade to Starter",
}

/**
 * Play decision data per template key, as packages/growth/src/plays/revenue
 * produces it (the growth tests pin the same values).
 */
export const lifecycleRevenuePreviews = {
  "lifecycle-limit-warning": {
    ...base,
    data: {
      ...starter,
      limit: "ordersPerMonth",
      stage: 90,
      used: 45,
      cap: 50,
      left: 5,
      noun: "orders a month",
      planName: "Free",
      recommendedLimitLabel: "unlimited orders a month",
      resetsOn: "1 Dec",
    },
  },
  "lifecycle-limit-reached": {
    ...base,
    data: {
      ...starter,
      limit: "products",
      stage: 100,
      used: 10,
      cap: 10,
      left: 0,
      noun: "products",
      planName: "Free",
      recommendedLimitLabel: "100 products",
      resetsOn: null,
    },
  },
  "lifecycle-success-milestone": {
    ...base,
    data: {
      milestone: "sales_3x",
      ordersTotal: 212,
      ordersThisMonth: 61,
      salesThisMonth: "₦450,000",
      bestPriorMonth: "₦400,000",
      usualMonth: "₦150,000",
      nextPlanLine:
        "Growth adds 1,000 products, 10 staff accounts and 3 businesses, plus customer messages.",
      recommendedPlanId: "growth",
      recommendedPlanName: "Growth",
      recommendedPriceLabel: "₦15,000/month",
      checkoutAvailable: true,
      ctaLabel: "Upgrade to Growth",
    },
  },
  "lifecycle-second-business": {
    ...base,
    data: {
      ordersLast7: 118,
      planName: "Starter",
      needsUpgrade: true,
      businessesIncluded: 3,
      recommendedPlanId: "growth",
      recommendedPlanName: "Growth",
      recommendedPriceLabel: "₦15,000/month",
      checkoutAvailable: true,
      ctaLabel: "Upgrade to Growth",
    },
  },
  "lifecycle-feature-intent": {
    ...base,
    data: {
      ...starter,
      feature: "attachments",
      featureLabel: "Photos, videos and documents",
      taps: 3,
      planName: "Free",
    },
  },
  "lifecycle-whatsapp-warning": {
    ...base,
    data: {
      used: 160,
      cap: 200,
      left: 40,
      resetsOn: "1 Dec",
      planName: "Free",
      offers: "upgrade_starter,telegram",
      starterReplies: 1000,
      starterMultiple: 5,
      starterPriceLabel: "₦5,000/month",
      telegramLinked: false,
      telegramPath: "/account/telegram",
      checkoutAvailable: true,
      ctaLabel: "Upgrade to Starter",
    },
  },
  "lifecycle-whatsapp-exhausted": {
    ...base,
    data: {
      used: 1000,
      cap: 1000,
      left: 0,
      resetsOn: "1 Dec",
      planName: "Growth",
      offers: "telegram",
      starterReplies: 1000,
      starterMultiple: 5,
      starterPriceLabel: "₦5,000/month",
      telegramLinked: false,
      telegramPath: "/account/telegram",
      checkoutAvailable: true,
      ctaLabel: "Connect Telegram",
    },
  },
} satisfies Record<string, LifecycleTemplateInput>

export type LifecycleRevenuePreviewKey = keyof typeof lifecycleRevenuePreviews
