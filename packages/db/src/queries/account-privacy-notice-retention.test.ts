import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  getApprovedNoticeRetentionPolicy,
  noticeProviderRetentionDeadline,
  noticeRetentionEvidence,
  noticeRetentionIsConfirmed,
} from "./account-privacy-notice-retention"
const now = new Date("2026-10-21T10:00:00.000Z")
const sendBy = "2026-10-21T12:00:00.000Z"
const raw = {
  version: "v1",
  approvalReference: "actual-owner-approval",
  ownerApprovalDigest: "1".repeat(64),
  operatorUserId: "operator",
  approvedAt: "2026-10-21T09:00:00.000Z",
  requestId: "case",
  subjectUserId: "subject",
  contentDigest: "a".repeat(64),
  recipientDigest: "b".repeat(64),
  provider: "resend",
  retentionDays: 30,
  sendBy,
  retentionUntil: "2026-11-20T12:00:00.000Z",
  reviewAt: "2026-10-21T13:00:00.000Z",
}
function environment(value: unknown = raw) {
  const source = JSON.stringify(value)
  return {
    ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION: "v1",
    ACCOUNT_PRIVACY_NOTICE_RETENTION_POLICY_JSON: source,
    ACCOUNT_PRIVACY_APPROVED_NOTICE_RETENTION_POLICY_SHA256: createHash(
      "sha256",
    )
      .update(source)
      .digest("hex"),
  }
}
const policy = getApprovedNoticeRetentionPolicy(environment(), now)
if (!policy) throw Error("Fixture rejected")
const binding = {
  requestId: "case",
  subjectUserId: "subject",
  attemptId: "attempt",
  contentDigest: raw.contentDigest,
  recipientDigest: "b".repeat(64),
  originalExternalEvidenceDigest: "c".repeat(64),
  originalExternalPolicyDigest: "d".repeat(64),
  profileEvidenceDigest: "e".repeat(64),
  profilePolicyDigest: "f".repeat(64),
  operatorUserId: "operator",
  preparedAt: now.toISOString(),
}
const record = noticeRetentionEvidence(policy, binding)
const check = { policy, binding, recorded: record, now }
test("only exact current approved duration and owner/case policy parses", () => {
  expect(getApprovedNoticeRetentionPolicy(environment(), now)).not.toBeNull()
  for (const value of [
    { ...raw, retentionDays: 31 },
    { ...raw, retentionUntil: "2026-11-21T12:00:00.000Z" },
    { ...raw, retentionUntil: "2026-11-19T12:00:00.000Z" },
    { ...raw, approvedAt: "2026-10-21T11:00:00.000Z" },
    { ...raw, operatorUserId: "subject" },
    { ...raw, reviewAt: now.toISOString() },
    { ...raw, ownerApprovalDigest: "invalid" },
    { ...raw, extra: true },
  ])
    expect(getApprovedNoticeRetentionPolicy(environment(value), now)).toBeNull()
  expect(
    getApprovedNoticeRetentionPolicy(
      {
        ...environment(),
        ACCOUNT_PRIVACY_APPROVED_NOTICE_RETENTION_POLICY_SHA256: "0".repeat(64),
      },
      now,
    ),
  ).toBeNull()
  expect(
    getApprovedNoticeRetentionPolicy(environment(), new Date(Number.NaN)),
  ).toBeNull()
})
test("prepared record binds immutable old proof and actual profile, exact one-use attempt and actor", () => {
  expect(noticeRetentionIsConfirmed(check)).toBe(true)
  for (const key of [
    "requestId",
    "subjectUserId",
    "attemptId",
    "contentDigest",
    "recipientDigest",
    "originalExternalEvidenceDigest",
    "originalExternalPolicyDigest",
    "profileEvidenceDigest",
    "profilePolicyDigest",
  ] as const)
    expect(
      noticeRetentionIsConfirmed({
        ...check,
        binding: { ...binding, [key]: "changed" },
      }),
    ).toBe(false)
  for (const change of [
    { ...record, operatorUserId: "other" },
    { ...record, evidenceDigest: "0".repeat(64) },
    { ...record, extra: true },
  ])
    expect(noticeRetentionIsConfirmed({ ...check, recorded: change })).toBe(
      false,
    )
  expect(() =>
    noticeRetentionEvidence(policy, {
      ...binding,
      preparedAt: "2026-10-21T12:00:01.000Z",
    }),
  ).toThrow()
  expect(() =>
    noticeRetentionEvidence(policy, { ...binding, operatorUserId: "subject" }),
  ).toThrow()
  expect(
    noticeRetentionIsConfirmed({
      ...check,
      now: new Date("2026-10-21T09:59:59.000Z"),
    }),
  ).toBe(false)
})
test("planned proof survives its send phase but actual retention is exactly30days from authenticated send", () => {
  const sentAt = new Date("2026-10-21T10:01:00.000Z")
  const later = new Date("2026-10-21T10:02:00.000Z")
  expect(noticeRetentionIsConfirmed({ ...check, now: later, sentAt })).toBe(
    true,
  )
  expect(noticeProviderRetentionDeadline(sentAt).toISOString()).toBe(
    "2026-11-20T10:01:00.000Z",
  )
  expect(
    noticeRetentionIsConfirmed({
      ...check,
      now: new Date("2026-10-21T12:01:00.000Z"),
      sentAt: new Date("2026-10-21T12:00:01.000Z"),
    }),
  ).toBe(false)
  expect(
    noticeRetentionIsConfirmed({
      ...check,
      now: later,
      sentAt: new Date(Number.NaN),
    }),
  ).toBe(false)
  expect(noticeRetentionIsConfirmed({ ...check, now, sentAt })).toBe(false)
  expect(() => noticeProviderRetentionDeadline(new Date(Number.NaN))).toThrow()
})
