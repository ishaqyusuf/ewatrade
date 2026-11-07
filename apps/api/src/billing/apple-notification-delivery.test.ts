import { expect, test } from "bun:test"
import { NotificationTypeV2 } from "@apple/app-store-server-library"
import { OpenAPIHono } from "@hono/zod-openapi"
import { forwardAppleSandboxNotification } from "./apple-notification-delivery"
import { registerStoreNotificationRoutes } from "./store-notifications"

const ownerId = "review-owner-123"
const config = {
  APP_ENV: "production",
  DEV_PROFILE: "prod",
  STORE_BILLING_ENVIRONMENT: "production",
  STORE_BILLING_ENABLED: "true",
  OWNER_BILLING_ENABLED: "true",
  APP_STORE_REVIEW_SANDBOX_ENABLED: "true",
  APP_STORE_REVIEW_OWNER_IDS: JSON.stringify([ownerId]),
  APP_STORE_SANDBOX_FORWARD_ENABLED: "true",
}

test("Sandbox relay keeps the original signed payload, fixed destination and bounded nonredirecting delivery", async () => {
  let sent = 0
  await forwardAppleSandboxNotification(
    "signed-envelope",
    config,
    async (url, init) => {
      sent++
      expect(url).toBe("https://preview-api.ewatrade.com/webhooks/store/apple")
      expect(init.redirect).toBe("error")
      expect(init.signal).toBeInstanceOf(AbortSignal)
      expect(init.headers).toEqual({ "content-type": "application/json" })
      expect(init.body).toBe(
        JSON.stringify({ signedPayload: "signed-envelope" }),
      )
      return Response.json({ received: true })
    },
  )
  expect(sent).toBe(1)
  await forwardAppleSandboxNotification(
    "signed-envelope",
    { ...config, DEV_PROFILE: "production" },
    async () => Response.json({ received: true }),
  )
  for (const change of [
    { APP_STORE_SANDBOX_FORWARD_ENABLED: "false" },
    { APP_ENV: "preview", DEV_PROFILE: "preview" },
    { STORE_BILLING_ENVIRONMENT: "sandbox" },
    { APP_ENV: "preview", DEV_PROFILE: "production" },
    { APP_ENV: "production", DEV_PROFILE: "local" },
  ]) {
    await expect(
      forwardAppleSandboxNotification(
        "signed-envelope",
        { ...config, ...change },
        async () => {
          sent++
          return Response.json({ received: true })
        },
      ),
    ).rejects.toThrow()
  }
  expect(sent).toBe(1)
})

test("failed, redirected, oversized, malformed or unacknowledged peer delivery remains retryable", async () => {
  for (const response of [
    new Response(null, { status: 503 }),
    new Response(null, { status: 307 }),
    Response.json({ received: false }),
    new Response("not-json"),
    new Response("x".repeat(1025)),
  ]) {
    await expect(
      forwardAppleSandboxNotification(
        "signed-envelope",
        config,
        async () => response,
      ),
    ).rejects.toThrow()
  }
  await expect(
    forwardAppleSandboxNotification("signed-envelope", config, async () => {
      throw new Error("timeout")
    }),
  ).rejects.toThrow()
})

test("Apple webhook routes approved review Sandbox locally and other Sandbox to Preview without authenticated-actor impersonation", async () => {
  const previous = Object.fromEntries(
    Object.keys(config).map((key) => [key, process.env[key]]),
  )
  Object.assign(process.env, config)
  try {
    let environment: "production" | "sandbox" = "sandbox"
    let resolvedOwner: string | null = ownerId
    let verificationFailure = false
    let reconcileFailure = false
    let relayFailure = false
    let testNotification = false
    const reconciled: unknown[] = []
    const forwarded: string[] = []
    const app = new OpenAPIHono()
    registerStoreNotificationRoutes(app, {
      verifyAppleNotification: async () => {
        if (verificationFailure) throw new Error("unverified")
        return {
          environment,
          notification: {
            notificationType: testNotification
              ? NotificationTypeV2.TEST
              : NotificationTypeV2.DID_RENEW,
            data: {
              signedTransactionInfo: testNotification
                ? undefined
                : "signed-nested",
            },
          },
          transaction: testNotification
            ? undefined
            : { transactionId: "transaction", appAccountToken: "owner-token" },
        }
      },
      findAppleNotificationOwner: async () => resolvedOwner,
      forwardAppleSandboxNotification: async (payload) => {
        if (relayFailure) throw new Error("peer unavailable")
        forwarded.push(payload)
      },
      reconcileSubscription: async (_db, input) => {
        if (reconcileFailure) throw new Error("database unavailable")
        reconciled.push(input)
        return { applied: true, expiresAt: new Date("2026-12-01") }
      },
    })
    const post = () =>
      app.request("/webhooks/store/apple", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signedPayload: "signed-envelope" }),
      })
    expect((await post()).status).toBe(200)
    expect(reconciled).toEqual([
      {
        store: "app_store",
        purchaseId: "transaction",
        appleNotification: {
          environment: "sandbox",
          accountToken: "owner-token",
        },
      },
    ])
    expect(forwarded).toEqual([])
    // Repeated delivery reuses the canonical reconciliation/idempotency owner.
    expect((await post()).status).toBe(200)
    expect(reconciled).toHaveLength(2)
    resolvedOwner = "ordinary-owner-123"
    expect((await post()).status).toBe(200)
    expect(forwarded).toEqual(["signed-envelope"])
    expect(reconciled).toHaveLength(2)
    resolvedOwner = null
    relayFailure = true
    expect((await post()).status).toBe(503)
    expect(reconciled).toHaveLength(2)
    verificationFailure = true
    expect((await post()).status).toBe(503)
    expect(forwarded).toHaveLength(1)
    verificationFailure = false
    environment = "production"
    expect((await post()).status).toBe(200)
    expect(reconciled).toHaveLength(3)
    reconcileFailure = true
    expect((await post()).status).toBe(503)
    testNotification = true
    expect((await post()).status).toBe(200)
    testNotification = false
    reconcileFailure = false
    environment = "sandbox"
    process.env.STORE_BILLING_ENVIRONMENT = "sandbox"
    process.env.APP_ENV = "preview"
    process.env.DEV_PROFILE = "preview"
    expect((await post()).status).toBe(200)
    expect(reconciled).toHaveLength(4)
    expect(forwarded).toHaveLength(1)
    process.env.STORE_BILLING_ENABLED = "false"
    expect((await post()).status).toBe(503)
  } finally {
    for (const key of Object.keys(config)) {
      const value = previous[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
