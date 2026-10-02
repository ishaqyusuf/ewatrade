import { expect, test } from "bun:test"
import type {
  FinanceExpenseReceiptAsset,
  Prisma,
} from "../../../generated/prisma/client"
import {
  financeExpenseReceiptIntentHash,
  financeExpenseReceiptStoragePath,
} from "./expense-receipt-rules"
import {
  getFinanceExpenseReceiptUploadAuthorityInTransaction,
  revalidateFinanceExpenseReceiptUploadClaimInTransaction,
} from "./expense-receipt-upload-authority"

const tenantId = "tenant_test"
const bookId = "book_test"
const billId = "expense_test"
const actorUserId = "owner_test"
const assetId = "asset_test"
const now = new Date()
const createdAt = new Date(now.getTime() - 60_000)
const digest = "a".repeat(64)
const contentType = "application/pdf" as const
const sizeBytes = 4096
const originalFileName = "receipt.pdf"
const clientCommandId = "command_test_123"
const expiresAt = new Date(now.getTime() + 60 * 60_000)
const claimId =
  "00000000-0000-4000-8000-000000000001" as `${string}-${string}-${string}-${string}-${string}`
const claimVersion = 1
const claimedAt = new Date(now.getTime() - 10_000)
const leaseUntil = new Date(now.getTime() + 170_000)
const storeId = "store_test"

function baseAsset(overrides: Partial<FinanceExpenseReceiptAsset> = {}) {
  const payloadHash = financeExpenseReceiptIntentHash({
    tenantId,
    bookId,
    billId,
    actorUserId,
    clientCommandId,
    originalFileName,
    contentDigest: digest,
    contentType,
    sizeBytes,
  })
  return {
    id: assetId,
    tenantId,
    bookId,
    billId,
    actorUserId,
    clientCommandId,
    payloadHash,
    originalFileName,
    contentDigest: digest,
    contentType,
    sizeBytes,
    storageProvider: "vercel_blob_private",
    storagePath: financeExpenseReceiptStoragePath({
      tenantId,
      bookId,
      billId,
      assetId,
      contentDigest: digest,
      contentType,
    }),
    storageStoreId: null,
    uploadState: "PENDING",
    safetyState: "QUARANTINED",
    attachmentState: "UNATTACHED",
    version: 0,
    uploadClaimId: null,
    uploadClaimedAt: null,
    uploadLeaseUntil: null,
    verifiedClaimId: null,
    verifiedClaimVersion: null,
    verifiedAt: null,
    safetyAttestation: null,
    safetyReviewedAt: null,
    attachedAt: null,
    attachedById: null,
    withdrawnAt: null,
    withdrawnById: null,
    retentionHold: false,
    retentionHoldReason: null,
    cleanupClaimId: null,
    cleanupLeaseUntil: null,
    bytesDeletedAt: null,
    createdAt,
    expiresAt,
    ...overrides,
  } as FinanceExpenseReceiptAsset
}

function txFor(
  asset: FinanceExpenseReceiptAsset,
  opts: {
    classification?: "QA" | "LIVE"
    voidedAt?: Date | null
    tenant?: { isActive?: boolean; qaPurgeStartedAt?: Date | null }
    membership?: { status?: string; role?: string }
    expense?: { id?: string; bookId?: string; kind?: string }
    missingAudits?: string[]
  } = {},
) {
  const queries: string[] = []
  let mutations = 0
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?")
      queries.push(sql)
      return sql.includes('"FinanceBook"') &&
        values[0] === bookId &&
        values[1] === tenantId
        ? [{ id: bookId }]
        : []
    },
    financeBook: {
      findUniqueOrThrow: async () => ({ id: bookId, tenantId }),
    },
    tenant: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === tenantId
          ? {
              id: tenantId,
              isActive: opts.tenant?.isActive ?? true,
              qaPurgeStartedAt: opts.tenant?.qaPurgeStartedAt ?? null,
              dataClassification: opts.classification ?? "LIVE",
            }
          : null,
    },
    membership: {
      findFirst: async ({
        where,
      }: {
        where: { tenantId: string; userId: string }
      }) =>
        where.tenantId === tenantId && where.userId === actorUserId
          ? {
              tenantId,
              userId: actorUserId,
              status: opts.membership?.status ?? "ACTIVE",
              role: opts.membership?.role ?? "OWNER",
              tenant: { isActive: opts.tenant?.isActive ?? true },
            }
          : null,
    },
    financeBill: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; bookId: string }
      }) =>
        where.id === billId && where.bookId === bookId
          ? {
              id: opts.expense?.id ?? billId,
              bookId: opts.expense?.bookId ?? bookId,
              kind: opts.expense?.kind ?? "EXPENSE",
              voidedAt: opts.voidedAt ?? null,
            }
          : null,
    },
    financeExpenseReceiptAsset: {
      findFirst: async ({
        where,
      }: {
        where: {
          id: string
          tenantId: string
          bookId: string
          billId: string
        }
      }) =>
        where.id === asset.id &&
        where.tenantId === asset.tenantId &&
        where.bookId === asset.bookId &&
        where.billId === asset.billId
          ? asset
          : null,
      update: async () => {
        mutations += 1
        return asset
      },
    },
    financeExpenseReceiptAuditEvent: {
      findFirst: async ({ where }: { where: { kind: string } }) =>
        opts.missingAudits?.includes(where.kind)
          ? null
          : { id: `audit_${where.kind}` },
      create: async () => {
        mutations += 1
        return {}
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    queries,
    getMutationCount: () => mutations,
  }
}

