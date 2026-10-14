import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  getApprovedAccountPrivacyActivityPolicy,
  processAccountPrivacyActivity,
} from "./account-privacy-activity"
const keys = [
  "ACCOUNT_PRIVACY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_ACTIVITY_PROCESSING_ENABLED",
  "ACCOUNT_PRIVACY_ACTIVITY_POLICY_JSON",
  "ACCOUNT_PRIVACY_APPROVED_ACTIVITY_POLICY_SHA256",
  "ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION",
]
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
afterEach(() => {
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})
const now = new Date("2026-10-12T12:00:00.000Z")
const policy = {
  version: "test-v1",
  approvalReference: "synthetic-test-only",
  approvedAt: "2026-10-11T00:00:00.000Z",
  reviewAt: "2026-11-12T00:00:00.000Z",
  mode: "ERASE_PRODUCT_ANALYTICS",
}
function configure(overrides = {}) {
  const raw = JSON.stringify({ ...policy, ...overrides })
  Object.assign(process.env, {
    ACCOUNT_PRIVACY_PROCESSING_ENABLED: "true",
    ACCOUNT_PRIVACY_ACTIVITY_PROCESSING_ENABLED: "true",
    ACCOUNT_PRIVACY_ACTIVITY_POLICY_JSON: raw,
    ACCOUNT_PRIVACY_APPROVED_ACTIVITY_POLICY_SHA256: createHash("sha256")
      .update(raw)
      .digest("hex"),
    ACCOUNT_PRIVACY_APPROVED_POLICY_VERSION: "test-v1",
  })
}
test("analytics approval is exact, bounded and scope-specific", () => {
  configure()
  expect(
    getApprovedAccountPrivacyActivityPolicy(process.env, now)?.version,
  ).toBe("test-v1")
  for (const overrides of [
    { mode: "DELETE_ALL" },
    { version: "wrong" },
    { approvedAt: "2027-01-01" },
    { reviewAt: "2026-01-01" },
    { reviewAt: "invalid" },
    { extra: "not-allowed" },
    { approvalReference: "" },
  ]) {
    configure(overrides)
    expect(getApprovedAccountPrivacyActivityPolicy(process.env, now)).toBeNull()
  }
  configure()
  process.env.ACCOUNT_PRIVACY_ACTIVITY_POLICY_JSON += " "
  expect(getApprovedAccountPrivacyActivityPolicy(process.env, now)).toBeNull()
})
function database(
  overrides: {
    admin?: boolean
    request?: object
    residual?: number
    removed?: number
    leased?: number
  } = {},
) {
  const writes: unknown[] = []
  const tx = {
    user: {
      findUnique: async () => ({ isPlatformAdmin: overrides.admin ?? true }),
    },
    accountPrivacyRequest: {
      findUnique: async () => ({
        id: "request",
        requestKey: "account-deletion:subject",
        userId: "subject",
        verifiedSubjectUserId: "subject",
        verifiedAt: new Date("2026-10-10"),
        contactEmail: "subject@example.test",
        status: "PROCESSING",
        user: { email: "subject@example.test", emailVerified: true },
        accessRevocation: { status: "REVOKED", userId: "subject" },
        outcome: { existing: "preserved" },
        ...overrides.request,
      }),
      update: async (value: unknown) => {
        writes.push(value)
      },
    },
    productAnalyticsEvent: {
      deleteMany: async (value: unknown) => {
        writes.push(value)
        return { count: overrides.removed ?? 2 }
      },
      count: async (input: { where: { leaseToken?: unknown } }) =>
        input.where.leaseToken
          ? (overrides.leased ?? 0)
          : (overrides.residual ?? 0),
    },
  }
  return {
    db: {
      $transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
    } as unknown as PrismaClient,
    writes,
  }
}
const input = { requestId: "request", operatorUserId: "operator", now }
test("disabled and unapproved cleanup never reaches the database", async () => {
  const db = {
    $transaction: () => {
      throw Error("database must not be called")
    },
  } as unknown as PrismaClient
  process.env.ACCOUNT_PRIVACY_ACTIVITY_PROCESSING_ENABLED = "false"
  await expect(processAccountPrivacyActivity(db, input)).rejects.toMatchObject({
    code: "DISABLED",
  })
  configure()
  Reflect.deleteProperty(
    process.env,
    "ACCOUNT_PRIVACY_APPROVED_ACTIVITY_POLICY_SHA256",
  )
  await expect(processAccountPrivacyActivity(db, input)).rejects.toMatchObject({
    code: "POLICY_NOT_APPROVED",
  })
})
test("cleanup scopes deletion to immutable subject and preserves prior result data", async () => {
  configure()
  const { db, writes } = database()
  expect(await processAccountPrivacyActivity(db, input)).toMatchObject({
    analyticsRemoved: 2,
    replay: false,
  })
  expect(writes[0]).toEqual({ where: { userId: "subject" } })
  expect(writes[1]).toMatchObject({
    where: { id: "request" },
    data: {
      outcome: {
        existing: "preserved",
        activityCleanup: { removed: 2, policyVersion: "test-v1" },
      },
    },
  })
})
test("operator, verification, subject, status and access failures prevent erasure", async () => {
  configure()
  for (const request of [
    { verifiedSubjectUserId: "other" },
    { requestKey: "external-deletion:unmatched" },
    { userId: "operator", verifiedSubjectUserId: "operator" },
    { verifiedAt: new Date("2027-01-01") },
    { user: { email: "subject@example.test", emailVerified: false } },
    { contactEmail: "other@example.test" },
    { status: "COMPLETED" },
    { accessRevocation: { status: "PENDING", userId: "subject" } },
  ]) {
    const { db, writes } = database({ request })
    await expect(
      processAccountPrivacyActivity(db, input),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    expect(writes).toEqual([])
  }
  const { db, writes } = database({ admin: false })
  await expect(processAccountPrivacyActivity(db, input)).rejects.toMatchObject({
    code: "OPERATOR_REQUIRED",
  })
  expect(writes).toEqual([])
})
test("empty replays are harmless and reappearing analytics is checked", async () => {
  configure()
  const replay = database({ removed: 0 })
  expect(await processAccountPrivacyActivity(replay.db, input)).toMatchObject({
    analyticsRemoved: 0,
    replay: true,
  })
  expect(replay.writes).toHaveLength(1)
  const residual = database({ residual: 1 })
  await expect(
    processAccountPrivacyActivity(residual.db, input),
  ).rejects.toMatchObject({ code: "NOT_READY" })
  expect(residual.writes).toHaveLength(1)
})

test("even expired unresolved provider claims prevent local erasure", async () => {
  configure()
  const { db, writes } = database({ leased: 1 })
  await expect(processAccountPrivacyActivity(db, input)).rejects.toMatchObject({
    code: "ACTIVITY_PROVIDER_RECONCILIATION_REQUIRED",
  })
  expect(writes).toEqual([])
})
