import { afterAll, expect, test } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { FINANCE_DEFAULT_ACCOUNTS } from "./accounts"
import { financeExpenseReceiptStoragePath } from "./expense-receipt-rules"
import {
  getFinanceExpenseReceiptUploadAuthorityInTransaction as getAuthority,
  revalidateFinanceExpenseReceiptUploadClaimInTransaction as revalidateClaim,
} from "./expense-receipt-upload-authority"
import {
  claimFinanceExpenseReceiptUploadInTransaction as claimUpload,
  createFinanceExpenseReceiptInTransaction as createReceipt,
  recordFinanceExpenseReceiptVerifiedInTransaction as recordVerified,
} from "./expense-receipts"

const transactionOptions = { maxWait: 10_000, timeout: 30_000 }
const expectedDevelopmentHost =
  "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech"
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DEV_PROFILE !== "local" ||
    process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
    target.hostname !== expectedDevelopmentHost ||
    target.pathname !== "/neondb"
  )
    throw new Error(
      "Expense receipt upload authority acceptance requires the approved guarded development target.",
    )
}

const tenantIds: string[] = []
const userIds: string[] = []
const rollback = new Error("ROLLBACK_EXPENSE_RECEIPT_UPLOAD_AUTHORITY")
const sha = (value: string) => createHash("sha256").update(value).digest("hex")

async function fixture(tx: Prisma.TransactionClient) {
  const runId = randomUUID()
  const owner = await tx.user.create({
    data: {
      email: `receipt-upload-owner-${runId}@example.invalid`,
      name: "Synthetic upload authority owner",
    },
  })
  userIds.push(owner.id)
  const tenant = await tx.tenant.create({
    data: {
      slug: `receipt-upload-${runId}`,
      name: "Synthetic receipt upload authority",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      dataClassification: "QA",
      users: {
        create: { userId: owner.id, role: "OWNER", status: "ACTIVE" },
      },
    },
  })
  tenantIds.push(tenant.id)
  const book = await tx.financeBook.create({
    data: {
      tenantId: tenant.id,
      currencyCode: "NGN",
      timezone: "Africa/Lagos",
      startsAt: new Date("2026-01-01T00:00:00Z"),
      createdById: owner.id,
      accounts: { create: FINANCE_DEFAULT_ACCOUNTS },
    },
  })
  const expense = await tx.financeBill.create({
    data: {
      bookId: book.id,
      kind: "EXPENSE",
      payeeName: "Synthetic receipt source",
      description: "Rollback-only upload authority acceptance",
      incurredAt: new Date("2026-09-15T12:00:00Z"),
      totalMinor: 1250n,
      actorUserId: owner.id,
    },
  })
  const scope = {
    tenantId: tenant.id,
    bookId: book.id,
    billId: expense.id,
    actorUserId: owner.id,
  }
  const receipt = {
    ...scope,
    clientCommandId: `receipt-upload-${runId}`,
    originalFileName: "synthetic-original.pdf",
    contentDigest: sha(`synthetic receipt bytes ${runId}`),
    contentType: "application/pdf" as const,
    sizeBytes: 128,
  }
  return { scope, receipt, owner, tenant, book, expense }
}

async function rolledBack(
  run: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  const { prisma } = await import("../../client")
  try {
    await prisma.$transaction(async (tx) => {
      await run(tx)
      throw rollback
    }, transactionOptions)
  } catch (error) {
    if (error !== rollback) throw error
  }
}

