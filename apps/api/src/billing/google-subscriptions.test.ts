import { expect, test } from "bun:test"
import {
  projectGoogleSubscription,
  verifyGoogleSubscription,
} from "./google-subscriptions"

const purchase = {
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  startTime: "2026-09-01T00:00:00Z",
  externalAccountIdentifiers: { obfuscatedExternalAccountId: "account-1" },
  lineItems: [
    {
      productId: "growth.play",
      expiryTime: "2026-10-01T00:00:00Z",
      latestSuccessfulOrderId: "order-1",
      autoRenewingPlan: { autoRenewEnabled: true },
    },
  ],
}

test("projects only a Play purchase matching the configured verifier environment", () => {
  expect(
    projectGoogleSubscription(purchase, "production-token", "production"),
  ).toMatchObject({
    environment: "production",
    productId: "growth.play",
    accountToken: "account-1",
    revoked: false,
  })
  expect(
    projectGoogleSubscription(
      { ...purchase, testPurchase: {} },
      "sandbox-token",
      "sandbox",
    ),
  ).toMatchObject({ environment: "sandbox", purchaseId: "sandbox-token" })
})

test("rejects cross-environment Play purchases and an unset verifier mode", () => {
  expect(() =>
    projectGoogleSubscription(purchase, "production-token", "sandbox"),
  ).toThrow("environment does not match")
  expect(() =>
    projectGoogleSubscription(
      { ...purchase, testPurchase: {} },
      "sandbox-token",
      "production",
    ),
  ).toThrow("environment does not match")
  expect(() =>
    projectGoogleSubscription(purchase, "production-token", undefined),
  ).toThrow("environment is not configured")
  expect(() =>
    projectGoogleSubscription(purchase, "production-token", "unknown"),
  ).toThrow("environment is not configured")
})

test("refuses an unset Play verifier before contacting Google", async () => {
  const previous = process.env.STORE_BILLING_ENVIRONMENT
  Reflect.deleteProperty(process.env, "STORE_BILLING_ENVIRONMENT")
  try {
    await expect(verifyGoogleSubscription("purchase-token")).rejects.toThrow(
      "environment is not configured",
    )
  } finally {
    if (previous === undefined)
      Reflect.deleteProperty(process.env, "STORE_BILLING_ENVIRONMENT")
    else process.env.STORE_BILLING_ENVIRONMENT = previous
  }
})
