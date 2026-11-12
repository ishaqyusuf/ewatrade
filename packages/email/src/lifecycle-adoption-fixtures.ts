import type { LifecycleTemplateInput } from "../templates/lifecycle-adoption"

/** Shared links and names for lifecycle email previews (gallery 21–29). */
const base = {
  businessName: "Amina Home & Trade",
  firstName: "Amina",
  ctaHref: "https://app.ewatrade.com/go/preview-token",
  unsubscribeUrl: "https://app.ewatrade.com/email-preferences?token=preview",
  preferencesUrl: "https://app.ewatrade.com/account",
} satisfies Omit<LifecycleTemplateInput, "data">

/** Play decision data per template key, as the sweep would produce it. */
export const lifecycleAdoptionPreviews = {
  "lifecycle-first-sale": { ...base, data: { catalogItems: 6 } },
  "lifecycle-assistant-channel": { ...base, data: { ordersTotal: 9 } },
  "lifecycle-site-setup": { ...base, data: { catalogItems: 12 } },
  "lifecycle-custom-domain": { ...base, data: { catalogItems: 12 } },
  "lifecycle-money-accounts": {
    ...base,
    data: { ordersTotal: 27, moneyAccounts: 1 },
  },
  "lifecycle-staff": {
    ...base,
    data: { ordersThisMonth: 34, activeDays28: 25 },
  },
  "lifecycle-monthly-report": {
    ...base,
    data: {
      reportMonth: "2026-10",
      ordersLastMonth: 48,
      salesMinorLastMonth: 21_350_000,
      currencyCode: "NGN",
    },
  },
  "lifecycle-at-risk": {
    ...base,
    data: { inactiveDays: 12, ordersTotal: 63, catalogItems: 14 },
  },
  "lifecycle-win-back": {
    ...base,
    data: { inactiveDays: 34, ordersTotal: 21 },
  },
} satisfies Record<string, LifecycleTemplateInput>

export type LifecycleAdoptionPreviewKey = keyof typeof lifecycleAdoptionPreviews
