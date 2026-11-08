import { expect, test } from "bun:test"
import { createHmac } from "node:crypto"
import type { WebBillingProduct } from "./config"
import {
  isWebCheckoutEnabled,
  isWebProviderConfigured,
  isWebReconciliationConfigured,
  webBillingOwnerCountry,
  webBillingProduct,
  webBillingProducts,
} from "./config"
import { webMonthlyPriceReference } from "./pricing"
import {
  WebSubscriptionClient,
  hostedCheckoutUrl,
  verifyPaystackSubscriptionWebhook,
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
// USD is a transport fixture, not an approved commercial dollar price.
const international: WebBillingProduct = {
  ...paystack,
  productId: "PLN_international",
  countries: ["US", "GB"],
  amountMinor: 600_000,
  referenceNgnMinor: 600_000,
}
const usd: WebBillingProduct = {
  ...international,
  productId: "PLN_usd",
  currency: "USD",
  amountMinor: 400,
}
const args = {
  accountId,
  checkoutId,
  email: "owner@example.test",
  returnUrl: "https://dash.ewatrade.com/settings/billing",
}
const env = { WEB_BILLING_PRODUCTS: JSON.stringify([paystack, international]) }

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

test("Paystack serves explicitly mapped Nigeria and international territories", () => {
  expect(webBillingProduct("starter", "NG", env)).toEqual(paystack)
  expect(webBillingProduct("starter", "US", env)).toEqual(international)
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
    [{ ...international, provider: "polar" }],
    [{ ...international, countries: ["*"] }],
    [{ ...international, countries: ["NG"] }],
    [{ ...international, countries: ["US", "KE"] }],
    [international, { ...international, productId: "PLN_duplicate" }],
  ])
    expect(
      webBillingProducts({ WEB_BILLING_PRODUCTS: JSON.stringify(products) }),
    ).toEqual([])
  const kenya = {
    ...international,
    countries: ["KE"],
    amountMinor: 500_000,
    referenceNgnMinor: 500_000,
  }
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
  const fake = transport([{ data: null }])
  await expect(
    new WebSubscriptionClient(
      "paystack",
      "sandbox",
      "sk_test_fixture",
      fake.fetcher,
    ).createCheckout({ ...args, product: paystack }),
  ).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" })
  expect(fake.calls).toHaveLength(1)
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

  const fake = transport([])
  await expect(
    new WebSubscriptionClient(
      "paystack",
      "sandbox",
      "sk_test_fixture",
      fake.fetcher,
    ).createCheckout({ ...args, checkoutId: "invalid", product: paystack }),
  ).rejects.toThrow()
  expect(fake.calls).toHaveLength(0)
})

test("an uncertain or rejected provider response never triggers an automatic second request", async () => {
  for (const status of [400, 401, 408, 409, 429, 500]) {
    const fake = transport([
      { data: paystackPlan },
      { status, data: { error: "fixture" } },
    ])
    await expect(
      new WebSubscriptionClient(
        "paystack",
        "sandbox",
        "sk_test_fixture",
        fake.fetcher,
      ).createCheckout({ ...args, product: paystack }),
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

test("USD checkout requires explicit settlement approval while NGN works without it", async () => {
  const usdEnv = { WEB_BILLING_PRODUCTS: JSON.stringify([usd]) }
  expect(webBillingProducts(usdEnv)).toEqual([])
  expect(
    webBillingProduct("starter", "US", {
      ...usdEnv,
      PAYSTACK_USD_ENABLED: "true",
    }),
  ).toEqual(usd)
  const fake = transport([])
  await expect(
    new WebSubscriptionClient(
      "paystack",
      "sandbox",
      "sk_test_fixture",
      fake.fetcher,
    ).createCheckout({ ...args, product: usd }),
  ).rejects.toThrow("pricing policy")
  expect(fake.calls).toHaveLength(0)
})

test("Production checkout requires release acceptance while a paused checkout still reconciles paid receipts", () => {
  const ready = {
    WEB_BILLING_ENVIRONMENT: "production",
    STORE_BILLING_ENVIRONMENT: "production",
    OWNER_BILLING_ENABLED: "true",
    WEB_BILLING_ENABLED: "true",
    APP_ENV: "production",
    PAYSTACK_SECRET_KEY: "sk_live_fixture",
  }
  expect(isWebCheckoutEnabled(ready)).toBe(false)
  expect(
    isWebCheckoutEnabled({ ...ready, WEB_BILLING_RELEASE_APPROVED: "true" }),
  ).toBe(true)
  expect(
    isWebReconciliationConfigured({ ...ready, WEB_BILLING_ENABLED: "false" }),
  ).toBe(true)
  expect(
    isWebReconciliationConfigured({
      ...ready,
      PAYSTACK_SECRET_KEY: "sk_test_fixture",
    }),
  ).toBe(false)
  expect(
    isWebReconciliationConfigured({
      ...ready,
      STORE_BILLING_ENVIRONMENT: "sandbox",
    }),
  ).toBe(false)
})

test("only explicitly reviewed opaque owner country bindings select regional billing", () => {
  expect(webBillingOwnerCountry(accountId, {})).toBeNull()
  expect(
    webBillingOwnerCountry(accountId, {
      WEB_BILLING_OWNER_COUNTRIES: JSON.stringify({ [accountId]: "US" }),
    }),
  ).toBe("US")
  expect(
    webBillingOwnerCountry(accountId, {
      WEB_BILLING_OWNER_COUNTRIES: JSON.stringify({ [accountId]: "ng" }),
    }),
  ).toBeNull()
  expect(
    webBillingOwnerCountry(checkoutId, {
      WEB_BILLING_OWNER_COUNTRIES: JSON.stringify({ [accountId]: "NG" }),
    }),
  ).toBeNull()
})

test.each([international, usd])(
  "international $currency checkout uses its exact saved monthly offer",
  async (product) => {
    const fake = transport([
      {
        data: {
          status: true,
          data: {
            ...paystackPlan.data,
            plan_code: product.productId,
            amount: product.amountMinor,
            currency: product.currency,
          },
        },
      },
      {
        data: {
          status: true,
          data: {
            authorization_url: "https://checkout.paystack.com/international",
            reference: `ewasub-${checkoutId}`,
          },
        },
      },
    ])
    const result = await new WebSubscriptionClient(
      "paystack",
      "sandbox",
      "sk_test_fixture",
      fake.fetcher,
    ).createCheckout({
      ...args,
      product,
      usdApproved: product.currency === "USD",
    })
    expect(result.checkoutUrl).toBe(
      "https://checkout.paystack.com/international",
    )
    expect(JSON.parse(String(fake.calls[1]?.init?.body))).toMatchObject({
      amount: product.amountMinor,
      currency: product.currency,
      plan: product.productId,
    })
    expect(fake.calls).toHaveLength(2)
  },
)
