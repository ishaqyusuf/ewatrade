import { afterAll, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { Prisma } from "../../../generated/prisma/client"
import { describeWithServiceCommerceDatabase } from "../acceptance/service-commerce/database"
import { financeExpenseReceiptStoragePath } from "./expense-receipt-rules"
import {
  claimFinanceExpenseReceiptUploadInTransaction as claimUpload,
  createFinanceExpenseReceiptInTransaction as createReceipt,
  getFinanceExpenseReceiptInTransaction as getReceipt,
  listFinanceExpenseReceiptsInTransaction as listReceipts,
  recordFinanceExpenseReceiptVerifiedInTransaction as verified,
} from "./expense-receipts"

const fixtureTenantIds: string[] = []
const fixtureUserIds: string[] = []

async function fixture(tx: Prisma.TransactionClient) {
  const suffix = randomUUID()
  const owner = await tx.user.create({
    data: {
      email: `receipt-owner-${suffix}@example.invalid`,
      name: "Synthetic receipt owner",
    },
  })
  const admin = await tx.user.create({
    data: {
      email: `receipt-admin-${suffix}@example.invalid`,
      name: "Synthetic receipt admin",
    },
  })
  const staff = await tx.user.create({
    data: {
      email: `receipt-staff-${suffix}@example.invalid`,
      name: "Synthetic receipt staff",
    },
  })
  const tenant = await tx.tenant.create({
    data: {
      slug: `receipt-${suffix}`,
      name: "Synthetic receipt acceptance",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      dataClassification: "QA",
      users: {
        create: [
          { userId: owner.id, role: "OWNER", status: "ACTIVE" },
          { userId: admin.id, role: "ADMIN", status: "ACTIVE" },
          { userId: staff.id, role: "CASHIER", status: "ACTIVE" },
        ],
      },
    },
  })
  fixtureUserIds.push(owner.id, admin.id, staff.id)
  fixtureTenantIds.push(tenant.id)
  const book = await tx.financeBook.create({
    data: {
      tenantId: tenant.id,
      currencyCode: "NGN",
      timezone: "Africa/Lagos",
      startsAt: new Date("2026-01-01"),
      createdById: owner.id,
    },
  })
  const bill = await tx.financeBill.create({
    data: {
      bookId: book.id,
      kind: "EXPENSE",
      payeeName: "Synthetic supplier",
      description: "Synthetic expense metadata fixture",
      incurredAt: new Date("2026-02-01"),
      totalMinor: 1000n,
      actorUserId: owner.id,
    },
  })
  const scope = {
    tenantId: tenant.id,
    actorUserId: owner.id,
    bookId: book.id,
    billId: bill.id,
  }
  const input = {
    ...scope,
    clientCommandId: "receipt-command-1",
    originalFileName: "receipt.pdf",
    contentDigest: "a".repeat(64),
    contentType: "application/pdf" as const,
    sizeBytes: 16,
  }
  return { scope, input, owner, admin, staff, tenant, book, bill }
}

const rollback = new Error("ROLLBACK_SYNTHETIC_RECEIPT_ACCEPTANCE")
async function withRollback(
  execute: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  const { prisma } = await import("../../client")
  try {
    await prisma.$transaction(
      async (tx) => {
        await execute(tx)
        throw rollback
      },
      { timeout: 30_000, maxWait: 10_000 },
    )
  } catch (error) {
    if (error !== rollback) throw error
  }
}

describeWithServiceCommerceDatabase("expense receipt metadata", () => {
  afterAll(async () => {
    const { prisma } = await import("../../client")
    expect(
      await prisma.tenant.count({ where: { id: { in: fixtureTenantIds } } }),
    ).toBe(0)
    expect(
      await prisma.user.count({ where: { id: { in: fixtureUserIds } } }),
    ).toBe(0)
    const where = { tenantId: { in: fixtureTenantIds } }
    const counts = await Promise.all([
      prisma.financeExpenseReceiptAsset.count({ where }),
      prisma.financeExpenseReceiptAuditEvent.count({ where }),
      prisma.financeExpenseReceiptDownloadGrant.count({ where }),
    ])
    for (const count of counts) expect(count).toBe(0)
    console.info(
      "Receipt rollback absence evidence",
      JSON.stringify({
        tenantIds: fixtureTenantIds,
        userIds: fixtureUserIds,
        assetAuditGrantCounts: counts,
        tenantCount: 0,
        userCount: 0,
      }),
    )
  })

  test("restrictive receipt relation prevents deleting its saved Expense", async () => {
    await expect(
      withRollback(async (tx) => {
        const f = await fixture(tx)
        await createReceipt(tx, f.input)
        await tx.financeBill.delete({ where: { id: f.bill.id } })
      }),
    ).rejects.toMatchObject({ code: "P2003" })
  }, 150_000)

  test("composite Book relation rejects an otherwise valid foreign Tenant", async () => {
    await expect(
      withRollback(async (tx) => {
        const f = await fixture(tx)
        const other = await fixture(tx)
        const first = await createReceipt(tx, f.input)
        const original = await tx.financeExpenseReceiptAsset.findUniqueOrThrow({
          where: { id: first.id },
        })
        const id = randomUUID()
        await tx.financeExpenseReceiptAsset.create({
          data: {
            ...original,
            safetyAttestation: undefined,
            id,
            tenantId: other.tenant.id,
            storagePath: financeExpenseReceiptStoragePath({
              ...f.input,
              tenantId: other.tenant.id,
              assetId: id,
            }),
          },
        })
      }),
    ).rejects.toMatchObject({ code: "P2003" })
  }, 150_000)

  test("original command replay and current Owner/Admin authority", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const first = await createReceipt(tx, f.input)
      expect(await createReceipt(tx, f.input)).toEqual(first)
      expect(
        await tx.financeExpenseReceiptAsset.count({
          where: { bookId: f.book.id },
        }),
      ).toBe(1)
      expect(
        await tx.financeExpenseReceiptAuditEvent.count({
          where: { bookId: f.book.id },
        }),
      ).toBe(1)
      await expect(
        createReceipt(tx, { ...f.input, originalFileName: "other.pdf" }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        createReceipt(tx, { ...f.input, actorUserId: f.admin.id }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const adminScope = {
        ...f.scope,
        actorUserId: f.admin.id,
        assetId: first.id,
      }
      expect(await getReceipt(tx, adminScope)).toEqual(first)
      await expect(
        claimUpload(tx, { ...adminScope, storageStoreId: "store_test" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        getReceipt(tx, {
          ...f.scope,
          actorUserId: f.staff.id,
          assetId: first.id,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        getReceipt(tx, {
          ...f.scope,
          tenantId: "wrong-tenant",
          assetId: first.id,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
    })
  }, 150_000)

  test("saved Expense scope, scoped cursors and bounded private metadata pages", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const first = await createReceipt(tx, f.input)
      const purchase = await tx.financeBill.create({
        data: {
          bookId: f.book.id,
          kind: "PURCHASE",
          payeeName: "Synthetic purchase",
          description: "Wrong source",
          incurredAt: f.bill.incurredAt,
          totalMinor: 10n,
          actorUserId: f.owner.id,
        },
      })
      await expect(
        createReceipt(tx, {
          ...f.input,
          billId: purchase.id,
          clientCommandId: "wrong-source-command",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      const otherExpense = await tx.financeBill.create({
        data: {
          bookId: f.book.id,
          kind: "EXPENSE",
          payeeName: "Other expense",
          description: "Synthetic cursor scope",
          incurredAt: f.bill.incurredAt,
          totalMinor: 10n,
          actorUserId: f.owner.id,
        },
      })
      await expect(
        listReceipts(tx, {
          ...f.scope,
          billId: otherExpense.id,
          cursor: first.id,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      const second = await createReceipt(tx, {
        ...f.input,
        clientCommandId: "receipt-command-2",
      })
      const page = await listReceipts(tx, { ...f.scope, limit: 1 })
      expect(page.items.map((asset) => asset.id)).toEqual([first.id])
      expect(page.nextCursor).toBe(first.id)
      expect(
        (
          await listReceipts(tx, {
            ...f.scope,
            limit: 1,
            cursor: first.id,
          })
        ).items.map((asset) => asset.id),
      ).toEqual([second.id])
      for (const key of [
        "storagePath",
        "storageStoreId",
        "uploadClaimId",
        "contentDigest",
        "safetyAttestation",
      ])
        expect(first).not.toHaveProperty(key)
    })
  }, 150_000)

  test("exact live upload claim and verified completion remain quarantined", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const first = await createReceipt(tx, f.input)
      const reservation = await claimUpload(tx, {
        ...f.scope,
        assetId: first.id,
        storageStoreId: "store_test",
      })
      expect(reservation.scope.dataClassification).toBe("QA")
      await expect(
        claimUpload(tx, {
          ...f.scope,
          assetId: first.id,
          storageStoreId: "store_test",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      // Internal synthetic descriptor exercises metadata only; never storage or safety approval.
      const stored = {
        ...reservation.target,
        storageProvider: "vercel_blob_private" as const,
        storagePath: financeExpenseReceiptStoragePath(reservation.target),
        storageStoreId: "store_test",
        state: "QUARANTINED" as const,
        verifiedAt: new Date(),
      }
      const completion = {
        ...f.scope,
        assetId: first.id,
        claimId: reservation.claimId,
        claimVersion: reservation.claimVersion,
        stored,
      }
      await expect(
        verified(tx, {
          ...completion,
          claimVersion: reservation.claimVersion - 1,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        verified(tx, {
          ...completion,
          stored: { ...stored, contentDigest: "b".repeat(64) },
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      const finished = await verified(tx, completion)
      expect(finished).toMatchObject({
        uploadState: "VERIFIED",
        safetyState: "QUARANTINED",
        attachmentState: "UNATTACHED",
        attachedAt: null,
      })
      expect(await verified(tx, completion)).toEqual(finished)
      expect(
        await tx.financeExpenseReceiptAuditEvent.count({
          where: { assetId: first.id },
        }),
      ).toBe(3)
      expect(
        await tx.financeExpenseReceiptDownloadGrant.count({
          where: { assetId: first.id },
        }),
      ).toBe(0)
    })
  }, 150_000)

  test("revoked membership, inactive Tenant and purge block every retry", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const first = await createReceipt(tx, f.input)
      const reservation = await claimUpload(tx, {
        ...f.scope,
        assetId: first.id,
        storageStoreId: "store_test",
      })
      const stored = {
        ...reservation.target,
        storageProvider: "vercel_blob_private" as const,
        storagePath: financeExpenseReceiptStoragePath(reservation.target),
        storageStoreId: "store_test",
        state: "QUARANTINED" as const,
        verifiedAt: new Date(),
      }
      const completion = {
        ...f.scope,
        assetId: first.id,
        claimId: reservation.claimId,
        claimVersion: reservation.claimVersion,
        stored,
      }
      const finished = await verified(tx, completion)
      await tx.membership.updateMany({
        where: { tenantId: f.tenant.id, userId: f.owner.id },
        data: { status: "SUSPENDED" },
      })
      await expect(createReceipt(tx, f.input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      await expect(verified(tx, completion)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      await tx.membership.updateMany({
        where: { tenantId: f.tenant.id, userId: f.owner.id },
        data: { status: "ACTIVE" },
      })
      await tx.tenant.update({
        where: { id: f.tenant.id },
        data: { qaPurgeStartedAt: new Date() },
      })
      await expect(
        getReceipt(tx, { ...f.scope, assetId: first.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await tx.tenant.update({
        where: { id: f.tenant.id },
        data: { qaPurgeStartedAt: null },
      })
      await tx.tenant.update({
        where: { id: f.tenant.id },
        data: { isActive: false },
      })
      await expect(verified(tx, completion)).rejects.toMatchObject({
        code: "FORBIDDEN",
      })
      await tx.tenant.update({
        where: { id: f.tenant.id },
        data: { isActive: true },
      })
    })
  }, 150_000)

  test("source cancellation retains completed retries without changing money", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const first = await createReceipt(tx, f.input)
      const reservation = await claimUpload(tx, {
        ...f.scope,
        assetId: first.id,
        storageStoreId: "store_test",
      })
      const stored = {
        ...reservation.target,
        storageProvider: "vercel_blob_private" as const,
        storagePath: financeExpenseReceiptStoragePath(reservation.target),
        storageStoreId: "store_test",
        state: "QUARANTINED" as const,
        verifiedAt: new Date(),
      }
      const completion = {
        ...f.scope,
        assetId: first.id,
        claimId: reservation.claimId,
        claimVersion: reservation.claimVersion,
        stored,
      }
      const finished = await verified(tx, completion)
      await tx.financeBill.update({
        where: { id: f.bill.id },
        data: { voidedAt: new Date() },
      })
      expect(await createReceipt(tx, f.input)).toEqual(finished)
      expect(await verified(tx, completion)).toEqual(finished)
      const source = await tx.financeBill.findUniqueOrThrow({
        where: { id: f.bill.id },
      })
      expect(source.totalMinor).toBe(1000n)
      expect(source.paidMinor).toBe(0n)
      expect(source.incurredAt).toEqual(f.bill.incurredAt)
      expect(
        (await tx.financeBook.findUniqueOrThrow({ where: { id: f.book.id } }))
          .lastSequence,
      ).toBe(0n)
      expect(
        await tx.financeJournalEntry.count({ where: { bookId: f.book.id } }),
      ).toBe(0)
    })
  }, 150_000)

  test("cancelled Expense refuses new intent claim and verified completion", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const first = await createReceipt(tx, f.input)
      const reservation = await claimUpload(tx, {
        ...f.scope,
        assetId: first.id,
        storageStoreId: "store_test",
      })
      const stored = {
        ...reservation.target,
        storageProvider: "vercel_blob_private" as const,
        storagePath: financeExpenseReceiptStoragePath(reservation.target),
        storageStoreId: "store_test",
        state: "QUARANTINED" as const,
        verifiedAt: new Date(),
      }
      const completion = {
        ...f.scope,
        assetId: first.id,
        claimId: reservation.claimId,
        claimVersion: reservation.claimVersion,
        stored,
      }
      await tx.financeBill.update({
        where: { id: f.bill.id },
        data: { voidedAt: new Date() },
      })
      await expect(
        createReceipt(tx, {
          ...f.input,
          clientCommandId: "cancelled-new-intent",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(
        claimUpload(tx, {
          ...f.scope,
          assetId: first.id,
          storageStoreId: "store_test",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      await expect(verified(tx, completion)).rejects.toMatchObject({
        code: "CONFLICT",
      })
      const source = await tx.financeBill.findUniqueOrThrow({
        where: { id: f.bill.id },
      })
      expect(source.totalMinor).toBe(1000n)
      expect(source.paidMinor).toBe(0n)
      expect(source.incurredAt).toEqual(f.bill.incurredAt)
      expect(
        (await tx.financeBook.findUniqueOrThrow({ where: { id: f.book.id } }))
          .lastSequence,
      ).toBe(0n)
      expect(
        await tx.financeJournalEntry.count({ where: { bookId: f.book.id } }),
      ).toBe(0)
    })
  }, 150_000)

  test("Book serialized intent quotas are per creator and exclude expired intents", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const first = await createReceipt(tx, f.input)
      const original = await tx.financeExpenseReceiptAsset.findUniqueOrThrow({
        where: { id: first.id },
      })
      await tx.financeExpenseReceiptAsset.createMany({
        data: Array.from({ length: 31 }, (_, index) => {
          const id = randomUUID()
          return {
            ...original,
            safetyAttestation: undefined,
            id,
            clientCommandId: `synthetic-quota-${index}`,
            storagePath: financeExpenseReceiptStoragePath({
              ...f.input,
              assetId: id,
            }),
          }
        }),
      })
      await expect(
        createReceipt(tx, {
          ...f.input,
          clientCommandId: "blocked-quota-command",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(
        await tx.financeCommand.count({
          where: {
            bookId: f.book.id,
            clientCommandId: "blocked-quota-command",
          },
        }),
      ).toBe(0)
      expect(
        (
          await createReceipt(tx, {
            ...f.input,
            actorUserId: f.admin.id,
            clientCommandId: "admin-own-quota-command",
          })
        ).id,
      ).toBeString()
      await tx.financeExpenseReceiptAsset.update({
        where: { id: first.id },
        data: { expiresAt: new Date(0) },
      })
      expect(
        (
          await createReceipt(tx, {
            ...f.input,
            clientCommandId: "expiry-frees-quota-command",
          })
        ).id,
      ).toBeString()
    })
  }, 150_000)

  test("ever-attached evidence reserves the per Expense limit after withdrawal", async () => {
    await withRollback(async (tx) => {
      const f = await fixture(tx)
      const first = await createReceipt(tx, f.input)
      const original = await tx.financeExpenseReceiptAsset.findUniqueOrThrow({
        where: { id: first.id },
      })
      await tx.financeExpenseReceiptAsset.createMany({
        data: Array.from({ length: 12 }, (_, index) => {
          const id = randomUUID()
          return {
            ...original,
            safetyAttestation: undefined,
            id,
            clientCommandId: `synthetic-attached-${index}`,
            storagePath: financeExpenseReceiptStoragePath({
              ...f.input,
              assetId: id,
            }),
            uploadState: "VERIFIED" as const,
            safetyState: "SAFE" as const,
            attachmentState: "WITHDRAWN" as const,
            attachedAt: new Date(),
            attachedById: f.owner.id,
            withdrawnAt: new Date(),
            withdrawnById: f.owner.id,
          }
        }),
      })
      await expect(
        createReceipt(tx, {
          ...f.input,
          clientCommandId: "attached-limit-command",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" })
      expect(await createReceipt(tx, f.input)).toEqual(first)
    })
  }, 150_000)
})
