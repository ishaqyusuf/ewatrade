import { expect, test } from "bun:test"
import { createQaPrivateMediaSafetyAttestation } from "@ewatrade/service-commerce"
import type { FinanceExpenseReceiptAsset } from "../../../generated/prisma/client"
import {
  FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE,
  assertFinanceExpenseReceiptPersistedSafety,
} from "./expense-receipt-lifecycle"
import { financeExpenseReceiptStoragePath } from "./expense-receipt-rules"

const now = new Date("2026-10-02T12:03:00Z")
function asset(
  overrides: Partial<FinanceExpenseReceiptAsset> = {},
): FinanceExpenseReceiptAsset {
  const contentDigest = "a".repeat(64)
  const source = {
    tenantId: "tenant",
    bookId: "book",
    billId: "expense",
    assetId: "asset",
    contentDigest,
    contentType: "application/pdf" as const,
  }
  return {
    id: "asset",
    tenantId: "tenant",
    bookId: "book",
    billId: "expense",
    actorUserId: "owner",
    clientCommandId: "receipt-command",
    payloadHash: "b".repeat(64),
    originalFileName: "receipt.pdf",
    contentDigest,
    contentType: "application/pdf",
    sizeBytes: 16,
    storageProvider: "vercel_blob_private",
    storagePath: financeExpenseReceiptStoragePath(source),
    storageStoreId: "store_qa",
    uploadState: "VERIFIED",
    safetyState: "SAFE",
    attachmentState: "UNATTACHED",
    version: 2,
    uploadClaimId: null,
    uploadClaimedAt: new Date("2026-10-02T12:00:00Z"),
    uploadLeaseUntil: null,
    verifiedClaimId: "claim",
    verifiedClaimVersion: 1,
    verifiedAt: new Date("2026-10-02T12:01:00Z"),
    safetyAttestation: {
      purpose: FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE,
      version: 1,
      runtime: "qa_fixture",
      attestation: createQaPrivateMediaSafetyAttestation({
        byteSize: 16,
        contentDigest,
        mimeType: "application/pdf",
        mediaAssetId: "asset",
        storageReference: "synthetic-original",
      }),
    },
    safetyReviewedAt: new Date("2026-10-02T12:02:00Z"),
    attachedAt: null,
    attachedById: null,
    withdrawnAt: null,
    withdrawnById: null,
    retentionHold: true,
    retentionHoldReason: "Synthetic retention hold",
    cleanupClaimId: null,
    cleanupLeaseUntil: null,
    bytesDeletedAt: null,
    createdAt: new Date("2026-10-02T12:00:00Z"),
    expiresAt: new Date("2026-10-03T12:00:00Z"),
    ...overrides,
  }
}

test("persisted matching QA provenance and complete original coverage are necessary", () => {
  const a = asset()
  expect(
    assertFinanceExpenseReceiptPersistedSafety(
      a,
      { dataClassification: "QA" },
      now,
    ).stored.contentDigest,
  ).toBe(a.contentDigest)
  expect(() =>
    assertFinanceExpenseReceiptPersistedSafety(
      a,
      { dataClassification: "LIVE" },
      now,
    ),
  ).toThrow()
  for (const change of [
    { safetyState: "QUARANTINED" as const },
    { uploadState: "PENDING" as const },
    { bytesDeletedAt: now },
    { cleanupClaimId: "cleanup" },
    { uploadClaimId: "upload" },
    { verifiedAt: null },
    { safetyReviewedAt: null },
    { safetyReviewedAt: new Date("2026-10-02T12:00:59Z") },
    { safetyReviewedAt: new Date("2026-10-02T12:03:01Z") },
  ])
    expect(() =>
      assertFinanceExpenseReceiptPersistedSafety(
        asset(change),
        { dataClassification: "QA" },
        now,
      ),
    ).toThrow()
})

