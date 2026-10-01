import { afterEach, expect, test } from "bun:test"
import { createHmac, randomBytes } from "node:crypto"
import { OpenAPIHono } from "@hono/zod-openapi"
import { registerAccountPrivacyResendWebhook } from "./resend-webhook"

const keys = [
  "RESEND_API_KEY",
  "ACCOUNT_PRIVACY_RESEND_WEBHOOK_SECRET",
  "ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY",
  "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_NOTICE_WEBHOOK_ENABLED",
] as const
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of keys) {
    const value = previous[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function appWithRecorder(recorded: unknown[]) {
  const app = new OpenAPIHono()
  registerAccountPrivacyResendWebhook(app, {
    recordDelivery: async (_db, event, config) => {
      recorded.push({ event, config })
      return { recorded: true, replay: false }
    },
    recordFailure: async (_db, event, config) => {
      recorded.push({ event, config })
      return { recorded: true, replay: false, completedRequest: false }
    },
  })
  return app
}

function enable() {
  process.env.RESEND_API_KEY = "re_test"
  process.env.ACCOUNT_PRIVACY_RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from("test-signing-secret-32-bytes-long!!").toString("base64")}`
  process.env.ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY = "k".repeat(32)
  process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = "approved-v1"
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_NOTICE_WEBHOOK_ENABLED = "true"
}

function signedRequest(
  body: string,
  id = `msg_${randomBytes(8).toString("hex")}`,
) {
  const timestamp = `${Math.floor(Date.now() / 1000)}`
  const secret = Buffer.from(
    (process.env.ACCOUNT_PRIVACY_RESEND_WEBHOOK_SECRET ?? "").slice(6),
    "base64",
  )
  const signature = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64")
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${signature}`,
    },
    body,
  }
}

test("disabled account privacy receiver is unavailable", async () => {
  const recorded: unknown[] = []
  const app = appWithRecorder(recorded)
  const response = await app.request("/api/account-privacy/webhooks/resend", {
    method: "POST",
    body: "{}",
  })
  expect(response.status).toBe(404)
  expect(recorded).toEqual([])
})

test("signed recipient-specific delivery reaches the repository; bad signature does not", async () => {
  enable()
  const recorded: unknown[] = []
  const app = appWithRecorder(recorded)
  const body = JSON.stringify({
    type: "email.delivered",
    created_at: new Date().toISOString(),
    data: {
      email_id: "email-1",
      to: ["owner@example.test"],
      created_at: new Date().toISOString(),
      from: "privacy@example.test",
      message_id: "message-1",
      subject: "Deletion outcome",
    },
  })
  const signed = signedRequest(body)
  const tampered = await app.request("/api/account-privacy/webhooks/resend", {
    ...signed,
    body: `${body} `,
  })
  expect(tampered.status).toBe(401)
  expect(recorded).toEqual([])
  const valid = await app.request(
    "/api/account-privacy/webhooks/resend",
    signed,
  )
  expect(valid.status).toBe(200)
  expect(recorded).toHaveLength(1)
  expect(recorded[0]).toMatchObject({
    event: {
      eventId: signed.headers["svix-id"],
      messageId: "email-1",
      recipient: "owner@example.test",
    },
    config: { policyVersion: "approved-v1" },
  })
})

test("signed send receipt cannot become delivery", async () => {
  enable()
  const recorded: unknown[] = []
  const app = appWithRecorder(recorded)
  const response = await app.request(
    "/api/account-privacy/webhooks/resend",
    signedRequest(
      JSON.stringify({
        type: "email.sent",
        created_at: new Date().toISOString(),
        data: {},
      }),
    ),
  )
  expect(response.status).toBe(200)
  expect(recorded).toEqual([])
})

