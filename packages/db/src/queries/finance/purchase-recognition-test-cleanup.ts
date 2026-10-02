import type { PrismaClient } from "../../../generated/prisma/client"
import {
  type PurchaseCleanupScope,
  assertPurchaseCleanupScope,
} from "./purchase-recognition-cleanup-scope"

function assertCleanup(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

export async function cleanupPurchaseRecognitionTest(
  db: PrismaClient,
  input: PurchaseCleanupScope,
) {
  const { run, tenantId, actorUserId, bookId, items } = input
  await db.$transaction(
    async (tx) => {
      const tenant = tenantId
        ? await tx.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, slug: true, dataClassification: true },
          })
        : null
      const book = bookId
        ? await tx.financeBook.findUnique({
            where: { id: bookId },
            select: { id: true, tenantId: true },
          })
        : null
      const user = actorUserId
        ? await tx.user.findUnique({
            where: { id: actorUserId },
            select: { id: true, email: true },
          })
        : null
      const ownedItems = items.length
        ? await tx.catalogItem.findMany({
            where: { id: { in: items } },
            select: { id: true, tenantId: true },
          })
        : []
      const foreignMemberships = actorUserId
        ? await tx.membership.count({
            where: {
              userId: actorUserId,
              ...(tenantId ? { tenantId: { not: tenantId } } : {}),
            },
          })
        : 0
      assertPurchaseCleanupScope(input, {
        tenant,
        book,
        user,
        items: ownedItems,
        foreignMemberships,
      })
      if (bookId) {
        const scope = { bookId }
        await tx.financeInventoryValuationEvent.deleteMany({
          where: scope,
        })
        await tx.financeInventoryPool.deleteMany({ where: scope })
        await tx.financePurchaseReceiptLine.deleteMany({ where: scope })
        await tx.financePurchaseRecognitionEvent.deleteMany({
          where: { ...scope, reversalOfId: { not: null } },
        })
        await tx.financePurchaseRecognitionEvent.deleteMany({
          where: scope,
        })
        await tx.financePurchaseRecognitionLine.deleteMany({
          where: scope,
        })
        await tx.financePurchaseRecognition.deleteMany({ where: scope })
        await tx.financeSupplierAllocationRelease.deleteMany({
          where: scope,
        })
        await tx.financeSupplierAllocation.deleteMany({ where: scope })
        await tx.financeSupplierEntry.deleteMany({
          where: { ...scope, reversalOfId: { not: null } },
        })
        await tx.financeSupplierEntry.deleteMany({ where: scope })
        await tx.financeBillPayment.deleteMany({ where: scope })
        await tx.financeBillLine.deleteMany({ where: scope })
        await tx.financeBill.deleteMany({ where: scope })
      }
      if (tenantId) {
        await tx.stockMovement.deleteMany({
          where: { operation: { tenantId } },
        })
        await tx.stockOperationCategory.deleteMany({
          where: { tenantId },
        })
        await tx.stockOperation.deleteMany({ where: { tenantId } })
        await tx.stockBalanceSource.deleteMany({ where: { tenantId } })
        await tx.stockOperationCategoryName.deleteMany({
          where: { tenantId },
        })
      }
      if (bookId) {
        await tx.financeSupplierAccount.deleteMany({ where: { bookId } })
        await tx.financeJournalLine.deleteMany({ where: { bookId } })
        await tx.financeJournalEntry.deleteMany({
          where: { bookId, reversalOfId: { not: null } },
        })
        await tx.financeJournalEntry.deleteMany({ where: { bookId } })
        await tx.financeCommand.deleteMany({ where: { bookId } })
        await tx.financeAccount.deleteMany({ where: { bookId } })
        await tx.financeBook.deleteMany({ where: { id: bookId } })
      }
      await tx.catalogItem.deleteMany({ where: { id: { in: items } } })
      if (tenantId) {
        await tx.store.deleteMany({ where: { tenantId } })
        await tx.membership.deleteMany({ where: { tenantId } })
        await tx.tenant.delete({ where: { id: tenantId } })
      }
      if (actorUserId) await tx.user.delete({ where: { id: actorUserId } })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
  const checks = await Promise.all([
    tenantId ? db.tenant.count({ where: { id: tenantId } }) : 0,
    actorUserId ? db.user.count({ where: { id: actorUserId } }) : 0,
    db.catalogItem.count({ where: { id: { in: items } } }),
    ...(bookId
      ? [
          db.financeBook.count({ where: { id: bookId } }),
          db.financeCommand.count({ where: { bookId } }),
          db.financeJournalEntry.count({ where: { bookId } }),
          db.financeBill.count({ where: { bookId } }),
          db.financeSupplierEntry.count({ where: { bookId } }),
          db.financePurchaseRecognition.count({ where: { bookId } }),
          db.financePurchaseRecognitionEvent.count({ where: { bookId } }),
          db.financePurchaseRecognitionLine.count({ where: { bookId } }),
          db.financePurchaseReceiptLine.count({ where: { bookId } }),
          db.financeInventoryValuationEvent.count({ where: { bookId } }),
          db.financeInventoryPool.count({ where: { bookId } }),
        ]
      : []),
    ...(tenantId
      ? [
          db.stockOperation.count({ where: { tenantId } }),
          db.stockBalanceSource.count({ where: { tenantId } }),
        ]
      : []),
  ])
  assertCleanup(
    checks.every((count) => count === 0),
    `Supplier recognition fixture ${run} remains: ${checks.join(",")}`,
  )
  console.log(
    `supplier-recognition ${run}: ${checks.length} cleanup checks clear`,
  )
}
