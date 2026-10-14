import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  accountPrivacyExternalEvidence,
  accountPrivacyExternalReviewIsConfirmed,
  getApprovedAccountPrivacyExternalPolicy,
} from "./account-privacy-external-policy"
import { recordAccountPrivacyExternalReview } from "./account-privacy-external-review"
const now = new Date("2026-10-12T12:00:00.000Z")
const verifiedAt = new Date("2026-10-12T11:00:00.000Z")
const keys = [
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_EXTERNAL_REVIEW_ENABLED",
  "ACCOUNT_PRIVACY_EXTERNAL_POLICY_JSON",
  "ACCOUNT_PRIVACY_APPROVED_EXTERNAL_POLICY_SHA256",
  "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
]
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = original[key]
  }
})
const schedule = {
  version: "qa-v1",
  approvalReference: "synthetic-tests-only",
  approvedAt: "2026-10-11T00:00:00.000Z",
  reviewAt: "2026-11-12T00:00:00.000Z",
  mode: "REVIEW_PROVIDER_CONFIRMATIONS",
  providers: [
    {
      key: "mail",
      disposition: "ERASURE_CONFIRMED",
      purpose: "Synthetic confirmation",
      expiresAt: null,
    },
    {
      key: "backups",
      disposition: "RETENTION_APPROVED",
      purpose: "Synthetic bounded backup expiry",
      expiresAt: "2026-10-20T00:00:00.000Z",
    },
  ] satisfies [unknown, unknown],
}
function configure(overrides = {}) {
  const raw = JSON.stringify({ ...schedule, ...overrides })
  Object.assign(process.env, {
    ACCOUNT_PRIVACY_PROCESSING_ENABLED: "true",
    ACCOUNT_PRIVACY_EXTERNAL_REVIEW_ENABLED: "true",
    ACCOUNT_PRIVACY_EXTERNAL_POLICY_JSON: raw,
    ACCOUNT_PRIVACY_APPROVED_EXTERNAL_POLICY_SHA256: createHash("sha256")
      .update(raw)
      .digest("hex"),
    ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION: "qa-v1",
  })
}
const receipts = [
  { provider: "mail", evidenceDigest: "a".repeat(64), confirmedAt: now },
  { provider: "backups", evidenceDigest: "b".repeat(64), confirmedAt: now },
] satisfies [unknown, unknown]
const input = {
  requestId: "request",
  operatorUserId: "operator",
  confirmationsReviewed: true as const,
  receipts,
  now,
}
function database(
  overrides: { admin?: boolean; request?: object; existing?: object } = {},
) {
  const writes: unknown[] = []
  const tx = {
    user: {
      findUnique: async () => ({ isPlatformAdmin: overrides.admin ?? true }),
    },
    accountPrivacyRequest: {
      findUnique: async () => ({
        id: "request",
        userId: "subject",
        verifiedSubjectUserId: "subject",
        requestKey: "account-deletion:subject",
        verifiedAt,
        status: "PROCESSING",
        contactEmail: "subject@example.test",
        user: { email: "subject@example.test", emailVerified: true },
        accessRevocation: { status: "REVOKED", userId: "subject" },
        ...overrides.request,
      }),
      update: async (value: unknown) => writes.push(value),
    },
    accountPrivacyDomainOutcome: {
      findUnique: async () => overrides.existing ?? null,
      create: async (value: unknown) => writes.push(value),
    },
  }
  return {
    db: {
      $transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
    } as unknown as PrismaClient,
    writes,
  }
}
test("external schedule requires exact approval, complete unique provider scope and bounded retention", () => {
  configure()
  expect(
    getApprovedAccountPrivacyExternalPolicy(process.env, now)?.providers,
  ).toHaveLength(2)
  for (const overrides of [
    { mode: "SKIP_PROVIDERS" },
    { version: "other" },
    { providers: [] },
    { providers: [schedule.providers[0], schedule.providers[0]] },
    { approvedAt: "2027-01-01T00:00:00.000Z" },
    { reviewAt: "2026-01-01T00:00:00.000Z" },
    { providers: [{ ...schedule.providers[1], expiresAt: null }] },
    { extra: true },
  ]) {
    configure(overrides)
    expect(getApprovedAccountPrivacyExternalPolicy(process.env, now)).toBeNull()
  }
  configure()
  process.env.ACCOUNT_PRIVACY_EXTERNAL_POLICY_JSON += " "
  expect(getApprovedAccountPrivacyExternalPolicy(process.env, now)).toBeNull()
})
test("disabled review cannot touch DB; missing, duplicate and foreign receipts cannot be certified", async () => {
  configure()
  process.env.ACCOUNT_PRIVACY_EXTERNAL_REVIEW_ENABLED = "false"
  const untouched = {
    $transaction: () => {
      throw Error("database must not be called")
    },
  } as unknown as PrismaClient
  await expect(
    recordAccountPrivacyExternalReview(untouched, input),
  ).rejects.toMatchObject({ code: "DISABLED" })
  configure()
  for (const supplied of [
    [],
    [receipts[0]],
    [receipts[0], receipts[0]],
    [receipts[0], { ...receipts[1], provider: "unknown" }],
  ])
    await expect(
      recordAccountPrivacyExternalReview(untouched, {
        ...input,
        receipts: supplied,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_EVIDENCE_REQUIRED" })
})
test("a policy-backed reviewed receipt creates retention, never an invented erasure of backups", async () => {
  configure()
  const f = database()
  expect(await recordAccountPrivacyExternalReview(f.db, input)).toMatchObject({
    providersReviewed: 2,
    retainedProviders: 1,
    replay: false,
  })
  expect(f.writes[1]).toMatchObject({
    data: {
      domain: "EXTERNAL_PROCESSORS",
      disposition: "RETENTION_APPROVED",
      nextReviewAt: new Date(schedule.providers[1].expiresAt as string),
    },
  })
  expect(JSON.stringify(f.writes)).not.toContain("subject@example.test")
})
test("operator, subject, verification and confirmation-time failures cannot write outcomes", async () => {
  configure()
  const forbidden = database({ admin: false })
  await expect(
    recordAccountPrivacyExternalReview(forbidden.db, input),
  ).rejects.toMatchObject({ code: "OPERATOR_REQUIRED" })
  expect(forbidden.writes).toEqual([])
  for (const request of [
    { userId: "other" },
    { verifiedSubjectUserId: "other" },
    { verifiedSubjectUserId: "operator", userId: "operator" },
    { status: "COMPLETED" },
    { contactEmail: "other@example.test" },
    { accessRevocation: { status: "PENDING", userId: "subject" } },
  ]) {
    const f = database({ request })
    await expect(
      recordAccountPrivacyExternalReview(f.db, input),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    expect(f.writes).toEqual([])
  }
  for (const confirmedAt of [
    new Date("2026-10-12T10:00:00.000Z"),
    new Date("2026-10-13T00:00:00.000Z"),
  ]) {
    const f = database()
    await expect(
      recordAccountPrivacyExternalReview(f.db, {
        ...input,
        receipts: receipts.map((row) => ({ ...row, confirmedAt })),
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_EVIDENCE_REQUIRED" })
    expect(f.writes).toEqual([])
  }
})
test("profile/completion recheck subject, approved scope and stored receipt integrity", () => {
  configure()
  const policy = getApprovedAccountPrivacyExternalPolicy(process.env, now)
  if (!policy) throw Error("fixture policy missing")
  const digest = accountPrivacyExternalEvidence({
    requestId: "request",
    subjectId: "subject",
    policy,
    receipts,
    operatorUserId: "operator",
    processedAt: now,
  })
  const outcome = {
    processor: "account-privacy-external-review-v1",
    policyVersion: "qa-v1",
    evidenceDigest: digest,
    disposition: "RETENTION_APPROVED",
    processedAt: now,
    nextReviewAt: new Date("2026-10-20T00:00:00.000Z"),
  }
  const recorded = {
    processor: outcome.processor,
    policyDigest: policy.digest,
    operatorUserId: "operator",
    evidenceDigest: digest,
    providers: policy.providers,
    receipts,
  }
  const check = {
    requestId: "request",
    subjectId: "subject",
    verifiedAt,
    outcome,
    recorded,
    now,
  }
  expect(accountPrivacyExternalReviewIsConfirmed(check)).toBe(true)
  expect(
    accountPrivacyExternalReviewIsConfirmed({
      ...check,
      recorded: {
        ...recorded,
        providers: policy.providers.map((provider) =>
          Object.fromEntries(
            Object.entries(provider).sort(([a], [b]) => a.localeCompare(b)),
          ),
        ),
      },
    }),
  ).toBe(true)
  expect(
    accountPrivacyExternalReviewIsConfirmed({ ...check, subjectId: "other" }),
  ).toBe(false)
  expect(
    accountPrivacyExternalReviewIsConfirmed({
      ...check,
      recorded: { ...recorded, receipts: receipts.slice(1) },
    }),
  ).toBe(false)
  expect(
    accountPrivacyExternalReviewIsConfirmed({
      ...check,
      outcome: { ...outcome, disposition: "ERASURE_CONFIRMED" },
    }),
  ).toBe(false)
  expect(
    accountPrivacyExternalReviewIsConfirmed({
      ...check,
      recorded: { ...recorded, policyDigest: "c".repeat(64) },
    }),
  ).toBe(false)
})