describeWithServiceCommerceDatabase(
  "expense receipt upload authority persistence",
  () => {
    afterAll(async () => {
      const { prisma } = await import("../../client")
      const counts = await Promise.all([
        prisma.tenant.count({ where: { id: { in: tenantIds } } }),
        prisma.user.count({ where: { id: { in: userIds } } }),
        prisma.financeExpenseReceiptAsset.count({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.financeExpenseReceiptAuditEvent.count({
          where: { tenantId: { in: tenantIds } },
        }),
        prisma.financeExpenseReceiptDownloadGrant.count({
          where: { tenantId: { in: tenantIds } },
        }),
      ])
      expect(counts).toEqual([0, 0, 0, 0, 0])
      console.info(
        "Expense receipt upload authority rollback absence",
        JSON.stringify({
          tenantIds,
          userIds,
          tenantUserAssetAuditGrantCounts: counts,
        }),
      )
    })

    test("persisted intent, claim, revalidation, verified completion, and exact replay reload", async () => {
      await rolledBack(async (tx) => {
        const f = await fixture(tx)
        const intent = await createReceipt(tx, f.receipt)
        const loadedIntent = await getAuthority(tx, {
          ...f.scope,
          assetId: intent.id,
        })
        expect(loadedIntent).toMatchObject({
          kind: "READY",
          scope: { dataClassification: "QA" },
          target: {
            tenantId: f.tenant.id,
            bookId: f.book.id,
            billId: f.expense.id,
            actorUserId: f.owner.id,
            contentDigest: f.receipt.contentDigest,
          },
        })
        if (loadedIntent.kind !== "READY")
          throw new Error("New persisted intent did not remain READY")

        const storageStoreId = "store_receiptauthorityqa"
        const claim = await claimUpload(tx, {
          ...f.scope,
          assetId: intent.id,
          storageStoreId,
        })
        expect(
          await tx.financeExpenseReceiptAuditEvent.count({
            where: { assetId: intent.id, kind: "UPLOAD_CLAIMED" },
          }),
        ).toBe(1)

        const fresh = await revalidateClaim(tx, claim)
        expect(fresh).toMatchObject({
          scope: { dataClassification: "QA" },
          claimId: claim.claimId,
          claimVersion: claim.claimVersion,
          leaseUntil: claim.leaseUntil,
          storageStoreId,
          target: loadedIntent.target,
        })

        const verifiedAt = new Date()
        const storagePath = financeExpenseReceiptStoragePath({
          ...claim.target,
          assetId: intent.id,
        })
        const stored = {
          ...claim.target,
          storageProvider: "vercel_blob_private" as const,
          storagePath,
          verifiedAt,
          storageStoreId,
          state: "QUARANTINED" as const,
        }
        const completed = await recordVerified(tx, {
          ...f.scope,
          assetId: intent.id,
          claimId: claim.claimId,
          claimVersion: claim.claimVersion,
          stored,
        })
        expect(completed).toMatchObject({
          id: intent.id,
          uploadState: "VERIFIED",
          safetyState: "QUARANTINED",
          attachmentState: "UNATTACHED",
          verifiedAt,
        })

        const replayedCompletion = await recordVerified(tx, {
          ...f.scope,
          assetId: intent.id,
          claimId: claim.claimId,
          claimVersion: claim.claimVersion,
          stored,
        })
        expect(replayedCompletion).toEqual(completed)

        const exact = await getAuthority(tx, {
          ...f.scope,
          assetId: intent.id,
        })
        expect(exact).toMatchObject({
          kind: "VERIFIED",
          scope: { dataClassification: "QA" },
          stored: {
            tenantId: f.tenant.id,
            bookId: f.book.id,
            billId: f.expense.id,
            assetId: intent.id,
            contentDigest: f.receipt.contentDigest,
            storageProvider: "vercel_blob_private",
            storagePath,
            storageStoreId,
            verifiedAt,
          },
          metadata: {
            id: intent.id,
            uploadState: "VERIFIED",
            safetyState: "QUARANTINED",
            attachmentState: "UNATTACHED",
          },
        })
        if (exact.kind !== "VERIFIED")
          throw new Error("Persisted completion did not reload as VERIFIED")
        expect(exact.metadata).not.toHaveProperty("storageStoreId")

        const audits = await tx.financeExpenseReceiptAuditEvent.findMany({
          where: {
            tenantId: f.tenant.id,
            bookId: f.book.id,
            billId: f.expense.id,
            assetId: intent.id,
          },
          orderBy: { occurredAt: "asc" },
          select: { kind: true, actorUserId: true, assetVersion: true },
        })
        expect(audits).toEqual([
          { kind: "INTENT_CREATED", actorUserId: f.owner.id, assetVersion: 0 },
          { kind: "UPLOAD_CLAIMED", actorUserId: f.owner.id, assetVersion: 1 },
          { kind: "UPLOAD_VERIFIED", actorUserId: f.owner.id, assetVersion: 2 },
        ])
        expect(
          await tx.financeExpenseReceiptAsset.count({
            where: { id: intent.id, storageStoreId },
          }),
        ).toBe(1)
      })
    }, 120_000)

    test("fresh authority refuses after the creator's membership is suspended", async () => {
      await rolledBack(async (tx) => {
        const f = await fixture(tx)
        const intent = await createReceipt(tx, f.receipt)
        const claim = await claimUpload(tx, {
          ...f.scope,
          assetId: intent.id,
          storageStoreId: "store_receiptauthorityrevoke",
        })
        await tx.membership.updateMany({
          where: { tenantId: f.tenant.id, userId: f.owner.id },
          data: { status: "SUSPENDED" },
        })
        await expect(revalidateClaim(tx, claim)).rejects.toMatchObject({
          code: "FORBIDDEN",
        })
        const stillClaimed =
          await tx.financeExpenseReceiptAsset.findUniqueOrThrow({
            where: { id: intent.id },
          })
        expect(stillClaimed.uploadState).toBe("CLAIMED")
        expect(stillClaimed.uploadClaimId).toBe(claim.claimId)
      })
    }, 120_000)
  },
)
