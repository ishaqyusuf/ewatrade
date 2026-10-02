import type { PrismaClient } from "../../../generated/prisma/client"

export type OpeningCostAcceptanceScope = {
  runId: string
  tenantIds: string[]
  userIds: string[]
  bookIds: string[]
}

/** Test-only preflight, shared with connected-source acceptance cleanup. */
export async function assertOpeningCostAcceptanceScope(
  db: PrismaClient,
  scope: OpeningCostAcceptanceScope,
) {
  const { runId, tenantIds, userIds, bookIds } = scope
  if (!/^[a-f0-9-]{36}$/.test(runId))
    throw new Error("Invalid opening QA run identity")
  const [tenants, users, books, otherMemberships] = await Promise.all([
    db.tenant.count({
      where: {
        id: { in: tenantIds },
        dataClassification: "QA",
        slug: { startsWith: "opening-cost-", endsWith: `-${runId}` },
      },
    }),
    db.user.count({
      where: {
        id: { in: userIds },
        email: {
          in: [
            `opening-cost-${runId}@example.invalid`,
            `opening-cost-manager-${runId}@example.invalid`,
          ],
        },
      },
    }),
    db.financeBook.count({
      where: { id: { in: bookIds }, tenantId: { in: tenantIds } },
    }),
    db.membership.count({
      where: { userId: { in: userIds }, tenantId: { notIn: tenantIds } },
    }),
  ])
  if (
    tenants !== tenantIds.length ||
    users !== userIds.length ||
    books !== bookIds.length ||
    otherMemberships !== 0
  )
    throw new Error("Opening QA cleanup ownership preflight failed")
}

/** Test-only cleanup: validate exact run ownership before deleting any QA records. */
export async function cleanupOpeningCostAcceptance(
  db: PrismaClient,
  scope: OpeningCostAcceptanceScope,
) {
  await assertOpeningCostAcceptanceScope(db, scope)
  const { tenantIds, userIds, bookIds } = scope
  const tenantScope = { tenantId: { in: tenantIds } }
  await db.$transaction(
    async (tx) => {
      const books = { bookId: { in: bookIds } }
      await tx.financeInventoryPool.updateMany({
        where: tenantScope,
        data: { lastCostReviewSnapshotId: null },
      })
      await tx.financeInventoryCostReviewJournal.deleteMany({
        where: tenantScope,
      })
      await tx.financeInventoryCostReviewEvidence.deleteMany({
        where: tenantScope,
      })
      await tx.financeInventoryCostReviewPool.deleteMany({ where: tenantScope })
      await tx.financeInventoryCostReviewAllocation.deleteMany({
        where: tenantScope,
      })
      await tx.financeInventoryCostReview.deleteMany({ where: tenantScope })
      await tx.financeInventoryValuationEvent.deleteMany({ where: tenantScope })
      await tx.financeInventoryPool.deleteMany({ where: tenantScope })
      await tx.financePurchaseReceiptLine.deleteMany({ where: books })
      await tx.financeSupplierEntry.deleteMany({ where: books })
      await tx.financeBillPayment.deleteMany({ where: books })
      await tx.financeBillLine.deleteMany({ where: books })
      await tx.financeBill.deleteMany({ where: books })
      await tx.catalogCommandReceipt.deleteMany({ where: tenantScope })
      await tx.stockMovement.deleteMany({ where: { operation: tenantScope } })
      await tx.stockOperationCategory.deleteMany({
        where: { stockOperation: tenantScope },
      })
      await tx.stockOperation.deleteMany({ where: tenantScope })
      await tx.stockOperationCategoryName.deleteMany({ where: tenantScope })
      await tx.stockBalanceSource.deleteMany({ where: tenantScope })
      await tx.financeSupplierAccount.deleteMany({ where: books })
      await tx.financeJournalLine.deleteMany({ where: books })
      await tx.financeJournalEntry.deleteMany({ where: books })
      await tx.financeCommand.deleteMany({ where: books })
      await tx.financeAccount.deleteMany({ where: books })
      await tx.financeBook.deleteMany({ where: tenantScope })
      await tx.catalogSourceLineLink.deleteMany({ where: tenantScope })
      await tx.catalogPriceChange.deleteMany({ where: tenantScope })
      await tx.catalogItem.deleteMany({ where: tenantScope })
      await tx.serviceCommercePolicyAuditEvent.deleteMany({
        where: tenantScope,
      })
      await tx.serviceCommercePolicyDecision.deleteMany({ where: tenantScope })
      await tx.serviceCommerceStoreAuditEvent.deleteMany({ where: tenantScope })
      await tx.serviceCommerceStoreProfile.deleteMany({ where: tenantScope })
      await tx.store.deleteMany({ where: tenantScope })
      await tx.membership.deleteMany({ where: tenantScope })
      await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })
      await tx.user.deleteMany({ where: { id: { in: userIds } } })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
  const remaining = await Promise.all([
    db.financeInventoryCostReview.count({ where: tenantScope }),
    db.financeInventoryCostReviewAllocation.count({ where: tenantScope }),
    db.financeInventoryCostReviewEvidence.count({ where: tenantScope }),
    db.financeInventoryCostReviewPool.count({ where: tenantScope }),
    db.financeInventoryCostReviewJournal.count({ where: tenantScope }),
    db.tenant.count({ where: { id: { in: tenantIds } } }),
    db.user.count({ where: { id: { in: userIds } } }),
    db.membership.count({ where: tenantScope }),
    db.store.count({ where: tenantScope }),
    db.catalogItem.count({ where: tenantScope }),
    db.catalogCommandReceipt.count({ where: tenantScope }),
    db.stockBalanceSource.count({ where: tenantScope }),
    db.stockOperation.count({ where: tenantScope }),
    db.stockMovement.count({ where: { operation: tenantScope } }),
    db.financeBook.count({ where: tenantScope }),
    db.financeInventoryPool.count({ where: tenantScope }),
    db.financeInventoryValuationEvent.count({ where: tenantScope }),
    db.financeBill.count({ where: { book: tenantScope } }),
    db.financeJournalEntry.count({ where: { book: tenantScope } }),
    db.serviceCommercePolicyDecision.count({ where: tenantScope }),
    db.serviceCommercePolicyAuditEvent.count({ where: tenantScope }),
    db.serviceCommerceStoreAuditEvent.count({ where: tenantScope }),
    db.catalogSourceLineLink.count({ where: tenantScope }),
  ])
  return remaining
}
