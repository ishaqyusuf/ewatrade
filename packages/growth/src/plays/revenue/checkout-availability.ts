// Is Paystack web checkout live for this business? Mirrors the gates in
// apps/api/src/billing/web-subscriptions.ts (createWebSubscriptionCheckout)
// without reading or changing billing state:
//   checkout switched on + provider key for the environment
//   + a billing country (owner override, else a Nigerian business)
//   + international enabled outside Nigeria
//   + a Paystack product for every paid plan in that country.
// The engine sets `PlayContext.checkoutAvailable` from this. When it is false,
// upgrade CTAs open Plan and billing as is, never a dead checkout button.

import {
  type BillingEnvironment,
  type WebPlanId,
  isWebCheckoutEnabled,
  isWebProviderConfigured,
  webBillingCountry,
  webBillingProduct,
} from "@ewatrade/payments/web-subscriptions"

const PAID_PLANS: readonly WebPlanId[] = ["starter", "growth", "pro"]

export function isLifecycleCheckoutAvailable(
  input: {
    business: { countryCode: string | null; currencyCode: string | null }
    /** Owner billing account id, for the reviewed-country override. */
    billingAccountId?: string | null
  },
  env: BillingEnvironment = process.env,
) {
  if (!isWebCheckoutEnabled(env) || !isWebProviderConfigured("paystack", env))
    return false
  const country = webBillingCountry(
    { accountId: input.billingAccountId ?? "", business: input.business },
    env,
  )
  if (!country) return false
  if (country !== "NG" && env.PAYSTACK_INTERNATIONAL_ENABLED !== "true")
    return false
  return PAID_PLANS.every((planId) => webBillingProduct(planId, country, env))
}
