import { afterEach, expect, spyOn, test } from "bun:test"
import { createHash, createHmac } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import * as completion from "./account-privacy-completion"
import {
  claimAccountPrivacyNoticeSend,
  prepareAccountPrivacyNotice,
} from "./account-privacy-notice-preparation"
const previous = { ...process.env }
afterEach(() => {
  for (const key of Object.keys(process.env))
    if (key.startsWith("ACCOUNT_PRIVACY_")) delete process.env[key]
  Object.assign(process.env, previous)
})
const now = new Date("2026-10-21T10:00:00.000Z")
const digest = "a".repeat(64)
function setup(contactEmail = "disposable@example.test") {
  const policy = {
    version: "v1",
    approvalReference: "owner",
    ownerApprovalDigest: "1".repeat(64),
    operatorUserId: "operator",
    approvedAt: "2026-10-21T09:00:00.000Z",
    requestId: "case",
    subjectUserId: "subject",
    contentDigest: digest,
    recipientDigest: createHmac("sha256", "k".repeat(32))
      .update("disposable@example.test")
      .digest("hex"),
    provider: "resend",
    retentionDays: 30,
    sendBy: "2026-10-21T12:00:00.000Z",
    retentionUntil: "2026-11-20T12:00:00.000Z",
    reviewAt: "2026-10-21T13:00:00.000Z",
  }
  const raw = JSON.stringify(policy)
  const profile = JSON.stringify({
    version: "v1",
    approvalReference: "approved-profile",
    approvedAt: policy.approvedAt,
    mode: "PSEUDONYMIZE",
    legalAcceptanceDisposition: "ERASE",
    retentionPurpose: "Restricted case contact/evidence",
    reviewAt: policy.reviewAt,
  })
  Object.assign(process.env, {
    ACCOUNT_PRIVACY_PROCESSING_ENABLED: "true",
    ACCOUNT_PRIVACY_NOTICE_SENDING_ENABLED: "true",
    ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION: "v1",
    ACCOUNT_PRIVACY_APPROVED_NOTICE_CONTENT_DIGEST: digest,
    ACCOUNT_PRIVACY_NOTICE_RECIPIENT_HMAC_KEY: "k".repeat(32),
    ACCOUNT_PRIVACY_NOTICE_RETENTION_POLICY_JSON: raw,
    ACCOUNT_PRIVACY_APPROVED_NOTICE_RETENTION_POLICY_SHA256: createHash(
      "sha256",
    )
      .update(raw)
      .digest("hex"),
    ACCOUNT_PRIVACY_PROFILE_POLICY_JSON: profile,
    ACCOUNT_PRIVACY_APPROVED_PROFILE_POLICY_SHA256: createHash("sha256")
      .update(profile)
      .digest("hex"),
  })
  const original = {
    processor: "account-privacy-external-review-v1",
    evidenceDigest: "c".repeat(64),
    policyDigest: "d".repeat(64),
    preserved: "old case evidence",
  }
  let outcome: Record<string, unknown> = {
    externalProcessorReview: original,
    otherPreserved: "unrelated case evidence",
  }
  let attempt: Record<string, unknown> | null = null
  let creates = 0
  const tx = {
    user: { findUnique: async () => ({ isPlatformAdmin: true }) },
    accountPrivacyRequest: {
      findUnique: async () => ({
        id: "case",
        status: "PROCESSING",
        contactEmail,
        verifiedSubjectUserId: "subject",
        verifiedAt: new Date("2026-10-20T10:00:00.000Z"),
        outcome,
        domainOutcomes: [
          {
            domain: "ACCOUNT_PROFILE",
            processor: "account-privacy-profile-v1",
            evidenceDigest: "e".repeat(64),
          },
        ],
      }),
      update: async ({
        data,
      }: { data: { outcome: Record<string, unknown> } }) => {
        outcome = data.outcome
      },
    },
    accountPrivacyNoticeAttempt: {
      findMany: async () => (attempt ? [attempt] : []),
      findUnique: async () => attempt,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        creates++
        attempt = { ...data, id: "attempt", status: "PREPARED" }
        return { id: "attempt", idempotencyKey: data.idempotencyKey }
      },
      updateMany: async () => {
        if (attempt) attempt.status = "SENDING"
        return { count: 1 }
      },
    },
  }
  const db = {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
  } as unknown as PrismaClient
  return {
    db,
    original,
    getOutcome: () => outcome,
    getAttempt: () => attempt,
    creates: () => creates,
  }
}
test("normal prepare appends exact authorization atomically without changing earlier evidence; identical replay and claim work", async () => {
  const f = setup()
  const spy = spyOn(
    completion,
    "assessAccountPrivacyCompletion",
  ).mockResolvedValue({
    eligible: false,
    blockers: [],
    missingDomains: ["OUTCOME_NOTICE"],
  })
  try {
    const input = {
      requestId: "case",
      operatorUserId: "operator",
      contentDigest: digest,
      now,
    }
    await expect(
      prepareAccountPrivacyNotice(f.db, input),
    ).resolves.toMatchObject({ attemptId: "attempt", replay: false })
    expect(f.getOutcome().externalProcessorReview).toBe(f.original)
    expect(f.getOutcome().otherPreserved).toBe("unrelated case evidence")
    expect(f.getOutcome().noticeProviderRetention).toBeTruthy()
    await expect(
      prepareAccountPrivacyNotice(f.db, input),
    ).resolves.toMatchObject({ replay: true })
    expect(f.creates()).toBe(1)
    await expect(
      claimAccountPrivacyNoticeSend(f.db, {
        attemptId: "attempt",
        operatorUserId: "operator",
        contentDigest: digest,
        now,
      }),
    ).resolves.toMatchObject({
      attemptId: "attempt",
      recipient: "disposable@example.test",
    })
    await expect(
      prepareAccountPrivacyNotice(f.db, input),
    ).rejects.toMatchObject({ code: "CLAIM_CONFLICT" })
    expect(f.creates()).toBe(1)
    const uncertain = f.getAttempt()
    if (!uncertain) throw Error("Missing test attempt")
    uncertain.status = "UNCERTAIN"
    await expect(
      prepareAccountPrivacyNotice(f.db, input),
    ).rejects.toMatchObject({ code: "CLAIM_CONFLICT" })
    expect(f.creates()).toBe(1)
  } finally {
    spy.mockRestore()
  }
})
test("a changed authorization or expired send window cannot prepare an attempt", async () => {
  const f = setup()
  const spy = spyOn(
    completion,
    "assessAccountPrivacyCompletion",
  ).mockResolvedValue({
    eligible: false,
    blockers: [],
    missingDomains: ["OUTCOME_NOTICE"],
  })
  try {
    await expect(
      prepareAccountPrivacyNotice(f.db, {
        requestId: "case",
        operatorUserId: "other",
        contentDigest: digest,
        now,
      }),
    ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
    await expect(
      prepareAccountPrivacyNotice(f.db, {
        requestId: "case",
        operatorUserId: "operator",
        contentDigest: digest,
        now: new Date("2026-10-21T12:00:01.000Z"),
      }),
    ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
    expect(f.creates()).toBe(0)
  } finally {
    spy.mockRestore()
  }
})

test("owner-approved recipient cannot drift with changed case contact or policy recipient", async () => {
  const f = setup("changed@example.test")
  const spy = spyOn(
    completion,
    "assessAccountPrivacyCompletion",
  ).mockResolvedValue({
    eligible: false,
    blockers: [],
    missingDomains: ["OUTCOME_NOTICE"],
  })
  try {
    await expect(
      prepareAccountPrivacyNotice(f.db, {
        requestId: "case",
        operatorUserId: "operator",
        contentDigest: digest,
        now,
      }),
    ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
    expect(f.creates()).toBe(0)
    const g = setup()
    const p = JSON.parse(
      process.env.ACCOUNT_PRIVACY_NOTICE_RETENTION_POLICY_JSON ?? "null",
    )
    p.recipientDigest = "0".repeat(64)
    const raw = JSON.stringify(p)
    process.env.ACCOUNT_PRIVACY_NOTICE_RETENTION_POLICY_JSON = raw
    process.env.ACCOUNT_PRIVACY_APPROVED_NOTICE_RETENTION_POLICY_SHA256 =
      createHash("sha256").update(raw).digest("hex")
    await expect(
      prepareAccountPrivacyNotice(g.db, {
        requestId: "case",
        operatorUserId: "operator",
        contentDigest: digest,
        now,
      }),
    ).rejects.toMatchObject({ code: "POLICY_NOT_APPROVED" })
    expect(g.creates()).toBe(0)
  } finally {
    spy.mockRestore()
  }
})
