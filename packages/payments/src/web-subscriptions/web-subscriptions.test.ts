import { expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import type { WebBillingProduct } from "./config"
import {
  isWebCheckoutEnabled,
  isWebProviderConfigured,
  webBillingProduct,
  webBillingProducts,
} from "./config"
import { webMonthlyPriceReference } from "./pricing"
import {
  WebSubscriptionClient,
  hostedCheckoutUrl,
  verifyPaystackSubscriptionWebhook,
  verifyPolarSubscriptionWebhook,
} from "./providers"

const accountId = "5e882a1e-d161-44cc-844c-4c0e94410001"
const checkoutId = "5e882a1e-d161-44cc-844c-4c0e94410002"
const paystack: WebBillingProduct = {
  provider: "paystack",
  planId: "starter",
  productId: "PLN_starter",
  currency: "NGN",
  amountMinor: 500_000,
  referenceNgnMinor: 500_000,
  countries: ["NG"],
}
// Foreign amounts below are transport fixtures, not a published price schedule.
const polar: WebBillingProduct = {
  provider: "polar",
  planId: "starter",
  productId: "5e882a1e-d161-44cc-844c-4c0e94410003",
  currency: "USD",
  amountMinor: 400,
  referenceNgnMinor: 600_000,
  countries: ["US", "GB"],
}
const args = {
  accountId,
  checkoutId,
  email: "owner@example.test",
  returnUrl: "https://dash.ewatrade.com/settings/billing",
}
const env = { WEB_BILLING_PRODUCTS: JSON.stringify([paystack, polar]) }

test("reuses the approved monthly Africa baseline and 20% reference elsewhere", () => {
  for (const [plan, base] of [
    ["starter", 500_000],
    ["growth", 1_500_000],
    ["pro", 3_000_000],
  ] as const) {
    for (const country of ["NG", "KE", "GH", "ZA"])
      expect(webMonthlyPriceReference(plan, country)?.amountMinor).toBe(base)
    for (const country of ["US", "GB", "CA"])
      expect(webMonthlyPriceReference(plan, country)?.amountMinor).toBe(
        base * 1.2,
      )
  }
  for (const country of [null, "", "ZZ", "ng"])
    expect(webMonthlyPriceReference("starter", country)).toBeNull()
})

test("Nigeria selects Paystack; only explicitly mapped other territories select Polar", () => {
  expect(webBillingProduct("starter", "NG", env)).toEqual(paystack)
  expect(webBillingProduct("starter", "US", env)).toEqual(polar)
  expect(webBillingProduct("starter", "KE", env)).toBeNull()
  expect(webBillingProduct("starter", null, env)).toBeNull()
  expect(webBillingProduct("pro", "US", env)).toBeNull()
})

test("rejects ambiguous schedules, wrong Nigerian prices and cross-region blanket prices", () => {
  for (const products of [
    [paystack, paystack],
    [{ ...paystack, amountMinor: 600_000 }],
    [{ ...paystack, currency: "USD" }],
    [{ ...paystack, countries: ["US"] }],
    [{ ...polar, countries: ["*"] }],
    [{ ...polar, countries: ["NG"] }],
    [{ ...polar, countries: ["US", "KE"] }],
    [polar, { ...polar, productId: accountId }],
  ])
    expect(
      webBillingProducts({ WEB_BILLING_PRODUCTS: JSON.stringify(products) }),
    ).toEqual([])
  const kenya = { ...polar, countries: ["KE"], referenceNgnMinor: 500_000 }
  expect(
    webBillingProduct("starter", "KE", {
      WEB_BILLING_PRODUCTS: JSON.stringify([kenya]),
    }),
  ).toEqual(kenya)
  expect(webBillingProducts({ WEB_BILLING_PRODUCTS: "not-json" })).toEqual([])
})

test("prepared checkout is off by default and retains the owner/environment gates", () => {
  expect(isWebCheckoutEnabled({})).toBe(false)
  const ready = {
    WEB_BILLING_ENABLED: "true",
    OWNER_BILLING_ENABLED: "true",
    WEB_BILLING_ENVIRONMENT: "sandbox",
    STORE_BILLING_ENVIRONMENT: "sandbox",
  }
  expect(isWebCheckoutEnabled(ready)).toBe(true)
  expect(isWebCheckoutEnabled({ ...ready, APP_ENV: "production" })).toBe(false)
  expect(
    isWebCheckoutEnabled({ ...ready, STORE_BILLING_ENVIRONMENT: "production" }),
  ).toBe(false)
  expect(
    isWebProviderConfigured("paystack", {
      WEB_BILLING_ENVIRONMENT: "production",
      PAYSTACK_SECRET_KEY: "sk_test_fixture",
    }),
  ).toBe(false)
  expect(
    isWebProviderConfigured("polar", {
      WEB_BILLING_ENVIRONMENT: "sandbox",
      POLAR_ACCESS_TOKEN: "fixture",
    }),
  ).toBe(false)
})

function transport(responses: Array<{ status?: number; data: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetcher: typeof fetch = Object.assign(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      const next = responses.shift()
      if (!next) throw new Error("Unexpected provider call")
      return Response.json(next.data, { status: next.status ?? 200 })
    },
    { preconnect: () => {} },
  )
  return { calls, fetcher }
}

const paystackPlan = {
  status: true,
  data: {
    plan_code: "PLN_starter",
    interval: "monthly",
    amount: 500_000,
    currency: "NGN",
    domain: "test",
    invoice_limit: 0,
  },
}
test("Paystack checks the actual plan price before creating a recurring hosted checkout", async () => {
  const fake = transport([
    { data: paystackPlan },
    {
      data: {
        status: true,
        data: {
          authorization_url: "https://checkout.paystack.com/session",
          reference: `ewasub-${checkoutId}`,
        },
      },
    },
  ])
  const client = new WebSubscriptionClient(
    "paystack",
    "sandbox",
    "sk_test_fixture",
    fake.fetcher,
  )
  expect(await client.createCheckout({ ...args, product: paystack })).toEqual({
    checkoutUrl: "https://checkout.paystack.com/session",
    providerSessionId: `ewasub-${checkoutId}`,
    expiresAt: null,
  })
  expect(fake.calls.map((call) => call.init?.method)).toEqual(["GET", "POST"])
  expect(JSON.parse(String(fake.calls[1]?.init?.body))).toMatchObject({
    amount: 500_000,
    currency: "NGN",
    plan: "PLN_starter",
    reference: `ewasub-${checkoutId}`,
    channels: ["card"],
    metadata: { checkoutId, accountId, purpose: "owner_subscription" },
  })
})

test("callers cannot bypass the approved Nigerian price or credential environment", async () => {
  const fake = transport([])
  expect(
    () =>
      new WebSubscriptionClient(
        "paystack",
        "production",
        "sk_test_fixture",
        fake.fetcher,
      ),
  ).toThrow("environment")
  const client = new WebSubscriptionClient(
    "paystack",
    "sandbox",
    "sk_test_fixture",
    fake.fetcher,
  )
  await expect(
    client.createCheckout({
      ...args,
      product: { ...paystack, amountMinor: 1 },
    }),
  ).rejects.toThrow("pricing policy")
  expect(fake.calls).toHaveLength(0)
})

test("malformed successful responses remain uncertain without redispatch", async () => {
  for (const provider of ["paystack", "polar"] as const) {
    const fake = transport([{ data: null }])
    const client = new WebSubscriptionClient(
      provider,
      "sandbox",
      provider === "paystack" ? "sk_test_fixture" : "fixture",
      fake.fetcher,
    )
    await expect(
      client.createCheckout({
        ...args,
        product: provider === "paystack" ? paystack : polar,
      }),
    ).rejects.toMatchObject({
      code: "OUTCOME_UNKNOWN",
    })
    expect(fake.calls).toHaveLength(1)
  }
})

test("Paystack never starts a payment when its saved plan differs from the approved offer", async () => {
  for (const mismatch of [
    { amount: 600_000 },
    { interval: "annually" },
    { domain: "live" },
    { currency: "USD" },
    { invoice_limit: 2 },
  ]) {
    const fake = transport([
      { data: { status: true, data: { ...paystackPlan.data, ...mismatch } } },
    ])
    await expect(
      new WebSubscriptionClient(
        "paystack",
        "sandbox",
        "sk_test_fixture",
        fake.fetcher,
      ).createCheckout({ ...args, product: paystack }),
    ).rejects.toThrow("approved monthly offer")
    expect(fake.calls).toHaveLength(1)
  }
})

const polarProduct = {
  id: polar.productId,
  is_recurring: true,
  is_archived: false,
  recurring_interval: "month",
  recurring_interval_count: 1,
  prices: [
    {
      amount_type: "fixed",
      price_amount: 400,
      price_currency: "usd",
      is_archived: false,
    },
  ],
}
function polarCheckout() {
  return {
    id: "5e882a1e-d161-44cc-844c-4c0e94410004",
    url: "https://sandbox.polar.sh/checkout/example",
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    product_id: polar.productId,
    currency: "usd",
    amount: 400,
    external_customer_id: accountId,
    metadata: { purpose: "owner_subscription", accountId, checkoutId },
    allow_trial: false,
    trial_end: null,
    allow_discount_codes: false,
    discount_amount: 0,
    is_payment_required: true,
  }
}
test("Polar pins its API version and disables trials and discounts in an owner-bound checkout", async () => {
  const checkout = polarCheckout()
  const fake = transport([
    { data: polarProduct },
    {
      data: checkout,
    },
  ])
  const result = await new WebSubscriptionClient(
    "polar",
    "sandbox",
    "fixture",
    fake.fetcher,
  ).createCheckout({ ...args, product: polar })
  expect(result.checkoutUrl).toBe("https://sandbox.polar.sh/checkout/example")
  expect(result.expiresAt?.toISOString()).toBe(checkout.expires_at)
  expect(fake.calls[0]?.url).toBe(
    `https://sandbox-api.polar.sh/v1/products/${polar.productId}`,
  )
  expect(fake.calls[1]?.init?.headers).toMatchObject({
    "Polar-Version": "2026-10",
  })
  expect(JSON.parse(String(fake.calls[1]?.init?.body))).toMatchObject({
    products: [polar.productId],
    currency: "usd",
    allow_trial: false,
    allow_discount_codes: false,
    external_customer_id: accountId,
    metadata: { checkoutId, accountId },
    success_url: args.returnUrl,
  })
})

test("Polar never returns an expired or differently bound checkout for the owner to pay", async () => {
  for (const mismatch of [
    { amount: 1 },
    { currency: "eur" },
    { external_customer_id: checkoutId },
    { metadata: { accountId, checkoutId: accountId } },
    { allow_trial: true },
    { discount_amount: 1 },
    { is_payment_required: false },
    { expires_at: "2020-01-01T00:00:00Z" },
  ]) {
    const fake = transport([
      { data: polarProduct },
      { data: { ...polarCheckout(), ...mismatch } },
    ])
    await expect(
      new WebSubscriptionClient(
        "polar",
        "sandbox",
        "fixture",
        fake.fetcher,
      ).createCheckout({ ...args, product: polar }),
    ).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" })
    expect(fake.calls).toHaveLength(2)
  }
})

test("Polar refuses wrong price/currency, yearly, free, archived and ambiguous products", async () => {
  for (const mismatch of [
    { recurring_interval: "year" },
    { is_recurring: false },
    { is_archived: true },
    { prices: [{ ...polarProduct.prices[0], price_amount: 500 }] },
    { prices: [{ ...polarProduct.prices[0], price_currency: "eur" }] },
    { prices: [{ ...polarProduct.prices[0], amount_type: "free" }] },
    { prices: [...polarProduct.prices, ...polarProduct.prices] },
  ]) {
    const fake = transport([{ data: { ...polarProduct, ...mismatch } }])
    await expect(
      new WebSubscriptionClient(
        "polar",
        "sandbox",
        "fixture",
        fake.fetcher,
      ).createCheckout({ ...args, product: polar }),
    ).rejects.toThrow("approved monthly offer")
    expect(fake.calls).toHaveLength(1)
  }
})

test("unsafe redirects and malformed purchaser/checkout identities never leave the app", async () => {
  for (const url of [
    "javascript:alert(1)",
    "http://checkout.paystack.com/session",
    "https://checkout.paystack.com.evil.test/session",
    "https://user@checkout.paystack.com/session",
    "https://checkout.paystack.com:444/session",
  ]) {
    expect(() => hostedCheckoutUrl(url, "paystack", "sandbox")).toThrow()
  }
  expect(() =>
    hostedCheckoutUrl("https://polar.sh/checkout/session", "polar", "sandbox"),
  ).toThrow()
  const fake = transport([])
  await expect(
    new WebSubscriptionClient(
      "polar",
      "sandbox",
      "fixture",
      fake.fetcher,
    ).createCheckout({ ...args, checkoutId: "invalid", product: polar }),
  ).rejects.toThrow()
  expect(fake.calls).toHaveLength(0)
})

test("an uncertain or rejected provider response never triggers an automatic second request", async () => {
  for (const status of [400, 401, 408, 409, 429, 500]) {
    const fake = transport([
      { data: polarProduct },
      { status, data: { error: "fixture" } },
    ])
    await expect(
      new WebSubscriptionClient(
        "polar",
        "sandbox",
        "fixture",
        fake.fetcher,
      ).createCheckout({ ...args, product: polar }),
    ).rejects.toMatchObject({
      code:
        status === 400 || status === 401
          ? "DEFINITE_FAILURE"
          : "OUTCOME_UNKNOWN",
    })
    expect(fake.calls).toHaveLength(2)
    expect(fake.calls[1]?.init?.redirect).toBe("error")
  }
})

test("Paystack authenticates the exact raw body and rejects missing or tampered signatures", () => {
  const body = '{"event":"charge.success", "data":{}}'
  const signature = createHmac("sha512", "secret").update(body).digest("hex")
  expect(verifyPaystackSubscriptionWebhook(body, signature, "secret")).toBe(
    true,
  )
  expect(
    verifyPaystackSubscriptionWebhook(
      body.replace(" ", ""),
      signature,
      "secret",
    ),
  ).toBe(false)
  expect(verifyPaystackSubscriptionWebhook(body, null, "secret")).toBe(false)
})

test("Polar accepts current Standard Webhooks secrets and explicitly configured legacy secrets", () => {
  const key = Buffer.alloc(32, 7)
  const secret = `whsec_${key.toString("base64")}`
  const body = '{"type":"order.paid","data":{}}'
  const now = Math.floor(Date.now() / 1000)
  function headers(timestamp: number, signingKey: Buffer) {
    const signature = createHmac("sha256", signingKey)
      .update(`event-1.${timestamp}.${body}`)
      .digest("base64")
    return {
      "webhook-id": "event-1",
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
    }
  }
  expect(
    verifyPolarSubscriptionWebhook(body, headers(now, key), secret).type,
  ).toBe("order.paid")
  expect(
    verifyPolarSubscriptionWebhook(
      body,
      headers(now, Buffer.from(secret)),
      secret,
      "legacy",
    ).type,
  ).toBe("order.paid")
  expect(() =>
    verifyPolarSubscriptionWebhook(
      body,
      headers(now, Buffer.from(secret)),
      secret,
    ),
  ).toThrow()
  expect(() =>
    verifyPolarSubscriptionWebhook(body, headers(now - 600, key), secret),
  ).toThrow()
  expect(() =>
    verifyPolarSubscriptionWebhook(`${body} `, headers(now, key), secret),
  ).toThrow()
  expect(() => verifyPolarSubscriptionWebhook(body, {}, secret)).toThrow()
})
