import { expect, test } from "bun:test"
import type { EmailMessage } from "@ewatrade/email"
import { runAccountPrivacyNoticeAlert } from "./account-privacy-notice-alert"

const now = new Date("2026-09-27T12:15:00.000Z")
const configured: NodeJS.ProcessEnv = {
  APP_ENV: "preview",
  EMAIL_DELIVERY_MODE: "live",
  EMAIL_FROM: "privacy-alerts@ewatrade.example",
  ACCOUNT_PRIVACY_NOTICE_ALERTS_ENABLED: "true",
  ACCOUNT_PRIVACY_NOTICE_ALERT_EMAILS:
    "operator@ewatrade.example,backup@ewatrade.example",
  RESEND_API_KEY: "fixture-key",
}
const summary = {
  failed: 1,
  uncertain: 1,
  staleSending: 1,
  deliveryUnconfirmed: 1,
  failedAfterCompletion: 1,
  total: 4,
}

test("disabled notice monitor neither queries nor sends", async () => {
  const result = await runAccountPrivacyNoticeAlert(
    {
      loadSummary: async () => {
        throw new Error("query must not run")
      },
      send: async () => {
        throw new Error("email must not send")
      },
    },
    { ...configured, ACCOUNT_PRIVACY_NOTICE_ALERTS_ENABLED: "false" },
    now,
  )
  expect(result).toEqual({ status: "disabled", unresolved: 0, sent: 0 })
})

test("enabled notice monitor requires an explicit live transport and recipients", async () => {
  let queried = false
  const dependencies = {
    loadSummary: async () => {
      queried = true
      return summary
    },
    send: async () => undefined,
  }
  await expect(
    runAccountPrivacyNoticeAlert(
      dependencies,
      { ...configured, EMAIL_DELIVERY_MODE: "console" },
      now,
    ),
  ).rejects.toThrow("delivery is not configured")
  await expect(
    runAccountPrivacyNoticeAlert(
      dependencies,
      { ...configured, ACCOUNT_PRIVACY_NOTICE_ALERT_EMAILS: "" },
      now,
    ),
  ).rejects.toThrow("recipients are not configured")
  expect(queried).toBe(false)
})

test("empty notice custody sends nothing", async () => {
  const result = await runAccountPrivacyNoticeAlert(
    {
      loadSummary: async () => ({
        failed: 0,
        uncertain: 0,
        staleSending: 0,
        deliveryUnconfirmed: 0,
        failedAfterCompletion: 0,
        total: 0,
      }),
      send: async () => {
        throw new Error("email must not send")
      },
    },
    configured,
    now,
  )
  expect(result).toEqual({ status: "empty", unresolved: 0, sent: 0 })
})

test("a configured Resend display-name sender can carry a privacy alert", async () => {
  const sent: EmailMessage[] = []
  await runAccountPrivacyNoticeAlert(
    {
      loadSummary: async () => summary,
      send: async (message) => {
        sent.push(message)
      },
    },
    {
      ...configured,
      EMAIL_FROM: "EwaTrade Privacy <privacy@ewatrade.example>",
    },
    now,
  )
  expect(sent).toHaveLength(2)
  expect(sent[0]?.from).toBe("EwaTrade Privacy <privacy@ewatrade.example>")
})

test("notice alerts contain aggregate counts and stable hourly keys", async () => {
  const messages: EmailMessage[] = []
  const dependencies = {
    loadSummary: async () => summary,
    send: async (message: EmailMessage) => {
      messages.push(message)
    },
  }
  expect(
    await runAccountPrivacyNoticeAlert(dependencies, configured, now),
  ).toEqual({
    status: "sent",
    unresolved: 4,
    sent: 2,
  })
  await runAccountPrivacyNoticeAlert(
    dependencies,
    configured,
    new Date("2026-09-27T12:30:00.000Z"),
  )
  expect(messages).toHaveLength(4)
  expect(messages[0]?.idempotencyKey).toBe(messages[2]?.idempotencyKey)
  expect(messages[1]?.idempotencyKey).toBe(messages[3]?.idempotencyKey)
  expect(messages[0]?.idempotencyKey).not.toBe(messages[1]?.idempotencyKey)
  expect(messages[0]?.text).toContain("Failures after a completed request: 1")
  expect(messages[0]?.html).toContain('data-email-system="warm-desk"')
  expect(messages[0]?.text).toBe(
    [
      "Failed notices: 1",
      "Failures after a completed request: 1",
      "Uncertain sends: 1",
      "Sends in progress over 10 minutes: 1",
      "Accepted sends without delivery over 1 hour: 1",
      "Inspect the platform-admin account-deletion review queue and provider event history.",
      "Do not resend an uncertain attempt without reconciling the original provider outcome.",
      "This alert contains no person, request, message or recipient identifier.",
    ].join("\n"),
  )
  expect(JSON.stringify(messages)).not.toContain("request-id")
  expect(JSON.stringify(messages)).not.toContain("recipient@example.test")
})

test("a failed alert recipient keeps the scheduled run visibly failed", async () => {
  await expect(
    runAccountPrivacyNoticeAlert(
      {
        loadSummary: async () => summary,
        send: async (message) => {
          if (message.to.startsWith("backup")) throw new Error("provider down")
        },
      },
      configured,
      now,
    ),
  ).rejects.toThrow("delivery failed for 1 recipient")
})
