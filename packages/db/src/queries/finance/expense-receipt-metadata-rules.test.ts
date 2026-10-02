import { expect, test } from "bun:test"
import {
  type ExpenseReceiptUploadFacts,
  expenseReceiptUploadClaim,
  expenseReceiptVerifiedCompletion,
} from "./expense-receipt-metadata-rules"

const now = new Date("2026-10-02T10:00:00Z")
function pending(
  overrides: Partial<ExpenseReceiptUploadFacts> = {},
): ExpenseReceiptUploadFacts {
  return {
    actorUserId: "owner",
    uploadState: "PENDING",
    safetyState: "QUARANTINED",
    attachmentState: "UNATTACHED",
    version: 0,
    expiresAt: new Date(now.getTime() + 3600_000),
    attachedAt: null,
    bytesDeletedAt: null,
    cleanupClaimId: null,
    uploadClaimId: null,
    uploadClaimedAt: null,
    uploadLeaseUntil: null,
    storageStoreId: null,
    verifiedClaimId: null,
    verifiedClaimVersion: null,
    verifiedAt: null,
    ...overrides,
  }
}
const completion = {
  actorUserId: "owner",
  claimId: "claim",
  claimVersion: 1,
  storeId: "store_test",
  verifiedAt: now,
}
function claimed(overrides: Partial<ExpenseReceiptUploadFacts> = {}) {
  return pending({
    uploadState: "CLAIMED",
    version: 1,
    uploadClaimId: "claim",
    uploadClaimedAt: new Date(now.getTime() - 1000),
    uploadLeaseUntil: new Date(now.getTime() + 179_000),
    storageStoreId: "store_test",
    ...overrides,
  })
}

test("claim increments version and caps the lease at expiry", () => {
  expect(
    expenseReceiptUploadClaim(pending(), "owner", "store_test", now),
  ).toEqual({
    version: 1,
    uploadLeaseUntil: new Date(now.getTime() + 180_000),
  })
  expect(
    expenseReceiptUploadClaim(
      pending({ expiresAt: new Date(now.getTime() + 500) }),
      "owner",
      "store_test",
      now,
    ).uploadLeaseUntil.getTime(),
  ).toBe(now.getTime() + 500)
})
test("reclaim after expired lease fences out the old worker", () => {
  const stale = claimed({ uploadLeaseUntil: now })
  expect(
    expenseReceiptUploadClaim(stale, "owner", "store_test", now).version,
  ).toBe(2)
  expect(() =>
    expenseReceiptVerifiedCompletion(stale, completion, now),
  ).toThrow()
  expect(() =>
    expenseReceiptVerifiedCompletion(
      claimed({ version: 2, uploadClaimId: "new" }),
      completion,
      now,
    ),
  ).toThrow()
})
test("active lease, expired intent, changed pin and noncreator cannot claim", () => {
  for (const asset of [
    claimed(),
    pending({ expiresAt: now }),
    pending({ storageStoreId: "store_other" }),
  ]) {
    expect(() =>
      expenseReceiptUploadClaim(asset, "owner", "store_test", now),
    ).toThrow()
  }
  expect(() =>
    expenseReceiptUploadClaim(pending(), "admin", "store_test", now),
  ).toThrow()
  expect(() =>
    expenseReceiptUploadClaim(pending(), "owner", "public-url", now),
  ).toThrow()
})
test("cleanup, deletion, attachment and safety review never regain upload authority", () => {
  for (const change of [
    { cleanupClaimId: "cleanup" },
    { bytesDeletedAt: now },
    { attachedAt: now },
    { attachmentState: "WITHDRAWN" },
    { safetyState: "SAFE" },
    { uploadState: "VERIFIED" },
  ])
    expect(() =>
      expenseReceiptUploadClaim(pending(change), "owner", "store_test", now),
    ).toThrow()
})
test("verified completion requires exact live lease and plausible original-read time", () => {
  expect(expenseReceiptVerifiedCompletion(claimed(), completion, now)).toEqual({
    replay: false,
  })
  for (const change of [
    { claimId: "other" },
    { claimVersion: 0 },
    { storeId: "store_other" },
    { actorUserId: "admin" },
    { verifiedAt: new Date(now.getTime() + 1) },
    { verifiedAt: new Date(now.getTime() - 1001) },
  ])
    expect(() =>
      expenseReceiptVerifiedCompletion(
        claimed(),
        { ...completion, ...change },
        now,
      ),
    ).toThrow()
  expect(() =>
    expenseReceiptVerifiedCompletion(
      claimed({ expiresAt: now }),
      completion,
      now,
    ),
  ).toThrow()
})
test("exact completion can replay after lease expiry without resurrection or rewriting", () => {
  const done = claimed({
    uploadState: "VERIFIED",
    version: 2,
    verifiedClaimId: "claim",
    verifiedClaimVersion: 1,
    verifiedAt: now,
  })
  const later = new Date(now.getTime() + 86400_000)
  expect(expenseReceiptVerifiedCompletion(done, completion, later)).toEqual({
    replay: true,
  })
  expect(
    expenseReceiptVerifiedCompletion(
      {
        ...done,
        safetyState: "SAFE",
        attachmentState: "ATTACHED",
        attachedAt: now,
      },
      completion,
      later,
    ),
  ).toEqual({ replay: true })
  expect(() =>
    expenseReceiptVerifiedCompletion(
      done,
      { ...completion, verifiedAt: later },
      later,
    ),
  ).toThrow()
  expect(() =>
    expenseReceiptVerifiedCompletion(
      { ...done, bytesDeletedAt: later },
      completion,
      later,
    ),
  ).toThrow()
})
