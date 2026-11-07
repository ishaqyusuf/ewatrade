import { expect, test } from "bun:test"
import {
  Environment,
  ExpirationIntent,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  Status,
} from "@apple/app-store-server-library"
import {
  appleBillingClient,
  projectAppleSubscription,
  resolveAppleBillingEnvironment,
  selectAppleSubscriptionStatus,
} from "./apple-subscriptions"
import { projectStoreEntitlement } from "./store-entitlement"

const day = 24 * 60 * 60 * 1000
const paidExpiry = Date.parse("2026-11-01T12:00:00Z")
const purchase: JWSTransactionDecodedPayload = {
  originalTransactionId: "original-apple-purchase",
  productId: "com.ewatrade.owner.growth.monthly",
  appAccountToken: "owner-token",
  purchaseDate: paidExpiry - 30 * day,
  expiresDate: paidExpiry,
}
const failedRenewal: JWSRenewalInfoDecodedPayload = {
  originalTransactionId: purchase.originalTransactionId,
  isInBillingRetryPeriod: true,
  expirationIntent: ExpirationIntent.BILLING_ERROR,
  autoRenewStatus: 1,
}

test("verified Apple billing failure gets five days from paid expiry with an exact cutoff", () => {
  const result = projectAppleSubscription(
    Status.BILLING_RETRY,
    purchase,
    failedRenewal,
    "production",
  )
  expect(result.expiresAt.getTime()).toBe(paidExpiry + 5 * day)
  expect(result.accountToken).toBe("owner-token")
  expect(result.purchaseId).toBe("original-apple-purchase")
  expect(
    projectStoreEntitlement(result, new Date(paidExpiry + 5 * day - 1)).status,
  ).toBe("active")
  expect(
    projectStoreEntitlement(result, new Date(paidExpiry + 5 * day)).status,
  ).toBe("cancelled")
  expect(
    projectStoreEntitlement(result, new Date(paidExpiry + 8 * day)).status,
  ).toBe("cancelled")
  // Replaying the same verified failure cannot move its boundary.
  expect(
    projectAppleSubscription(
      Status.BILLING_RETRY,
      purchase,
      failedRenewal,
      "production",
    ).expiresAt,
  ).toEqual(result.expiresAt)
})

test("Apple courtesy tops up short native grace but never shortens longer verified grace", () => {
  for (const days of [3, 16, 28]) {
    const result = projectAppleSubscription(
      Status.BILLING_GRACE_PERIOD,
      purchase,
      {
        ...failedRenewal,
        gracePeriodExpiresDate: paidExpiry + days * day,
      },
      "production",
    )
    expect(result.expiresAt.getTime()).toBe(
      paidExpiry + Math.max(5, days) * day,
    )
  }
})

test("cancelled, revoked, unknown and non-billing expirations cannot obtain courtesy", () => {
  for (const status of [Status.EXPIRED, Status.REVOKED, undefined, 999]) {
    const result = projectAppleSubscription(
      status,
      purchase,
      failedRenewal,
      "production",
    )
    expect(result.revoked).toBe(true)
    expect(result.expiresAt.getTime()).toBe(paidExpiry)
  }
  for (const change of [
    { autoRenewStatus: 0 },
    { isInBillingRetryPeriod: false },
    { isInBillingRetryPeriod: undefined },
    { expirationIntent: undefined },
    { expirationIntent: ExpirationIntent.CUSTOMER_CANCELLED },
    {
      expirationIntent:
        ExpirationIntent.CUSTOMER_DID_NOT_CONSENT_TO_PRICE_INCREASE,
    },
    { expirationIntent: ExpirationIntent.PRODUCT_NOT_AVAILABLE },
  ]) {
    const result = projectAppleSubscription(
      Status.BILLING_RETRY,
      purchase,
      { ...failedRenewal, ...change },
      "production",
    )
    expect(result.revoked).toBe(true)
    expect(result.expiresAt.getTime()).toBe(paidExpiry)
  }
  const revoked = projectAppleSubscription(
    Status.BILLING_RETRY,
    { ...purchase, revocationDate: paidExpiry },
    failedRenewal,
    "production",
  )
  expect(revoked.revoked).toBe(true)
  expect(revoked.expiresAt.getTime()).toBe(paidExpiry)
  const revokedInGrace = projectAppleSubscription(
    Status.BILLING_GRACE_PERIOD,
    { ...purchase, revocationDate: paidExpiry },
    failedRenewal,
    "production",
  )
  expect(revokedInGrace.revoked).toBe(true)
  expect(revokedInGrace.expiresAt.getTime()).toBe(paidExpiry)
})