test("signed bounce reaches failure reconciliation but a tampered bounce does not", async () => {
  enable()
  const recorded: unknown[] = []
  const app = appWithRecorder(recorded)
  const body = JSON.stringify({
    type: "email.bounced",
    created_at: new Date().toISOString(),
    data: {
      email_id: "email-bounced-1",
      to: ["owner@example.test"],
      created_at: new Date().toISOString(),
      from: "privacy@example.test",
      message_id: "message-bounced-1",
      subject: "Deletion outcome",
      bounce: { message: "Rejected", subType: "Permanent", type: "Permanent" },
    },
  })
  const signed = signedRequest(body)
  expect(
    (
      await app.request("/api/account-privacy/webhooks/resend", {
        ...signed,
        body: `${body} `,
      })
    ).status,
  ).toBe(401)
  expect(
    (await app.request("/api/account-privacy/webhooks/resend", signed)).status,
  ).toBe(200)
  expect(recorded).toHaveLength(1)
  expect(recorded[0]).toMatchObject({
    event: {
      type: "email.bounced",
      messageId: "email-bounced-1",
      recipient: "owner@example.test",
    },
  })
})

test("a signed tagged delivery binds an uncertain send once before recording delivery", async () => {
  enable()
  const app = new OpenAPIHono()
  const bindings: unknown[] = []
  let deliveryCalls = 0
  registerAccountPrivacyResendWebhook(app, {
    recordDelivery: async () => {
      deliveryCalls++
      return deliveryCalls === 1
        ? { recorded: false, reason: "UNKNOWN_MESSAGE" as const }
        : { recorded: true, replay: false }
    },
    bindProviderEvent: async (_db, input) => {
      bindings.push(input)
      return { bound: true, replay: false }
    },
  })
  const data = {
    email_id: "email-before-receipt",
    to: ["owner@example.test"],
    created_at: new Date().toISOString(),
    from: "privacy@example.test",
    message_id: "message-before-receipt",
    subject: "Deletion outcome",
  }
  const tagged = await app.request(
    "/api/account-privacy/webhooks/resend",
    signedRequest(
      JSON.stringify({
        type: "email.delivered",
        created_at: new Date().toISOString(),
        data: {
          ...data,
          tags: {
            category: "account_privacy_outcome_notice",
            notice_attempt: "attempt-1",
          },
        },
      }),
    ),
  )
  expect(tagged.status).toBe(200)
  expect(deliveryCalls).toBe(2)
  expect(bindings).toHaveLength(1)
  expect(bindings[0]).toMatchObject({
    attemptId: "attempt-1",
    providerMessageId: "email-before-receipt",
    recipient: "owner@example.test",
  })
  const unrelatedApp = new OpenAPIHono()
  registerAccountPrivacyResendWebhook(unrelatedApp, {
    recordDelivery: async () => ({
      recorded: false,
      reason: "UNKNOWN_MESSAGE" as const,
    }),
  })
  const unrelated = await unrelatedApp.request(
    "/api/account-privacy/webhooks/resend",
    signedRequest(
      JSON.stringify({
        type: "email.delivered",
        created_at: new Date().toISOString(),
        data,
      }),
    ),
  )
  expect(unrelated.status).toBe(200)
})

test("a signed tagged send event can bind the provider id but cannot certify delivery", async () => {
  enable()
  const bindings: unknown[] = []
  const deliveries: unknown[] = []
  const app = new OpenAPIHono()
  registerAccountPrivacyResendWebhook(app, {
    bindProviderEvent: async (_db, input) => {
      bindings.push(input)
      return { bound: true, replay: false }
    },
    recordDelivery: async (_db, input) => {
      deliveries.push(input)
      return { recorded: true, replay: false }
    },
  })
  const response = await app.request(
    "/api/account-privacy/webhooks/resend",
    signedRequest(
      JSON.stringify({
        type: "email.sent",
        created_at: new Date().toISOString(),
        data: {
          email_id: "email-sent-1",
          to: ["owner@example.test"],
          created_at: new Date().toISOString(),
          tags: {
            category: "account_privacy_outcome_notice",
            notice_attempt: "attempt-1",
          },
        },
      }),
    ),
  )
  expect(response.status).toBe(200)
  expect(bindings).toHaveLength(1)
  expect(deliveries).toEqual([])
})
