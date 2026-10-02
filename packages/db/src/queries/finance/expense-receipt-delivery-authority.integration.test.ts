import { afterAll, expect, test } from "bun:test"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { createQaPrivateMediaSafetyAttestation } from "@ewatrade/service-commerce"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { FINANCE_DEFAULT_ACCOUNTS } from "./accounts"
import {
  getFinanceExpenseReceiptDeliveryAuthorityInTransaction as getAuthority,
  revalidateFinanceExpenseReceiptConsumedGrantInTransaction as revalidateGrant,
} from "./expense-receipt-delivery-authority"
import {
  FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE,
  FINANCE_EXPENSE_RECEIPT_GRANT_VERSION,
  FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE,
} from "./expense-receipt-lifecycle"
import { financeExpenseReceiptStoragePath } from "./expense-receipt-rules"

const transactionOptions = { maxWait: 10_000, timeout: 30_000 }
const expectedDevelopmentHost =
  "ep-ancient-snow-awbalfv3-pooler.c-12.us-east-1.aws.neon.tech"
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === "1") {
  const target = new URL(process.env.EWATRADE_DATABASE_URL ?? "")
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.DEV_PROFILE !== "local" ||
    process.env.APP_ENV !== "local" ||
    process.env.DATABASE_PROFILE_VERIFIED !== "1" ||
    target.hostname !== expectedDevelopmentHost ||
    target.pathname !== "/neondb"
  )
    throw new Error(
      "Expense receipt delivery authority acceptance requires the approved guarded development target.",
    )
}

const tenantIds: string[] = []
const userIds: string[] = []
const rollback = new Error("ROLLBACK_EXPENSE_RECEIPT_DELIVERY_AUTHORITY")
const sha = (value: string) => createHash("sha256").update(value).digest("hex")

