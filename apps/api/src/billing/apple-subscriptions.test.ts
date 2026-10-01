import { expect, test } from "bun:test"
import { Environment } from "@apple/app-store-server-library"
import {
  appleBillingClient,
  resolveAppleBillingEnvironment,
  selectAppleSubscriptionStatus,
} from "./apple-subscriptions"

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
