import { expect, test } from "bun:test"
import { toPublicError } from "@ewatrade/errors"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../../../packages/db/generated/prisma/client"
import {
  checkWebSubscriptionPayment,
  createWebSubscriptionCheckout,
  processPaystackSubscriptionEvent,
  reconcileInitialWebCheckout,
} from "./web-subscriptions"

const checkoutId = "5e882a1e-d161-44cc-844c-4c0e94410001"
const event = {
  event: "charge.success",
  data: { reference: `ewasub-${checkoutId}` },
}

test("disabled checkout retains safe payment guidance through the API error formatter", async () => {
  const { db, calls } = databaseBoundary()
  const error = await createWebSubscriptionCheckout(
    db,
    {
      actorUserId: "fixture-owner",
      tenantId: "fixture-business",
      email: "owner@example.test",
      planId: "starter",
    },
    {},
  ).catch((cause: unknown) => cause)
  expect(toPublicError(error).message).toBe(
    "Online payments are not available yet. No payment has been taken.",
  )
  expect(toPublicError(error).code).toBe("RULE_REJECTED")
  expect(toPublicError(error).retryable).toBe(false)
  expect(calls).toEqual([])
})

/** Every DB port throws before connecting; no payment/provider/SQL is invoked. */
function databaseBoundary() {
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: "postgresql://fixture:fixture@127.0.0.1:1/unused",
    }),
  })
  const calls: string[] = []
  const stop = async () => {
    calls.push("database")
    throw new Error("fixture database boundary")
  }
  Object.defineProperties(db, {
    ownerBillingAccount: { value: { findUnique: stop } },
    billingProviderEvent: { value: { findUnique: stop } },
    billingCheckoutSession: { value: { findUnique: stop } },
    $transaction: { value: stop },
  })
  return { db, calls }
}

for (const environment of ["sandbox", "production"] as const) {
  const configured = {
    APP_ENV: environment === "production" ? "production" : "local",
    STORE_BILLING_ENVIRONMENT: environment,
    WEB_BILLING_ENVIRONMENT: environment,
    OWNER_BILLING_ENABLED: "true",
    STORE_BILLING_ENABLED: "true",
    PAYSTACK_SUBSCRIPTION_SECRET_KEY:
      environment === "production"
        ? "sk_live_FAKE_NOT_A_REAL_KEY"
        : "sk_test_FAKE_NOT_A_REAL_KEY",
    WEB_BILLING_ENABLED: "true",
    WEB_BILLING_RELEASE_APPROVED: "true",
  }
  for (const receiver of [undefined, "false"]) {
    test(`${environment} payment entry points deny a ${String(receiver)} receiver before DB/provider access`, async () => {
      const { db, calls } = databaseBoundary()
      const env = {
        ...configured,
        WEB_BILLING_RECONCILIATION_ENABLED: receiver,
      }
      for (const operation of [
        () => reconcileInitialWebCheckout(db, checkoutId, env),
        () => checkWebSubscriptionPayment(db, "fixture-owner", env),
        () => processPaystackSubscriptionEvent(db, event, env),
      ])
        await expect(operation()).rejects.toThrow(
          "Subscription processing is unavailable.",
        )
      expect(calls).toEqual([])
    })
  }

  test(`${environment} receipt entry points stay admitted when only new checkout is disabled`, async () => {
    const { db, calls } = databaseBoundary()
    const env = {
      ...configured,
      WEB_BILLING_RECONCILIATION_ENABLED: "true",
      WEB_BILLING_ENABLED: "false",
    }
    for (const operation of [
      () => reconcileInitialWebCheckout(db, checkoutId, env),
      () => checkWebSubscriptionPayment(db, "fixture-owner", env),
      () => processPaystackSubscriptionEvent(db, event, env),
    ])
      await expect(operation()).rejects.toThrow("fixture database boundary")
    expect(calls).toHaveLength(3)
  })
}

test("only a QA business in Test Mode skips the terms step", async () => {
  const run = async (
    environment: "sandbox" | "production",
    dataClassification: "QA" | "LIVE",
  ) => {
    const { db, calls } = databaseBoundary()
    Object.defineProperties(db, {
      tenant: {
        value: { findUnique: async () => ({ dataClassification }) },
      },
      legalAcceptance: {
        value: {
          findUnique: async () => {
            calls.push("terms")
            return null
          },
        },
      },
    })
    const error = await createWebSubscriptionCheckout(
      db,
      {
        actorUserId: "fixture-owner",
        tenantId: "fixture-business",
        email: "owner@example.test",
        planId: "starter",
      },
      {
        APP_ENV: environment === "production" ? "production" : "preview",
        STORE_BILLING_ENVIRONMENT: environment,
        WEB_BILLING_ENVIRONMENT: environment,
        OWNER_BILLING_ENABLED: "true",
        PAYSTACK_SUBSCRIPTION_SECRET_KEY:
          environment === "production"
            ? "sk_live_FAKE_NOT_A_REAL_KEY"
            : "sk_test_FAKE_NOT_A_REAL_KEY",
        WEB_BILLING_ENABLED: "true",
        WEB_BILLING_RECONCILIATION_ENABLED: "true",
        WEB_BILLING_RELEASE_APPROVED: "true",
      },
    ).catch((cause: unknown) => cause)
    return { calls, message: error instanceof Error ? error.message : null }
  }
  const qaTest = await run("sandbox", "QA")
  expect(qaTest.calls).not.toContain("terms")
  for (const [environment, classification] of [
    ["sandbox", "LIVE"],
    ["production", "QA"],
    ["production", "LIVE"],
  ] as const) {
    const result = await run(environment, classification)
    expect(result.calls).toContain("terms")
    expect(result.message).toBe(
      "Accept the current terms before starting payment.",
    )
  }
})