test("naked SAFE and claimed live/provider/policy strings never supply safety authority", () => {
  const evidence = createQaPrivateMediaSafetyAttestation({
    byteSize: 16,
    contentDigest: "a".repeat(64),
    mimeType: "application/pdf",
    mediaAssetId: "asset",
    storageReference: "synthetic",
  })
  const valid = {
    purpose: FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE,
    version: 1,
    runtime: "qa_fixture",
    attestation: evidence,
  }
  for (const proof of [
    null,
    evidence,
    { ...valid, version: 2 },
    { ...valid, purpose: "another-policy" },
    { ...valid, runtime: "live" },
    { ...valid, attestation: { ...evidence, source: "live" } },
    { ...valid, attestation: { ...evidence, provider: "claimed-approved" } },
    { ...valid, attestation: { ...evidence, modelVersion: "unknown" } },
    { ...valid, attestation: { ...evidence, contentDigest: "c".repeat(64) } },
    {
      ...valid,
      attestation: {
        ...evidence,
        coverage: {
          kind: "document",
          pagesDetected: 2,
          pagesTextInspected: 2,
          pagesVisualInspected: 1,
        },
      },
    },
  ])
    expect(() =>
      assertFinanceExpenseReceiptPersistedSafety(
        asset({ safetyAttestation: proof }),
        { dataClassification: "QA" },
        now,
      ),
    ).toThrow()
})

test("persisted policy remains unavailable in production regardless of Tenant QA", () => {
  const a = asset()
  const previous = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = "production"
    expect(() =>
      assertFinanceExpenseReceiptPersistedSafety(
        a,
        { dataClassification: "QA" },
        now,
      ),
    ).toThrow()
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, "NODE_ENV")
    else process.env.NODE_ENV = previous
  }
  const profile = process.env.DEV_PROFILE
  try {
    process.env.DEV_PROFILE = "prod"
    expect(() =>
      assertFinanceExpenseReceiptPersistedSafety(
        a,
        { dataClassification: "QA" },
        now,
      ),
    ).toThrow()
  } finally {
    if (profile === undefined)
      Reflect.deleteProperty(process.env, "DEV_PROFILE")
    else process.env.DEV_PROFILE = profile
  }
})

test("canonical original path and private store pin are still required", () => {
  for (const change of [
    { storagePath: "other-original" },
    { storageProvider: "public" },
    { storageStoreId: "https://public.invalid" },
    { storageStoreId: null },
  ]) {
    expect(() =>
      assertFinanceExpenseReceiptPersistedSafety(
        asset(change),
        { dataClassification: "QA" },
        now,
      ),
    ).toThrow()
  }
})

test("QA requires explicit development/test runtime and normalizes every production signal", () => {
  const a = asset()
  const keys = ["NODE_ENV", "DEV_PROFILE", "APP_ENV", "EWATRADE_ENV_MODE"]
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  )
  function restore(key: string) {
    const value = previous[key]
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
  try {
    for (const nodeEnv of ["development", "test"]) {
      process.env.NODE_ENV = nodeEnv
      expect(
        assertFinanceExpenseReceiptPersistedSafety(
          a,
          { dataClassification: "QA" },
          now,
        ).stored.contentDigest,
      ).toBe(a.contentDigest)
    }
    for (const nodeEnv of [undefined, "unknown", ""]) {
      if (nodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV")
      else process.env.NODE_ENV = nodeEnv
      expect(() =>
        assertFinanceExpenseReceiptPersistedSafety(
          a,
          { dataClassification: "QA" },
          now,
        ),
      ).toThrow()
    }
    process.env.NODE_ENV = "test"
    for (const key of ["DEV_PROFILE", "APP_ENV", "EWATRADE_ENV_MODE"]) {
      for (const value of [" PRODUCTION ", "PrOd"]) {
        process.env[key] = value
        expect(() =>
          assertFinanceExpenseReceiptPersistedSafety(
            a,
            { dataClassification: "QA" },
            now,
          ),
        ).toThrow()
      }
      restore(key)
    }
  } finally {
    for (const key of keys) restore(key)
  }
})
