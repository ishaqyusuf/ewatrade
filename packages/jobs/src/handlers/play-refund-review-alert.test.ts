import { expect, test } from "bun:test"
import type { EmailMessage } from "@ewatrade/email"
import { runPlayRefundReviewAlert } from "./play-refund-review-alert"

const now = new Date("2026-09-26T12:15:00.000Z")
const configured: NodeJS.ProcessEnv = {
  APP_ENV: "production",
  EMAIL_DELIVERY_MODE: "live",
  EMAIL_FROM: "alerts@ewatrade.example",
  PLAY_REFUND_REVIEW_ALERTS_ENABLED: "true",
  PLAY_REFUND_REVIEW_ALERT_EMAILS:
    "operator@ewatrade.example,backup@ewatrade.example",
  RESEND_API_KEY: "fixture-key",
}
const reviewQueue = {
  cases: [
    {
      id: "internal-case-id",
      tenantId: "internal-tenant-id",
      refundReason: 7,
      occurredAt: new Date("2026-09-25T14:00:00.000Z"),
      responseDueAt: new Date("2026-09-26T14:00:00.000Z"),
      receivedAt: new Date("2026-09-25T14:01:00.000Z"),
      responseStatus: "CLAIMED" as const,
    },
  ],
  total: 1,
  overdue: 0,
}

test("disabled alerts do not read the queue or send mail", async () => {
  const result = await runPlayRefundReviewAlert(
    {
      loadQueue: async () => {
        throw new Error("queue must not be read")
      },
      send: async () => {
        throw new Error("mail must not be sent")
      },
    },
    { ...configured, PLAY_REFUND_REVIEW_ALERTS_ENABLED: "false" },
    now,
  )
  expect(result).toEqual({ status: "disabled", unresolved: 0, sent: 0 })
})

test("enabled alerts require a real transport and explicit recipients before querying", async () => {
  let queried = false
  const dependencies = {
    loadQueue: async () => {
      queried = true
      return reviewQueue
    },
    send: async () => undefined,
  }
  await expect(
    runPlayRefundReviewAlert(
      dependencies,
      { ...configured, RESEND_API_KEY: "" },
      now,
    ),
  ).rejects.toThrow("delivery is not configured")
  await expect(
    runPlayRefundReviewAlert(
      dependencies,
      { ...configured, PLAY_REFUND_REVIEW_ALERT_EMAILS: "" },
      now,
    ),
  ).rejects.toThrow("recipients are not configured")
  expect(queried).toBe(false)
})

test("an empty operator queue sends no email", async () => {
  const result = await runPlayRefundReviewAlert(
    {
      loadQueue: async () => ({ cases: [], total: 0, overdue: 0 }),
      send: async () => {
        throw new Error("mail must not be sent")
      },
    },
    configured,
    now,
  )
  expect(result).toEqual({ status: "empty", unresolved: 0, sent: 0 })
})

test("a configured Resend display-name sender can carry a refund alert", async () => {
  const sent: EmailMessage[] = []
  await runPlayRefundReviewAlert(
    {
      loadQueue: async () => reviewQueue,
      send: async (message) => {
        sent.push(message)
      },
    },
    { ...configured, EMAIL_FROM: "EwaTrade Alerts <alerts@ewatrade.example>" },
    now,
  )
  expect(sent).toHaveLength(2)
  expect(sent[0]?.from).toBe("EwaTrade Alerts <alerts@ewatrade.example>")
})

test("alerts contain only aggregate facts and stable hourly idempotency keys", async () => {
  const messages: EmailMessage[] = []
  const dependencies = {
    loadQueue: async () => reviewQueue,
    send: async (message: EmailMessage) => {
      messages.push(message)
    },
  }
  const first = await runPlayRefundReviewAlert(dependencies, configured, now)
  await runPlayRefundReviewAlert(
    dependencies,
    configured,
    new Date("2026-09-26T12:30:00.000Z"),
  )
  expect(first).toEqual({ status: "sent", unresolved: 1, sent: 2 })
  expect(messages).toHaveLength(4)
  expect(messages[0]?.idempotencyKey).toBe(messages[2]?.idempotencyKey)
  expect(messages[1]?.idempotencyKey).toBe(messages[3]?.idempotencyKey)
  expect(messages[0]?.idempotencyKey).not.toBe(messages[1]?.idempotencyKey)
  expect(JSON.stringify(messages)).not.toContain("internal-case-id")
  expect(JSON.stringify(messages)).not.toContain("internal-tenant-id")
  expect(messages[0]?.text).toContain("Earliest response deadline")
  expect(messages[0]?.html).toContain('data-email-system="warm-desk"')
  expect(messages[0]?.text).toBe(
    [
      "Unresolved cases: 1",
      "Overdue cases: 0",
      "Earliest response deadline (UTC): 2026-09-26T14:00:00.000Z",
      "Inspect the platform-admin refund-review queue and follow the reviewed operator procedure.",
      "A CLAIMED or UNCERTAIN response must be reconciled with Google manually; do not submit it again.",
      "This email contains no purchase token, order ID or customer information.",
    ].join("\n"),
  )
})

test("a failed recipient keeps the scheduled alert visibly failed", async () => {
  await expect(
    runPlayRefundReviewAlert(
      {
        loadQueue: async () => reviewQueue,
        send: async (message) => {
          if (message.to.startsWith("backup")) throw new Error("provider down")
        },
      },
      configured,
      now,
    ),
  ).rejects.toThrow("delivery failed for 1 recipient")
})