async function fixture(tx: Prisma.TransactionClient) {
  const suffix = randomUUID()
  const owner = await tx.user.create({
    data: {
      email: `receipt-delivery-owner-${suffix}@example.invalid`,
      name: "Synthetic receipt creator",
    },
  })
  userIds.push(owner.id)
  const admin = await tx.user.create({
    data: {
      email: `receipt-delivery-admin-${suffix}@example.invalid`,
      name: "Synthetic receipt reader",
    },
  })
  userIds.push(admin.id)
  const tenant = await tx.tenant.create({
    data: {
      slug: `receipt-delivery-${suffix}`,
      name: "Synthetic receipt delivery acceptance",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      dataClassification: "QA",
      users: {
        create: [
          { userId: owner.id, role: "OWNER", status: "ACTIVE" },
          { userId: admin.id, role: "ADMIN", status: "ACTIVE" },
        ],
      },
    },
  })
  tenantIds.push(tenant.id)
  const book = await tx.financeBook.create({
    data: {
      tenantId: tenant.id,
      currencyCode: "NGN",
      timezone: "Africa/Lagos",
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      createdById: owner.id,
      accounts: { create: FINANCE_DEFAULT_ACCOUNTS },
    },
  })
  const now = new Date()
  const expense = await tx.financeBill.create({
    data: {
      bookId: book.id,
      kind: "EXPENSE",
      payeeName: "Synthetic receipt source",
      description: "Rollback-only delivery authority acceptance",
      incurredAt: new Date("2026-09-15T12:00:00.000Z"),
      totalMinor: 1250n,
      actorUserId: owner.id,
      voidedAt: now,
    },
  })
  const scope = {
    tenantId: tenant.id,
    bookId: book.id,
    billId: expense.id,
    actorUserId: admin.id,
  }
  const assetId = randomUUID()
  const contentDigest = sha(`synthetic original PDF bytes ${suffix}`)
  const storageStoreId = "store_receiptqa"
  const createdAt = new Date(now.getTime() - 5_000)
  const uploadClaimedAt = new Date(now.getTime() - 4_000)
  const verifiedAt = new Date(now.getTime() - 3_000)
  const safetyReviewedAt = new Date(now.getTime() - 2_000)
  const attachedAt = new Date(now.getTime() - 1_000)
  const expiresAt = new Date(now.getTime() + 86_400_000)
  const attestation = createQaPrivateMediaSafetyAttestation({
    byteSize: 128,
    contentDigest,
    mimeType: "application/pdf",
    mediaAssetId: assetId,
    storageReference: "synthetic persisted original; no provider call",
  })
  const storagePath = financeExpenseReceiptStoragePath({
    ...scope,
    assetId,
    contentDigest,
    contentType: "application/pdf",
  })
  const asset = await tx.financeExpenseReceiptAsset.create({
    data: {
      id: assetId,
      ...scope,
      actorUserId: owner.id,
      clientCommandId: `receipt-delivery-intent-${suffix}`,
      payloadHash: sha(suffix),
      originalFileName: "synthetic-original.pdf",
      contentDigest,
      contentType: "application/pdf",
      sizeBytes: 128,
      storageProvider: "vercel_blob_private",
      storageStoreId,
      storagePath,
      uploadState: "VERIFIED",
      safetyState: "SAFE",
      attachmentState: "ATTACHED",
      version: 4,
      uploadClaimId: null,
      uploadClaimedAt,
      uploadLeaseUntil: null,
      verifiedClaimId: `claim-${suffix}`,
      verifiedClaimVersion: 2,
      verifiedAt,
      safetyAttestation: {
        purpose: FINANCE_EXPENSE_RECEIPT_QA_SAFETY_PURPOSE,
        version: 1,
        runtime: "qa_fixture",
        attestation,
      },
      safetyReviewedAt,
      attachedAt,
      attachedById: owner.id,
      withdrawnAt: null,
      withdrawnById: null,
      retentionHold: true,
      retentionHoldReason: "Synthetic attached financial evidence",
      cleanupClaimId: null,
      cleanupLeaseUntil: null,
      bytesDeletedAt: null,
      createdAt,
      expiresAt,
    },
  })
  await tx.financeExpenseReceiptAuditEvent.createMany({
    data: [
      ["INTENT_CREATED", createdAt],
      ["UPLOAD_CLAIMED", uploadClaimedAt],
      ["UPLOAD_VERIFIED", verifiedAt],
      ["SAFETY_REVIEWED", safetyReviewedAt],
      ["ATTACHED", attachedAt],
    ].map(([kind, occurredAt]) => ({
      tenantId: tenant.id,
      bookId: book.id,
      billId: expense.id,
      assetId,
      actorUserId: owner.id,
      kind: kind as
        | "INTENT_CREATED"
        | "UPLOAD_CLAIMED"
        | "UPLOAD_VERIFIED"
        | "SAFETY_REVIEWED"
        | "ATTACHED",
      assetVersion: 4,
      occurredAt: occurredAt as Date,
    })),
  })
  const issuedAt = new Date(now.getTime() - 800)
  const consumedAt = new Date(now.getTime() - 700)
  const grant = await tx.financeExpenseReceiptDownloadGrant.create({
    data: {
      id: `grant_${randomUUID()}`,
      ...scope,
      assetId,
      sessionDigest: sha(`synthetic session ${suffix}`),
      nonceDigest: sha(randomBytes(32).toString("hex")),
      contentDigest,
      purpose: FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE,
      version: FINANCE_EXPENSE_RECEIPT_GRANT_VERSION,
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 60_000),
      consumedAt,
      revokedAt: null,
    },
  })
  return {
    scope,
    owner,
    admin,
    tenant,
    book,
    expense,
    asset,
    grant,
    storagePath,
    storageStoreId,
    verifiedAt,
    issuedAt,
    consumedAt,
  }
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
  "expense receipt delivery authority persistence",
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
        "Expense receipt delivery authority rollback absence",
        JSON.stringify({
          tenantIds,
          userIds,
          tenantUserAssetAuditGrantCounts: counts,
        }),
      )
    })

    test("current Admin may inspect and revalidate a consumed grant for a cancelled retained original", async () => {
      await rolledBack(async (tx) => {
        const f = await fixture(tx)
        const input = {
          ...f.scope,
          assetId: f.asset.id,
          grantId: f.grant.id,
          nonceDigest: f.grant.nonceDigest,
          sessionDigest: f.grant.sessionDigest,
          purpose: f.grant.purpose,
          version: f.grant.version,
        }
        const inspected = await getAuthority(tx, {
          ...f.scope,
          assetId: f.asset.id,
        })
        expect(inspected).toEqual({
          scope: {
            tenantId: f.tenant.id,
            bookId: f.book.id,
            billId: f.expense.id,
            actorUserId: f.admin.id,
            dataClassification: "QA",
          },
          original: {
            assetId: f.asset.id,
            tenantId: f.tenant.id,
            bookId: f.book.id,
            billId: f.expense.id,
            contentDigest: f.asset.contentDigest,
            contentType: "application/pdf",
            sizeBytes: 128,
            storageProvider: "vercel_blob_private",
            storagePath: f.storagePath,
            verifiedAt: f.verifiedAt,
            storageStoreId: f.storageStoreId,
          },
        })
        expect(inspected.scope.actorUserId).not.toBe(f.owner.id)
        expect(f.expense.voidedAt).toBeInstanceOf(Date)

        const revalidated = await revalidateGrant(tx, input)
        expect(revalidated).toEqual(inspected)
        const persistedGrant =
          await tx.financeExpenseReceiptDownloadGrant.findUniqueOrThrow({
            where: { id: f.grant.id },
          })
        expect(persistedGrant).toMatchObject({
          tenantId: f.tenant.id,
          bookId: f.book.id,
          billId: f.expense.id,
          assetId: f.asset.id,
          actorUserId: f.admin.id,
          sessionDigest: input.sessionDigest,
          nonceDigest: input.nonceDigest,
          contentDigest: f.asset.contentDigest,
          purpose: FINANCE_EXPENSE_RECEIPT_GRANT_PURPOSE,
          version: FINANCE_EXPENSE_RECEIPT_GRANT_VERSION,
          issuedAt: f.issuedAt,
          consumedAt: f.consumedAt,
          revokedAt: null,
        })
        expect(persistedGrant.expiresAt.getTime() - f.issuedAt.getTime()).toBe(
          60_000,
        )
        expect(persistedGrant.consumedAt).toBeInstanceOf(Date)
        if (!persistedGrant.consumedAt)
          throw new Error("Missing persisted consumption")
        expect(persistedGrant.consumedAt.getTime()).toBeLessThanOrEqual(
          Date.now(),
        )
        expect(
          await tx.financeExpenseReceiptAuditEvent.count({
            where: { assetId: f.asset.id, kind: "ATTACHED" },
          }),
        ).toBe(1)
        const book = await tx.financeBook.findUniqueOrThrow({
          where: { id: f.book.id },
        })
        expect(book.lastSequence).toBe(0n)
        expect(
          await tx.financeJournalEntry.count({ where: { bookId: f.book.id } }),
        ).toBe(0)
      })
    }, 120_000)

    test("an expired persisted consumed grant refuses without changing the retained source", async () => {
      await rolledBack(async (tx) => {
        const f = await fixture(tx)
        const expiredAt = new Date(Date.now() - 1_000)
        await tx.financeExpenseReceiptDownloadGrant.update({
          where: { id: f.grant.id },
          data: { expiresAt: expiredAt },
        })
        const input = {
          ...f.scope,
          assetId: f.asset.id,
          grantId: f.grant.id,
          nonceDigest: f.grant.nonceDigest,
          sessionDigest: f.grant.sessionDigest,
          purpose: f.grant.purpose,
          version: f.grant.version,
        }
        await expect(revalidateGrant(tx, input)).rejects.toMatchObject({
          code: "FORBIDDEN",
        })
        const persistedGrant =
          await tx.financeExpenseReceiptDownloadGrant.findUniqueOrThrow({
            where: { id: f.grant.id },
          })
        expect(persistedGrant.expiresAt).toEqual(expiredAt)
        expect(persistedGrant.consumedAt).toEqual(f.consumedAt)
        expect(persistedGrant.revokedAt).toBeNull()
        const retained = await tx.financeExpenseReceiptAsset.findUniqueOrThrow({
          where: { id: f.asset.id },
        })
        expect(retained).toMatchObject({
          attachmentState: "ATTACHED",
          safetyState: "SAFE",
          retentionHold: true,
          bytesDeletedAt: null,
          storagePath: f.storagePath,
          storageStoreId: f.storageStoreId,
        })
        expect(retained.withdrawnAt).toBeNull()
      })
    }, 120_000)
  },
)
