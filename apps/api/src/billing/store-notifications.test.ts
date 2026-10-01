import { expect, test } from "bun:test"
import { Buffer } from "node:buffer"
import { OpenAPIHono } from "@hono/zod-openapi"
import { registerStoreNotificationRoutes } from "./store-notifications"

test("Google voided-purchase route rejects a one-time void before reconciliation", async () => {
  const keys = [
    "STORE_BILLING_ENABLED",
    "PLAY_NOTIFICATION_AUDIENCE",
    "PLAY_NOTIFICATION_SERVICE_EMAIL",
    "PLAY_PACKAGE_NAME",
  ] as const
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  )
  Object.assign(process.env, {
    STORE_BILLING_ENABLED: "true",
    PLAY_NOTIFICATION_AUDIENCE: "test-audience",
    PLAY_NOTIFICATION_SERVICE_EMAIL: "publisher@example.test",
    PLAY_PACKAGE_NAME: "com.ewatrade.app",
  })

  const reconciled: unknown[] = []
  const app = new OpenAPIHono()
  registerStoreNotificationRoutes(app, {
    verifyGoogleIdentity: async (token, audience) => {
      expect(token).toBe("test-token")
      expect(audience).toBe("test-audience")
      return { email: "publisher@example.test", email_verified: true }
    },
    reconcileSubscription: async (_db, input) => {
      reconciled.push(input)
      return {} as never
    },
  })

  const postVoid = (productType: number) =>
    app.request("/webhooks/store/google", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          data: Buffer.from(
            JSON.stringify({
              packageName: "com.ewatrade.app",
              voidedPurchaseNotification: {
                purchaseToken: "purchase-token",
                orderId: "GPA.test-order",
                productType,
                refundType: 1,
              },
            }),
          ).toString("base64"),
        },
      }),
    })

  try {
    const unsupported = await postVoid(2)
    expect(unsupported.status).toBe(503)
    expect(await unsupported.json()).toEqual({ received: false })
    expect(reconciled).toEqual([])

    const supported = await postVoid(1)
    expect(supported.status).toBe(200)
    expect(await supported.json()).toEqual({ received: true })
    expect(reconciled).toEqual([
      {
        store: "play_store",
        purchaseId: "purchase-token",
        voidedOrderId: "GPA.test-order",
      },
    ])
  } finally {
    for (const key of keys) {
      const value = previous[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test("Google refund-review push acknowledges only after durable intake and explicit monitored activation", async () => {
  const keys = [
    "STORE_BILLING_ENABLED",
    "PLAY_NOTIFICATION_AUDIENCE",
    "PLAY_NOTIFICATION_SERVICE_EMAIL",
    "PLAY_PACKAGE_NAME",
    "PLAY_REFUND_REVIEW_INTAKE_ENABLED",
    "PLAY_REFUND_REVIEW_ALERTS_ENABLED",
    "PLAY_REFUND_REVIEW_ACK_ENABLED",
    "PLAY_REFUND_REVIEW_KEY_ID",
    "PLAY_REFUND_REVIEW_ENCRYPTION_KEY",
  ] as const
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  )
  Object.assign(process.env, {
    STORE_BILLING_ENABLED: "true",
    PLAY_NOTIFICATION_AUDIENCE: "test-audience",
    PLAY_NOTIFICATION_SERVICE_EMAIL: "publisher@example.test",
    PLAY_PACKAGE_NAME: "com.ewatrade.app",
    PLAY_REFUND_REVIEW_INTAKE_ENABLED: "false",
    PLAY_REFUND_REVIEW_ALERTS_ENABLED: "false",
    PLAY_REFUND_REVIEW_ACK_ENABLED: "false",
    PLAY_REFUND_REVIEW_KEY_ID: "fixture-key",
    PLAY_REFUND_REVIEW_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  })

  const recorded: Array<{
    encryptedPendingToken: string
    encryptedOrderId: string
  }> = []
  let failRecord = false
  const app = new OpenAPIHono()
  registerStoreNotificationRoutes(app, {
    verifyGoogleIdentity: async () => ({
      email: "publisher@example.test",
      email_verified: true,
    }),
    recordRefundReview: async (_db, input) => {
      if (failRecord) throw new Error("database unavailable")
      recorded.push(input)
      return {
        id: "case-id",
        tenantId: null,
        responseDueAt: input.responseDueAt,
      }
    },
  })
  const postReview = () =>
    app.request("/webhooks/store/google", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        message: {
          data: Buffer.from(
            JSON.stringify({
              packageName: "com.ewatrade.app",
              eventTimeMillis: "1780000000000",
              pendingRefundReviewNotification: {
                pendingRefundToken: "private-pending-token",
                orderId: "GPA.private-order",
                refundReason: 7,
              },
            }),
          ).toString("base64"),
        },
      }),
    })

  try {
    expect((await postReview()).status).toBe(503)
    expect(recorded).toHaveLength(0)

    process.env.PLAY_REFUND_REVIEW_INTAKE_ENABLED = "true"
    expect((await postReview()).status).toBe(503)
    expect(recorded).toHaveLength(1)

    process.env.PLAY_REFUND_REVIEW_ALERTS_ENABLED = "true"
    expect((await postReview()).status).toBe(503)
    expect(recorded).toHaveLength(2)

    process.env.PLAY_REFUND_REVIEW_ACK_ENABLED = "true"
    const accepted = await postReview()
    expect(accepted.status).toBe(200)
    expect(await accepted.json()).toEqual({ received: true })
    expect(recorded).toHaveLength(3)
    expect(recorded[2]?.encryptedPendingToken).not.toContain(
      "private-pending-token",
    )
    expect(recorded[2]?.encryptedOrderId).not.toContain("GPA.private-order")

    failRecord = true
    expect((await postReview()).status).toBe(503)
  } finally {
    for (const key of keys) {
      const value = previous[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
