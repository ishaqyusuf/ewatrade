import { expect, test } from "bun:test"
import { createQaPrivateMediaSafetyAttestation } from "@ewatrade/service-commerce"
import type {
  FinanceExpenseReceiptAsset,
  FinanceExpenseReceiptDownloadGrant,
  Prisma,
} from "../../../generated/prisma/client"
import {
  getFinanceExpenseReceiptDeliveryAuthorityInTransaction,
  revalidateFinanceExpenseReceiptConsumedGrantInTransaction,
} from "./expense-receipt-delivery-authority"
import {
  FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE,
  FINANCE_EXPENSE_RECEIPT_GRANT_VERSION,
  FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE,
} from "./expense-receipt-lifecycle"
import { financeExpenseReceiptStoragePath } from "./expense-receipt-rules"

const tenantId = "tenant_delivery"
const bookId = "book_delivery"
const billId = "expense_delivery"
const actorUserId = "current_owner"
const creatorUserId = "former_creator"
const assetId = "asset_delivery"
const grantId = "grant_delivery"
const contentDigest = "a".repeat(64)
const nonceDigest = "b".repeat(64)
const sessionDigest = "c".repeat(64)
const now = new Date()
const createdAt = new Date(now.getTime() - 60_000)
const claimedAt = new Date(now.getTime() - 58_000)
const verifiedAt = new Date(now.getTime() - 57_000)
const safetyReviewedAt = new Date(now.getTime() - 15_000)
const attachedAt = new Date(now.getTime() - 10_000)
const expiresAt = new Date(now.getTime() + 86_400_000)
const grantIssuedAt = new Date(now.getTime() - 8_000)
const grantConsumedAt = new Date(now.getTime() - 5_000)
const grantExpiresAt = new Date(now.getTime() + 30_000)
const storageStoreId = "store_delivery"
const scope = { tenantId, bookId, billId, actorUserId }

