import { expect, test } from "bun:test"
import { accountPrivacyNoticeContentDigest } from "@ewatrade/db/queries"
import { renderAccountPrivacyOutcomeTemplate } from "@ewatrade/email"
import {
  officePrivacyExternalReviewSchema,
  officePrivacyNoticeSchema,
} from "../schemas/office-privacy"
import { approvedOfficePrivacyNotice } from "./office-fulfillment"

test("operator notice requires exact approved shell, sender and reply address", () => {
  const input = {
    subject: "Synthetic outcome",
    text: "Synthetic fixture only. No actual deletion is claimed.",
  }
  const from = "privacy@example.test"
  const replyTo = "support@example.test"
  const env = {
    EMAIL_FROM: from,
    EMAIL_REPLY_TO: replyTo,
    ACCOUNT_PRIVACY_OUTCOME_NOTICE_JSON: JSON.stringify(input),
    ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST:
      accountPrivacyNoticeContentDigest({
        from,
        replyTo,
        subject: input.subject,
        ...renderAccountPrivacyOutcomeTemplate(input),
      }),
  }
  expect(approvedOfficePrivacyNotice(env)?.subject).toBe(input.subject)
  for (const changed of [
    { EMAIL_FROM: "other@example.test" },
    { EMAIL_REPLY_TO: "other@example.test" },
    {
      ACCOUNT_PRIVACY_OUTCOME_NOTICE_JSON: JSON.stringify({
        ...input,
        text: "Changed outcome",
      }),
    },
    { ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST: "f".repeat(64) },
  ])
    expect(approvedOfficePrivacyNotice({ ...env, ...changed })).toBeNull()
  expect(approvedOfficePrivacyNotice({})).toBeNull()
})
const base = {
  requestId: "synthetic",
  commandId: "00000000-0000-4000-8000-000000000001",
  reason: "Reviewed synthetic fixture",
}
test("evidence commands cannot override authority, subject, recipient or notice content", () => {
  const notice = {
    ...base,
    expectedStep: "DELIVER_OUTCOME",
    contentDigest: "a".repeat(64),
    contentReviewed: true,
  }
  expect(officePrivacyNoticeSchema.safeParse(notice).success).toBe(true)
  for (const extra of [
    { operatorUserId: "spoof" },
    { recipient: "other@example.test" },
    { html: "replacement" },
    { expectedStep: "COMPLETE" },
    { contentReviewed: false },
  ])
    expect(
      officePrivacyNoticeSchema.safeParse({ ...notice, ...extra }).success,
    ).toBe(false)
  const external = {
    ...base,
    expectedStep: "REVIEW_EXTERNAL_PROCESSORS",
    policyDigest: "b".repeat(64),
    confirmationsReviewed: true,
    receipts: [
      {
        provider: "synthetic-provider",
        evidenceDigest: "c".repeat(64),
        confirmedAt: "2026-10-13T00:00:00Z",
      },
    ],
  }
  expect(officePrivacyExternalReviewSchema.safeParse(external).success).toBe(
    true,
  )
  expect(
    officePrivacyExternalReviewSchema.safeParse({
      ...external,
      confirmationsReviewed: false,
    }).success,
  ).toBe(false)
  expect(
    officePrivacyExternalReviewSchema.safeParse({ ...external, receipts: [] })
      .success,
  ).toBe(false)
  expect(
    officePrivacyExternalReviewSchema.safeParse({
      ...external,
      operatorUserId: "spoof",
    }).success,
  ).toBe(false)
})
