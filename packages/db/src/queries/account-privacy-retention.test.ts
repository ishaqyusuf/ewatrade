import { afterEach, beforeEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import { accountPrivacyPseudonymousEmail } from "./account-privacy-profile-policy"
import {
  processAccountPrivacyRetention,
  reviewAccountPrivacyRetention,
} from "./account-privacy-retention"
import {
  accountPrivacyRetentionDeadlines,
  getApprovedAccountPrivacyRetentionPolicy,
} from "./account-privacy-retention-policy"

const completedAt = new Date("2026-02-28T13:04:05.006Z")
const keys = [
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_RETENTION_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_RETENTION_POLICY_JSON",
  "ACCOUNT_PRIVACY_APPROVED_RETENTION_POLICY_SHA256",
  "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
] as const
const previous = keys.map((key) => process.env[key])
const source = JSON.stringify({
  version: "qa-retention-v1",
  approvalReference: "qa-only-approval",
})
beforeEach(() => {
  process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_RETENTION_PROCESSING_ENABLED = "true"
  process.env.ACCOUNT_PRIVACY_RETENTION_POLICY_JSON = source
  process.env.ACCOUNT_PRIVACY_APPROVED_RETENTION_POLICY_SHA256 = createHash(
    "sha256",
  )
    .update(source)
    .digest("hex")
  process.env.ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION = "qa-retention-v1"
})
afterEach(() =>
  keys.forEach((key, index) => {
    const value = previous[index]
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }),
)

function fixture() {
  const policy = getApprovedAccountPrivacyRetentionPolicy()
  if (!policy) throw new Error("Missing QA retention policy")
  const row = {
    requestId: "request-1",
    subjectUserId: "subject-1",
    policyVersion: policy.version,
    policyDigest: policy.digest,
    completedAt,
    ...accountPrivacyRetentionDeadlines(completedAt),
    contactClearedAt: null as Date | null,
    holdReason: null as string | null,
    holdOwnerUserId: null as string | null,
    holdReviewAt: null as Date | null,
    request: {
      status: "COMPLETED",
      completedAt,
      verifiedSubjectUserId: "subject-1",
    },
  }
  const writes: Array<{ model: string; args: unknown }> = []
  let admin = true
  let activeAccounts = 0
  const writer = (model: string) => async (args: unknown) => {
    writes.push({ model, args })
    return { count: 1 }
  }
  const client = {
    accountPrivacyRetention: {
      findUnique: async () => row,
      update: async (args: { data: object }) => {
        writes.push({ model: "retention", args })
        Object.assign(row, args.data)
        return row
      },
    },
    accountPrivacyRequest: {
      update: writer("contact"),
      delete: writer("request"),
    },
    user: {
      findUnique: async (args: { where: { id: string } }) =>
        args.where.id === "operator-1"
          ? { isPlatformAdmin: admin }
          : {
              email: accountPrivacyPseudonymousEmail(
                row.requestId,
                row.subjectUserId,
              ),
            },
    },
    account: { count: async () => activeAccounts },
    session: { count: async () => 0 },
    membership: { count: async () => 0 },
    legalAcceptance: { deleteMany: writer("receipts") },
    accountPrivacyNoticeAttempt: {
      deleteMany: writer("notice"),
      updateMany: writer("notice-contact"),
    },
    accountPrivacyDomainOutcome: { deleteMany: writer("outcomes") },
    accountPrivacyAccessRecoveryEvent: { deleteMany: writer("recovery") },
    accountPrivacyAccessRevocation: { deleteMany: writer("access") },
    $transaction: async (run: (db: PrismaClient) => unknown) =>
      run(client as unknown as PrismaClient),
  } as unknown as PrismaClient
  return {
    client,
    row,
    writes,
    revokeAdmin: () => {
      admin = false
    },
    reactivate: () => {
      activeAccounts = 1
    },
  }
}

test("calendar deadlines clamp leap days and preserve UTC time", () => {
  const date = new Date("2024-02-29T13:04:05.006Z")
  const deadlines = accountPrivacyRetentionDeadlines(date)
  expect(deadlines.contactExpiresAt.toISOString()).toBe(
    "2024-05-29T13:04:05.006Z",
  )
  expect(deadlines.reviewDueAt.toISOString()).toBe("2025-02-28T13:04:05.006Z")
  expect(deadlines.evidenceExpiresAt.toISOString()).toBe(
    "2026-02-28T13:04:05.006Z",
  )
  expect(() => accountPrivacyRetentionDeadlines(new Date("invalid"))).toThrow()
})
test("unapproved or extended policy JSON stays closed", () => {
  expect(getApprovedAccountPrivacyRetentionPolicy()).not.toBeNull()
  process.env.ACCOUNT_PRIVACY_RETENTION_POLICY_JSON = `${source} `
  expect(getApprovedAccountPrivacyRetentionPolicy()).toBeNull()
})
test("contact clears at the 90-day boundary, once, without expiring evidence", async () => {
  const { client, row, writes } = fixture()
  expect(
    await processAccountPrivacyRetention(client, {
      requestId: row.requestId,
      now: new Date(row.contactExpiresAt.getTime() - 1),
    }),
  ).toEqual({ contactCleared: false, evidenceExpired: false, held: false })
  expect(writes).toHaveLength(0)
  expect(
    await processAccountPrivacyRetention(client, {
      requestId: row.requestId,
      now: row.contactExpiresAt,
    }),
  ).toEqual({ contactCleared: true, evidenceExpired: false, held: false })
  expect(writes.map((w) => w.model)).toEqual([
    "contact",
    "notice-contact",
    "retention",
  ])
  expect(
    await processAccountPrivacyRetention(client, {
      requestId: row.requestId,
      now: row.contactExpiresAt,
    }),
  ).toEqual({ contactCleared: false, evidenceExpired: false, held: false })
})
test("24-month expiry scopes old receipts and all evidence to the completed request", async () => {
  const { client, row, writes } = fixture()
  const result = await processAccountPrivacyRetention(client, {
    requestId: row.requestId,
    now: row.evidenceExpiresAt,
  })
  expect(result.evidenceExpired).toBe(true)
  expect(writes.find((w) => w.model === "receipts")?.args).toEqual({
    where: { userId: "subject-1", acceptedAt: { lte: completedAt } },
  })
  expect(
    writes
      .filter((w) =>
        ["notice", "outcomes", "recovery", "access"].includes(w.model),
      )
      .every(
        (w) =>
          JSON.stringify(w.args) ===
          JSON.stringify({ where: { requestId: "request-1" } }),
      ),
  ).toBe(true)
  expect(writes.at(-1)).toEqual({
    model: "request",
    args: { where: { id: "request-1" } },
  })
})
test("bounded named holds pause expiry and stop applying when overdue", async () => {
  const { client, row, writes } = fixture()
  Object.assign(row, {
    holdReason: "documented dispute",
    holdOwnerUserId: "operator-1",
    holdReviewAt: new Date(row.evidenceExpiresAt.getTime() + 1),
  })
  expect(
    (
      await processAccountPrivacyRetention(client, {
        requestId: row.requestId,
        now: row.evidenceExpiresAt,
      })
    ).held,
  ).toBe(true)
  expect(writes).toHaveLength(0)
  expect(
    (
      await processAccountPrivacyRetention(client, {
        requestId: row.requestId,
        now: row.holdReviewAt ?? row.evidenceExpiresAt,
      })
    ).evidenceExpired,
  ).toBe(true)
})
test("review needs current admin authority and cannot extend expiry", async () => {
  const f = fixture()
  const input = {
    requestId: "request-1",
    operatorUserId: "operator-1",
    hold: null,
    now: f.row.reviewDueAt,
  }
  f.revokeAdmin()
  await expect(
    reviewAccountPrivacyRetention(f.client, input),
  ).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" })
  expect(f.writes).toHaveLength(0)
  const g = fixture()
  await reviewAccountPrivacyRetention(g.client, input)
  expect(g.row.evidenceExpiresAt).toEqual(
    accountPrivacyRetentionDeadlines(completedAt).evidenceExpiresAt,
  )
  await expect(
    reviewAccountPrivacyRetention(g.client, {
      ...input,
      hold: {
        reason: "hold",
        reviewAt: new Date(input.now.getTime() + 91 * 86_400_000),
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_HOLD" })
})
test("stale subject, tampered deadlines and renewed access refuse expiry", async () => {
  const stale = fixture()
  stale.row.request.verifiedSubjectUserId = "other"
  await expect(
    processAccountPrivacyRetention(stale.client, {
      requestId: "request-1",
      now: stale.row.evidenceExpiresAt,
    }),
  ).rejects.toMatchObject({ code: "NOT_READY" })
  expect(stale.writes).toHaveLength(0)
  const tampered = fixture()
  tampered.row.evidenceExpiresAt = completedAt
  await expect(
    processAccountPrivacyRetention(tampered.client, {
      requestId: "request-1",
      now: completedAt,
    }),
  ).rejects.toMatchObject({ code: "NOT_READY" })
  const active = fixture()
  active.reactivate()
  await expect(
    processAccountPrivacyRetention(active.client, {
      requestId: "request-1",
      now: active.row.evidenceExpiresAt,
    }),
  ).rejects.toMatchObject({ code: "NOT_READY" })
  expect(
    active.writes.some((w) => w.model === "receipts" || w.model === "request"),
  ).toBe(false)
})