function scope() {
  return { tenantId, bookId, billId, actorUserId }
}

function claimedAsset(overrides: Partial<FinanceExpenseReceiptAsset> = {}) {
  return baseAsset({
    uploadState: "CLAIMED",
    version: claimVersion,
    uploadClaimId: claimId,
    uploadClaimedAt: claimedAt,
    uploadLeaseUntil: leaseUntil,
    storageStoreId: storeId,
    ...overrides,
  })
}

test("loader returns current classification and original pending target", async () => {
  const { tx, queries } = txFor(baseAsset(), { classification: "QA" })
  const result = await getFinanceExpenseReceiptUploadAuthorityInTransaction(
    tx,
    { ...scope(), assetId },
  )
  expect(result.kind).toBe("READY")
  expect(result.scope.dataClassification).toBe("QA")
  expect(result.target.contentDigest).toBe(digest)
  expect(queries[0]).toContain('"FinanceBook"')
  expect(queries.at(-1)).toContain('"FinanceExpenseReceiptAsset"')
})

test("pending voided expense and an active duplicate claim are refused", async () => {
  const voided = txFor(baseAsset(), { voidedAt: now })
  await expect(
    getFinanceExpenseReceiptUploadAuthorityInTransaction(voided.tx, {
      ...scope(),
      assetId,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })

  const active = txFor(claimedAsset())
  await expect(
    getFinanceExpenseReceiptUploadAuthorityInTransaction(active.tx, {
      ...scope(),
      assetId,
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})

test("expired but audited claim is ready for a fresh claim on the same pin", async () => {
  const oldLease = new Date(now.getTime() - 1)
  const asset = claimedAsset({ uploadLeaseUntil: oldLease })
  const { tx } = txFor(asset)
  const result = await getFinanceExpenseReceiptUploadAuthorityInTransaction(
    tx,
    { ...scope(), assetId },
  )
  expect(result.kind).toBe("READY")
  if (result.kind === "READY") expect(result.storageStoreId).toBe(storeId)
})

function verifiedAsset(overrides: Partial<FinanceExpenseReceiptAsset> = {}) {
  const verifiedAt = new Date(now.getTime() - 5_000)
  const attachedAt = new Date(now.getTime() - 4_000)
  const withdrawnAt = new Date(now.getTime() - 2_000)
  return claimedAsset({
    uploadState: "VERIFIED",
    version: claimVersion + 1,
    verifiedClaimId: claimId,
    verifiedClaimVersion: claimVersion,
    verifiedAt,
    uploadClaimId: null,
    uploadLeaseUntil: null,
    attachmentState: "WITHDRAWN",
    attachedAt,
    attachedById: actorUserId,
    withdrawnAt,
    withdrawnById: actorUserId,
    expiresAt: new Date(now.getTime() - 1),
    ...overrides,
  })
}

test("verified replay preserves withdrawn completion after intent expiry and cancellation", async () => {
  const asset = verifiedAsset()
  const { tx } = txFor(asset, { classification: "LIVE", voidedAt: now })
  const result = await getFinanceExpenseReceiptUploadAuthorityInTransaction(
    tx,
    { ...scope(), assetId },
  )
  expect(result.kind).toBe("VERIFIED")
  if (result.kind === "VERIFIED") {
    expect(result.metadata.attachmentState).toBe("WITHDRAWN")
    expect(result.stored.storagePath).toBe(asset.storagePath)
    expect(result.stored.storageStoreId).toBe(storeId)
  }
})

test("fresh claim revalidation rejects a changed target and returns current classification", async () => {
  const asset = claimedAsset()
  const { tx, getMutationCount } = txFor(asset, { classification: "QA" })
  const claim = heldClaim()
  const result = await revalidateFinanceExpenseReceiptUploadClaimInTransaction(
    tx,
    claim,
  )
  expect(result.scope.dataClassification).toBe("QA")
  expect(getMutationCount()).toBe(0)
})

function heldClaim() {
  return {
    scope: { ...scope(), dataClassification: "LIVE" as const },
    target: {
      tenantId,
      bookId,
      billId,
      assetId,
      actorUserId,
      contentDigest: digest,
      contentType,
      sizeBytes,
      createdAt,
      expiresAt,
    },
    claimId,
    claimVersion,
    leaseUntil,
    storageStoreId: storeId,
  }
}

test("claim target tampering refuses with CONFLICT", async () => {
  const { tx } = txFor(claimedAsset())
  const claim = heldClaim()
  await expect(
    revalidateFinanceExpenseReceiptUploadClaimInTransaction(tx, {
      ...claim,
      target: { ...claim.target, contentDigest: "b".repeat(64) },
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})

test("creator authorization is rechecked for revoked roles, inactive memberships, and purging tenants", async () => {
  for (const options of [
    { membership: { role: "STAFF" } },
    { membership: { status: "INACTIVE" } },
    { tenant: { isActive: false } },
    { tenant: { qaPurgeStartedAt: now } },
  ]) {
    const { tx } = txFor(claimedAsset(), options)
    await expect(
      revalidateFinanceExpenseReceiptUploadClaimInTransaction(tx, heldClaim()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    const { tx: loaderTx } = txFor(baseAsset(), options)
    await expect(
      getFinanceExpenseReceiptUploadAuthorityInTransaction(loaderTx, {
        ...scope(),
        assetId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  }
})

test("wrong Book or non-Expense scope refuses with NOT_FOUND", async () => {
  const { tx: wrongBook } = txFor(baseAsset())
  await expect(
    getFinanceExpenseReceiptUploadAuthorityInTransaction(wrongBook, {
      ...scope(),
      bookId: "other_book",
      assetId,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })

  const { tx: wrongBill } = txFor(baseAsset())
  await expect(
    getFinanceExpenseReceiptUploadAuthorityInTransaction(wrongBill, {
      ...scope(),
      billId: "other_expense",
      assetId,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })

  const { tx: wrongKind } = txFor(baseAsset(), {
    expense: { kind: "BILL" },
  })
  await expect(
    getFinanceExpenseReceiptUploadAuthorityInTransaction(wrongKind, {
      ...scope(),
      assetId,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
})

test("claim and completion audit provenance is mandatory", async () => {
  const { tx: missingClaimAudit } = txFor(claimedAsset(), {
    missingAudits: ["UPLOAD_CLAIMED"],
  })
  await expect(
    revalidateFinanceExpenseReceiptUploadClaimInTransaction(
      missingClaimAudit,
      heldClaim(),
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" })

  const { tx: missingCompletionAudit } = txFor(verifiedAsset(), {
    missingAudits: ["UPLOAD_VERIFIED"],
  })
  await expect(
    getFinanceExpenseReceiptUploadAuthorityInTransaction(
      missingCompletionAudit,
      { ...scope(), assetId },
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" })
})

test("changed claim id, version, pin, lease, source deletion, cleanup, or attachment refuses", async () => {
  const claim = heldClaim()
  const mismatches = [
    { ...claim, claimId: "other-claim" as typeof claim.claimId },
    { ...claim, claimVersion: claim.claimVersion + 1 },
    { ...claim, storageStoreId: "store_other" },
    { ...claim, leaseUntil: new Date(now.getTime() - 1) },
  ]
  for (const mismatch of mismatches) {
    const { tx } = txFor(claimedAsset())
    await expect(
      revalidateFinanceExpenseReceiptUploadClaimInTransaction(tx, mismatch),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  }

  for (const overrides of [
    { bytesDeletedAt: now },
    { cleanupClaimId: "cleanup_claim" },
    { cleanupLeaseUntil: now },
    {
      attachmentState: "ATTACHED",
      attachedAt: now,
      attachedById: actorUserId,
    } as Partial<FinanceExpenseReceiptAsset>,
  ]) {
    const { tx } = txFor(claimedAsset(overrides))
    await expect(
      revalidateFinanceExpenseReceiptUploadClaimInTransaction(tx, heldClaim()),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  }
})

test("held claims are snapshotted before the first authorization await", async () => {
  const { tx } = txFor(claimedAsset(), { classification: "QA" })
  const claim = heldClaim()
  const pending = revalidateFinanceExpenseReceiptUploadClaimInTransaction(
    tx,
    claim,
  )
  claim.target.contentDigest = "b".repeat(64)
  const result = await pending
  expect(result.target.contentDigest).toBe(digest)
  expect(result.scope.dataClassification).toBe("QA")
})
