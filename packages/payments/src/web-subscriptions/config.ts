import { z } from "zod"
import { webMonthlyPriceReference } from "./pricing"

export const paidPlanSchema = z.enum(["starter", "growth", "pro"])
export type WebPlanId = z.infer<typeof paidPlanSchema>
export type WebBillingProvider = "paystack"
export type WebBillingEnvironment = "sandbox" | "production"
export type BillingEnvironment = Record<string, string | undefined>

const webBillingProductSchema = z
  .object({
    provider: z.literal("paystack"),
    planId: paidPlanSchema,
    productId: z.string().trim().min(1).max(160),
    currency: z.enum(["NGN", "USD"]),
    amountMinor: z.number().int().positive().max(99_999_999),
    referenceNgnMinor: z.number().int().positive(),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
  })
  .strict()
export type WebBillingProduct = z.infer<typeof webBillingProductSchema>

export function webBillingProducts(env: BillingEnvironment = process.env) {
  let raw: unknown
  try {
    raw = JSON.parse(env.WEB_BILLING_PRODUCTS ?? "")
  } catch {
    return []
  }
  const parsed = z.array(webBillingProductSchema).min(1).safeParse(raw)
  if (!parsed.success) return []
  const ids = new Set<string>()
  const countryPlans = new Set<string>()
  for (const product of parsed.data) {
    const identity = `${product.provider}:${product.productId}`
    if (
      ids.has(identity) ||
      new Set(product.countries).size !== product.countries.length
    )
      return []
    ids.add(identity)
    for (const country of product.countries) {
      const reference = webMonthlyPriceReference(product.planId, country)
      const key = `${country}:${product.planId}`
      if (
        !reference ||
        product.referenceNgnMinor !== reference.amountMinor ||
        countryPlans.has(key)
      )
        return []
      countryPlans.add(key)
    }
    if (!/^PLN_[A-Za-z0-9]+$/.test(product.productId)) return []
    if (
      product.currency === "NGN" &&
      product.amountMinor !== product.referenceNgnMinor
    )
      return []
    // A saved USD quote is not permission to use an unapproved settlement account.
    if (
      product.currency === "USD" &&
      (product.countries.includes("NG") || env.PAYSTACK_USD_ENABLED !== "true")
    )
      return []
  }
  return parsed.data
}

export function webBillingEnvironment(
  env: BillingEnvironment = process.env,
): WebBillingEnvironment | null {
  const value = env.WEB_BILLING_ENVIRONMENT
  return value === "sandbox" || value === "production" ? value : null
}

/** Territory must come from verified billing context, never locale/IP/GPS. */
export function webBillingProduct(
  planId: WebPlanId,
  country: string | null,
  env: BillingEnvironment = process.env,
) {
  if (!country || !/^[A-Z]{2}$/.test(country)) return null
  const provider = "paystack"
  const matches = webBillingProducts(env).filter(
    (p) =>
      p.provider === provider &&
      p.planId === planId &&
      p.countries.includes(country),
  )
  return matches.length === 1 ? (matches[0] ?? null) : null
}

export function isWebProviderConfigured(
  provider: WebBillingProvider,
  env: BillingEnvironment = process.env,
) {
  const environment = webBillingEnvironment(env)
  if (!environment) return false
  return (
    provider === "paystack" &&
    Boolean(
      env.PAYSTACK_SUBSCRIPTION_SECRET_KEY?.startsWith(
        environment === "production" ? "sk_live_" : "sk_test_",
      ),
    )
  )
}

export function isWebCheckoutEnabled(env: BillingEnvironment = process.env) {
  const environment = webBillingEnvironment(env)
  return Boolean(
    environment &&
      env.WEB_BILLING_ENABLED === "true" &&
      env.WEB_BILLING_RECONCILIATION_ENABLED === "true" &&
      env.OWNER_BILLING_ENABLED === "true" &&
      env.STORE_BILLING_ENVIRONMENT === environment &&
      (environment !== "production" ||
        env.WEB_BILLING_RELEASE_APPROVED === "true") &&
      (env.APP_ENV !== "production" || environment === "production"),
  )
}

export function isWebReconciliationConfigured(
  env: BillingEnvironment = process.env,
) {
  const environment = webBillingEnvironment(env)
  return Boolean(
    environment &&
      isWebProviderConfigured("paystack", env) &&
      env.WEB_BILLING_RECONCILIATION_ENABLED === "true" &&
      env.OWNER_BILLING_ENABLED === "true" &&
      env.STORE_BILLING_ENVIRONMENT === environment &&
      (env.APP_ENV !== "production" || environment === "production"),
  )
}

/** Reviewed billing territories keyed by opaque owner account UUID; never request input. */
export function webBillingOwnerCountry(
  accountId: string,
  env: BillingEnvironment = process.env,
) {
  try {
    const countries = z
      .record(z.uuid(), z.string().regex(/^[A-Z]{2}$/))
      .parse(JSON.parse(env.WEB_BILLING_OWNER_COUNTRIES ?? ""))
    return countries[accountId] ?? null
  } catch {
    return null
  }
}