function asset(
  overrides: Partial<FinanceExpenseReceiptAsset> = {},
): FinanceExpenseReceiptAsset {
  const path = financeExpenseReceiptStoragePath({
    tenantId,
    bookId,
    billId,
    assetId,
    contentDigest,
    contentType: "application/pdf",
  })
  const attestation = createQaPrivateMediaSafetyAttestation({
    byteSize: 128,
    contentDigest,
    mimeType: "application/pdf",
    mediaAssetId: assetId,
    storageReference: "synthetic original for repository test",
  })
  return {
    id: assetId,
    tenantId,
    bookId,
    billId,
    actorUserId: creatorUserId,
    clientCommandId: "receipt-command-delivery",
    payloadHash: "d".repeat(64),
    originalFileName: "receipt.pdf",
    contentDigest,
    contentType: "application/pdf",
    sizeBytes: 128,
    storageProvider: "vercel_blob_private",
    storagePath: path,
    storageStoreId,
    uploadState: "VERIFIED",
    safetyState: "SAFE",
    attachmentState: "ATTACHED",
    version: 3,
    uploadClaimId: null,
    uploadClaimedAt: claimedAt,
    uploadLeaseUntil: null,
    verifiedClaimId: "verified-claim",
    verifiedClaimVersion: 1,
    verifiedAt,
    safetyAttestation: {
      purpose: FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE,
      version: 1,
      runtime: "qa_fixture",
      attestation,
    },
    safetyReviewedAt,
    attachedAt,
    attachedById: creatorUserId,
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

function grant(
  overrides: Partial<FinanceExpenseReceiptDownloadGrant> = {},
): FinanceExpenseReceiptDownloadGrant {
  return {
    id: grantId,
    tenantId,
    bookId,
    billId,
    assetId,
    actorUserId,
    sessionDigest,
    nonceDigest,
    contentDigest,
    purpose: FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE,
    version: FINANCE_EXPENSE_RECEIPT_GRANT_VERSION,
    issuedAt: grantIssuedAt,
    expiresAt: grantExpiresAt,
    consumedAt: grantConsumedAt,
    revokedAt: null,
    ...overrides,
  } as FinanceExpenseReceiptDownloadGrant
}

type TxOptions = {
  role?: string
  membershipStatus?: string
  tenantActive?: boolean
  qaPurgeStartedAt?: Date | null
  dataClassification?: "QA" | "LIVE"
  voidedAt?: Date | null
  asset?: Partial<FinanceExpenseReceiptAsset>
  grant?: Partial<FinanceExpenseReceiptDownloadGrant>
  expireDuringGrantRead?: boolean
}

function txFor(options: TxOptions = {}) {
  let mutations = 0
  const currentAsset = asset(options.asset)
  const currentGrant = grant(options.grant)
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join(" ").trim()
      if (sql.includes('"FinanceBook"')) return [{ id: bookId }]
      if (sql.toUpperCase().startsWith("UPDATE ")) {
        mutations += 1
        return [{ consumedAt: now }]
      }
      return []
    },
    financeBook: {
      findUniqueOrThrow: async () => ({ id: bookId, tenantId }),
    },
    tenant: {
      findUnique: async () => ({
        id: tenantId,
        isActive: options.tenantActive ?? true,
        qaPurgeStartedAt: options.qaPurgeStartedAt ?? null,
        dataClassification: options.dataClassification ?? "QA",
      }),
    },
    membership: {
      findFirst: async () => ({
        tenantId,
        userId: actorUserId,
        status: options.membershipStatus ?? "ACTIVE",
        role: options.role ?? "OWNER",
        tenant: { isActive: options.tenantActive ?? true },
      }),
    },
    financeBill: {
      findFirst: async () => ({
        id: billId,
        bookId,
        kind: "EXPENSE",
        voidedAt: options.voidedAt ?? null,
      }),
    },
    financeExpenseReceiptAsset: {
      findFirst: async ({
        where,
      }: {
        where: { id: string; tenantId: string; bookId: string; billId: string }
      }) =>
        where.id === currentAsset.id &&
        where.tenantId === currentAsset.tenantId &&
        where.bookId === currentAsset.bookId &&
        where.billId === currentAsset.billId
          ? currentAsset
          : null,
      update: async () => {
        mutations += 1
        return currentAsset
      },
    },
    financeExpenseReceiptDownloadGrant: {
      findFirst: async ({
        where,
      }: {
        where: {
          id: string
          tenantId: string
          bookId: string
          billId: string
          assetId: string
          nonceDigest: string
        }
      }) =>
        (async () => {
          if (options.expireDuringGrantRead) {
            currentGrant.expiresAt = new Date(Date.now() + 10)
            await new Promise((resolve) => setTimeout(resolve, 40))
          }
          return where.id === currentGrant.id &&
            where.tenantId === currentGrant.tenantId &&
            where.bookId === currentGrant.bookId &&
            where.billId === currentGrant.billId &&
            where.assetId === currentGrant.assetId &&
            where.nonceDigest === currentGrant.nonceDigest
            ? currentGrant
            : null
        })(),
      update: async () => {
        mutations += 1
        return currentGrant
      },
      updateMany: async () => {
        mutations += 1
        return { count: 1 }
      },
    },
    financeExpenseReceiptAuditEvent: {
      create: async () => {
        mutations += 1
        return {}
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    getMutationCount: () => mutations,
  }
}

function grantInput(
  overrides: Partial<
    Parameters<
      typeof revalidateFinanceExpenseReceiptConsumedGrantInTransaction
    >[1]
  > = {},
) {
  return {
    ...scope,
    assetId,
    grantId,
    nonceDigest,
    sessionDigest,
    purpose: FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE,
    version: FINANCE_EXPENSE_RECEIPT_GRANT_VERSION,
    ...overrides,
  }
}

test("current Owner/Admin can load attached retained originals without creator membership", async () => {
  const { tx, getMutationCount } = txFor({
    role: "ADMIN",
    voidedAt: now,
  })
  const result = await getFinanceExpenseReceiptDeliveryAuthorityInTransaction(
    tx,
    { ...scope, assetId },
  )
  expect(result).toEqual({
    scope: { ...scope, dataClassification: "QA" },
    original: {
      tenantId,
      bookId,
      billId,
      assetId,
      contentDigest,
      contentType: "application/pdf",
      sizeBytes: 128,
      storageProvider: "vercel_blob_private",
      storagePath: currentPath(),
      verifiedAt,
      storageStoreId,
    },
  })
  expect(getMutationCount()).toBe(0)
})

function currentPath() {
  return financeExpenseReceiptStoragePath({
    tenantId,
    bookId,
    billId,
    assetId,
    contentDigest,
    contentType: "application/pdf",
  })
}

test("consumed grant revalidation returns current descriptor and performs no mutation", async () => {
  const { tx, getMutationCount } = txFor({ voidedAt: now })
  const result =
    await revalidateFinanceExpenseReceiptConsumedGrantInTransaction(
      tx,
      grantInput(),
    )
  expect(result).toMatchObject({
    scope: { ...scope, dataClassification: "QA" },
    original: {
      assetId,
      contentDigest,
      storagePath: currentPath(),
      storageStoreId,
      verifiedAt,
    },
  })
  expect(getMutationCount()).toBe(0)
})

test("authorization, current source scope, and persisted safety are rechecked", async () => {
  for (const options of [
    { role: "CASHIER" },
    { membershipStatus: "SUSPENDED" },
    { tenantActive: false },
    { qaPurgeStartedAt: now },
    { dataClassification: "LIVE" as const },
  ]) {
    const { tx } = txFor(options)
    await expect(
      getFinanceExpenseReceiptDeliveryAuthorityInTransaction(tx, {
        ...scope,
        assetId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  }

  const { tx: wrongBill } = txFor()
  await expect(
    getFinanceExpenseReceiptDeliveryAuthorityInTransaction(wrongBill, {
      ...scope,
      billId: "other_expense",
      assetId,
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })

  const { tx: revokedMembership } = txFor({
    membershipStatus: "SUSPENDED",
  })
  await expect(
    revalidateFinanceExpenseReceiptConsumedGrantInTransaction(
      revokedMembership,
      grantInput(),
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })

  const { tx: crossedGrantScope } = txFor()
  await expect(
    revalidateFinanceExpenseReceiptConsumedGrantInTransaction(
      crossedGrantScope,
      grantInput({ billId: "other_expense" }),
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })

  const invalidAssetStates: Partial<FinanceExpenseReceiptAsset>[] = [
    { attachmentState: "WITHDRAWN" as const },
    { withdrawnAt: now },
    { withdrawnById: "withdrawer" },
    { attachedAt: null },
    { attachedAt: new Date(now.getTime() + 1_000) },
    { uploadClaimId: "active-claim" },
    { uploadLeaseUntil: now },
    { cleanupClaimId: "cleanup" },
    { cleanupLeaseUntil: now },
    { bytesDeletedAt: now },
    { storageStoreId: "public-url" },
    { safetyReviewedAt: new Date(Number.NaN) },
  ]
  for (const change of invalidAssetStates) {
    const { tx } = txFor({ asset: change })
    await expect(
      getFinanceExpenseReceiptDeliveryAuthorityInTransaction(tx, {
        ...scope,
        assetId,
      }),
    ).rejects.toMatchObject({
      code: "storageStoreId" in change ? "CONFLICT" : "FORBIDDEN",
    })
  }
})

test("grant identity, consumed state, revocation, source digest, and times must match", async () => {
  const grantChanges: Partial<FinanceExpenseReceiptDownloadGrant>[] = [
    { actorUserId: "other_actor" },
    { sessionDigest: "e".repeat(64) },
    { nonceDigest: "f".repeat(64) },
    { contentDigest: "e".repeat(64) },
    { purpose: "OTHER_PURPOSE" },
    { version: 2 },
    { consumedAt: null },
    { revokedAt: now },
    { issuedAt: new Date(now.getTime() + 1) },
    { consumedAt: new Date(grantIssuedAt.getTime() - 1) },
    { consumedAt: new Date(now.getTime() + 60_000) },
    { expiresAt: now },
    { expiresAt: new Date(grantIssuedAt.getTime() + 60_001) },
    { issuedAt: new Date(Number.NaN) },
  ]
  for (const change of grantChanges) {
    const { tx } = txFor({ grant: change })
    await expect(
      revalidateFinanceExpenseReceiptConsumedGrantInTransaction(
        tx,
        grantInput(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  }

  for (const input of [
    grantInput({ grantId: "other_grant" }),
    grantInput({ purpose: "OTHER_PURPOSE" }),
    grantInput({ version: 2 }),
  ]) {
    const { tx } = txFor()
    await expect(
      revalidateFinanceExpenseReceiptConsumedGrantInTransaction(tx, input),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  }

  const { tx: malformedHash } = txFor()
  await expect(
    revalidateFinanceExpenseReceiptConsumedGrantInTransaction(
      malformedHash,
      grantInput({ sessionDigest: "raw-session" }),
    ),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
})

test("a consumed grant issued before attachment is refused", async () => {
  const { tx } = txFor({
    grant: { issuedAt: new Date(attachedAt.getTime() - 1) },
  })
  await expect(
    revalidateFinanceExpenseReceiptConsumedGrantInTransaction(tx, grantInput()),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})

test("caller grant facts are snapshotted before authorization awaits", async () => {
  const { tx, getMutationCount } = txFor()
  const input = grantInput()
  const pending = revalidateFinanceExpenseReceiptConsumedGrantInTransaction(
    tx,
    input,
  )
  input.sessionDigest = "e".repeat(64)
  input.purpose = "OTHER_PURPOSE"
  const result = await pending
  expect(result.original.storageStoreId).toBe(storageStoreId)
  expect(getMutationCount()).toBe(0)
})

test("expiry is checked after an awaited grant row read", async () => {
  const { tx, getMutationCount } = txFor({ expireDuringGrantRead: true })
  await expect(
    revalidateFinanceExpenseReceiptConsumedGrantInTransaction(tx, grantInput()),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(getMutationCount()).toBe(0)
})
