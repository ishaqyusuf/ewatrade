import { expect, test } from "bun:test"
import type { WebBillingProduct } from "./config"
import {
  paidMonthlyPeriod,
  paystackDigest,
  verifiedPaystackCharge,
  verifiedPaystackSubscription,
} from "./paystack-receipts"

const product: WebBillingProduct = {
  provider: "paystack",
  planId: "starter",
  productId: "PLN_starter",
  currency: "NGN",
  amountMinor: 500000,
  referenceNgnMinor: 500000,
  countries: ["NG"],
}
const transaction = {
  reference: "ewasub-checkout",
  status: "success",
  amount: 500000,
  currency: "NGN",
  domain: "test",
  paid_at: "2026-01-31T12:00:00Z",
  plan_object: { plan_code: "PLN_starter" },
  metadata: {
    purpose: "owner_subscription",
    checkoutId: "checkout",
    accountId: "account",
  },
  customer: { customer_code: "CUS_owner" },
  authorization: {
    authorization_code: "AUTH_owner",
    reusable: true,
    channel: "card",
  },
}
const args = {
  transaction,
  reference: transaction.reference,
  product,
  environment: "sandbox" as const,
  initialBinding: { checkoutId: "checkout", accountId: "account" },
  now: new Date("2026-02-01Z"),
}

test("a verified initial charge binds amount, currency, offer, environment and payer metadata", () => {
  const receipt = verifiedPaystackCharge(args)
  expect(receipt.expiresAt.toISOString()).toBe("2026-02-28T12:00:00.000Z")
  expect(receipt.authorizationDigest).toBe(paystackDigest("AUTH_owner"))
  expect(JSON.stringify(receipt)).not.toContain("AUTH_owner")
  for (const mismatch of [
    { reference: "foreign" },
    { amount: 1 },
    { currency: "USD" },
    { domain: "live" },
    { status: "pending" },
    { plan_object: { plan_code: "PLN_another" } },
    {
      metadata: {
        purpose: "owner_subscription",
        checkoutId: "checkout",
        accountId: "another",
      },
    },
    { metadata: "account" },
    { authorization: { ...transaction.authorization, reusable: false } },
    {
      authorization: { ...transaction.authorization, channel: "bank_transfer" },
    },
    { paid_at: "2028-01-01T00:00:00Z" },
    { refunded: true },
    { amount_refunded: 1 },
  ])
    expect(() =>
      verifiedPaystackCharge({
        ...args,
        transaction: { ...transaction, ...mismatch },
      }),
    ).toThrow()
})

test("monthly paid periods clamp month ends and retain the paid instant across year and leap boundaries", () => {
  expect(
    paidMonthlyPeriod(new Date("2024-01-31T12:34:56Z")).toISOString(),
  ).toBe("2024-02-29T12:34:56.000Z")
  expect(
    paidMonthlyPeriod(new Date("2026-12-31T12:34:56Z")).toISOString(),
  ).toBe("2027-01-31T12:34:56.000Z")
})

const subscription = {
  subscription_code: "SUB_owner",
  amount: 500000,
  status: "active",
  plan: {
    plan_code: "PLN_starter",
    interval: "monthly",
    amount: 500000,
    currency: "NGN",
    domain: "test",
  },
  customer: transaction.customer,
  authorization: transaction.authorization,
}
test("subscription state verifies its saved monthly offer and cannot itself grant a paid period", () => {
  const input = {
    subscription,
    code: "SUB_owner",
    product,
    environment: "sandbox" as const,
  }
  const facts = verifiedPaystackSubscription(input)
  expect(facts.cancelAtPeriodEnd).toBe(false)
  expect(facts).not.toHaveProperty("expiresAt")
  expect(
    verifiedPaystackSubscription({
      ...input,
      subscription: { ...subscription, status: "non-renewing" },
    }).cancelAtPeriodEnd,
  ).toBe(true)
  for (const mismatch of [
    { amount: 1 },
    { subscription_code: "SUB_another" },
    { status: "unknown" },
    { plan: { ...subscription.plan, interval: "annually" } },
    { plan: { ...subscription.plan, currency: "USD" } },
    { plan: { ...subscription.plan, domain: "live" } },
  ])
    expect(() =>
      verifiedPaystackSubscription({
        ...input,
        subscription: { ...subscription, ...mismatch },
      }),
    ).toThrow()
})