test("a recovered Apple renewal replaces courtesy with the new paid expiry", () => {
  const renewed = projectAppleSubscription(
    Status.ACTIVE,
    {
      ...purchase,
      expiresDate: paidExpiry + 30 * day,
      purchaseDate: paidExpiry,
    },
    {
      ...failedRenewal,
      isInBillingRetryPeriod: false,
      expirationIntent: undefined,
    },
    "production",
  )
  expect(renewed.revoked).toBe(false)
  expect(renewed.expiresAt.getTime()).toBe(paidExpiry + 30 * day)
  const cancelled = projectAppleSubscription(
    Status.ACTIVE,
    purchase,
    { ...failedRenewal, autoRenewStatus: 0 },
    "production",
  )
  expect(cancelled.expiresAt.getTime()).toBe(paidExpiry)
  expect(projectStoreEntitlement(cancelled, new Date(paidExpiry - 1))).toEqual({
    status: "active",
    cancelAtPeriodEnd: true,
  })
})

test("Apple projection refuses ambiguous bindings and malformed dates rather than inventing access", () => {
  expect(() =>
    projectAppleSubscription(
      Status.BILLING_RETRY,
      purchase,
      { ...failedRenewal, originalTransactionId: "other" },
      "production",
    ),
  ).toThrow("identity mismatch")
  expect(() =>
    projectAppleSubscription(
      Status.BILLING_RETRY,
      { ...purchase, appAccountToken: undefined },
      failedRenewal,
      "production",
    ),
  ).toThrow("account binding")
  for (const expiresDate of [Number.NaN, Number.POSITIVE_INFINITY, 1e20]) {
    expect(() =>
      projectAppleSubscription(
        Status.BILLING_RETRY,
        { ...purchase, expiresDate },
        failedRenewal,
        "production",
      ),
    ).toThrow("dates")
  }
  for (const gracePeriodExpiresDate of [
    undefined,
    Number.NaN,
    paidExpiry - 1,
  ]) {
    expect(() =>
      projectAppleSubscription(
        Status.BILLING_GRACE_PERIOD,
        purchase,
        { ...failedRenewal, gracePeriodExpiresDate },
        "production",
      ),
    ).toThrow("grace expiry")
  }
})

test("requires an explicit Apple verifier environment before reading credentials", () => {
  expect(resolveAppleBillingEnvironment("sandbox")).toEqual({
    sdk: Environment.SANDBOX,
    label: "sandbox",
  })
  expect(resolveAppleBillingEnvironment("production")).toEqual({
    sdk: Environment.PRODUCTION,
    label: "production",
  })
  expect(() => resolveAppleBillingEnvironment(undefined)).toThrow(
    "environment is not configured",
  )
  expect(() => resolveAppleBillingEnvironment("unknown")).toThrow(
    "environment is not configured",
  )
  const previous = process.env.STORE_BILLING_ENVIRONMENT
  Reflect.deleteProperty(process.env, "STORE_BILLING_ENVIRONMENT")
  try {
    expect(() => appleBillingClient()).toThrow("environment is not configured")
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "STORE_BILLING_ENVIRONMENT")
    else process.env.STORE_BILLING_ENVIRONMENT = previous
  }
})

test("selects only the requested Apple original transaction across groups", () => {
  const selected = { originalTransactionId: "wanted", status: 1 }
  expect(
    selectAppleSubscriptionStatus(
      [
        { lastTransactions: [{ originalTransactionId: "other", status: 1 }] },
        { lastTransactions: [selected] },
      ],
      "wanted",
    ),
  ).toBe(selected)
})

test("refuses missing or duplicate Apple subscription status", () => {
  expect(() => selectAppleSubscriptionStatus([], "wanted")).toThrow(
    "missing or ambiguous",
  )
  expect(() =>
    selectAppleSubscriptionStatus(
      [
        { lastTransactions: [{ originalTransactionId: "wanted" }] },
        { lastTransactions: [{ originalTransactionId: "wanted" }] },
      ],
      "wanted",
    ),
  ).toThrow("missing or ambiguous")
})
