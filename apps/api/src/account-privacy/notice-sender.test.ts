import { afterEach, expect, test } from "bun:test"
import type { PrismaClient } from "@ewatrade/db"
import { accountPrivacyNoticeContentDigest } from "@ewatrade/db/queries"
import { renderAccountPrivacyOutcomeTemplate } from "@ewatrade/email"
import { sendAccountPrivacyOutcomeNotice } from "./notice-sender"

const names = [
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED",
  "ACCOUNT_PRIVACY_NOTICE_WEBHOOK_ENABLED",
  "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
  "ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST",
  "ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY",
  "ACCOUNT_PRIVACY_RESEND_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_REPLY_TO",
] as const
const previous = Object.fromEntries(
  names.map((name) => [name, process.env[name]]),
)

afterEach(() => {
  for (const name of names) {
    const value = previous[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

const db = {
  $transaction: () => {
    throw new Error("database must not be touched")
  },
} as unknown as PrismaClient
const input = {
  requestId: "request-1",
  operatorUserId: "operator-1",
  subject: "Account deletion outcome",
  text: "Approved notice text",
  html: "<p>Approved notice text</p>",
}
const transport = {
  send: () => {
    throw new Error("email must not be sent")
  },
}

test("notice sender cannot reach the database or provider while disabled", async () => {
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED = "false"
  await expect(
    sendAccountPrivacyOutcomeNotice(db, input, { transport }),
  ).rejects.toMatchObject({ code: "DISABLED" })
})

test("notice sender rejects an unapproved exact message before provider work", async () => {
  Object.assign(process.env, {
    ACCOUNT_PRIVACY_PROCESSING_ENABLED: "true",
    ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED: "true",
    ACCOUNT_PRIVACY_NOTICE_WEBHOOK_ENABLED: "true",
    ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION: "approved-v1",
    ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST: "b".repeat(64),
    ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY: "k".repeat(32),
    ACCOUNT_PRIVACY_RESEND_WEBHOOK_SECRET: "whsec_test",
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "privacy@example.test",
    EMAIL_REPLY_TO: "support@example.test",
  })
  await expect(
    sendAccountPrivacyOutcomeNotice(db, input, { transport }),
  ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
})

function configure(content: { subject: string; text: string; html: string }) {
  Object.assign(process.env, {
    ACCOUNT_PRIVACY_PROCESSING_ENABLED: "true",
    ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED: "true",
    ACCOUNT_PRIVACY_NOTICE_WEBHOOK_ENABLED: "true",
    ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION: "approved-v1",
    ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST:
      accountPrivacyNoticeContentDigest({
        from: "privacy@example.test",
        replyTo: "support@example.test",
        subject: content.subject,
        text: content.text,
        html: content.html,
      }),
    ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY: "k".repeat(32),
    ACCOUNT_PRIVACY_RESEND_WEBHOOK_SECRET: "whsec_test",
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "privacy@example.test",
    EMAIL_REPLY_TO: "support@example.test",
  })
}

test("approving the old raw notice cannot authorize a different Warm Desk message", async () => {
  configure(input)
  await expect(
    sendAccountPrivacyOutcomeNotice(db, input, { transport }),
  ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
})

test("only the exact approved Warm Desk message reaches the repository authority gate", async () => {
  const content = renderAccountPrivacyOutcomeTemplate(input)
  const canonical = { ...input, ...content }
  configure(canonical)
  await expect(
    sendAccountPrivacyOutcomeNotice(db, canonical, { transport }),
  ).rejects.toThrow("database must not be touched")
  await expect(
    sendAccountPrivacyOutcomeNotice(
      db,
      { ...canonical, subject: "Changed subject" },
      { transport },
    ),
  ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
  await expect(
    sendAccountPrivacyOutcomeNotice(
      db,
      { ...canonical, html: `${canonical.html} ` },
      { transport },
    ),
  ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
})
