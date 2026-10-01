import { afterEach, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { prepareAccountPrivacyNotice } from "./account-privacy-notice-preparation"

const names = [
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED",
  "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
  "ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST",
  "ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY",
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
  contentDigest: "a".repeat(64),
}

test("notice preparation stops before database access while sending is disabled", async () => {
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED = "false"
  await expect(prepareAccountPrivacyNotice(db, input)).rejects.toMatchObject({
    code: "DISABLED",
  })
})

test("notice preparation requires an exact approved content digest", async () => {
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = "approved-v1"
  process.env.ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY = "k".repeat(32)
  process.env.ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST = "b".repeat(64)
  await expect(prepareAccountPrivacyNotice(db, input)).rejects.toMatchObject({
    code: "POLICY_NOT_APPROVED",
  })
})
