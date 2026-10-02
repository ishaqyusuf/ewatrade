import type { PrismaClient } from "../../../generated/prisma/client"
import {
  type OpeningCostAcceptanceScope,
  assertOpeningCostAcceptanceScope,
  cleanupOpeningCostAcceptance,
} from "./opening-cost.integration-cleanup"

/** Test-only, exact-run cleanup of connected Commerce/transfer/review probes. */
export async function cleanupConnectedCostAcceptance(
  db: PrismaClient,
  scope: OpeningCostAcceptanceScope,
  options?: { stockCounts?: boolean },
) {
  await assertOpeningCostAcceptanceScope(db, scope)
  const owned = { tenantId: { in: scope.tenantIds } }
  await db.$transaction(
    async (tx) => {
      await tx.financeInventoryPool.updateMany({
        where: owned,
        data: { lastCostReviewSnapshotId: null },
      })
      await tx.financeInventoryCostReviewJournal.deleteMany({ where: owned })
      await tx.financeInventoryCostReviewEvidence.deleteMany({ where: owned })
      await tx.financeInventoryCostReviewPool.deleteMany({ where: owned })
      await tx.financeInventoryCostReviewAllocation.deleteMany({ where: owned })
      await tx.financeInventoryCostReview.deleteMany({ where: owned })
      await tx.financeProductReturnCostAllocation.deleteMany({ where: owned })
      await tx.financeInventoryValuationEvent.deleteMany({ where: owned })
      await tx.financeProductReturnCost.deleteMany({ where: owned })
      await tx.productReturn.deleteMany({ where: owned })
      await tx.productFulfillment.deleteMany({
        where: { orderLine: { order: owned } },
      })
      await tx.stockReservation.deleteMany({ where: owned })
      await tx.commercialOrder.deleteMany({ where: owned })
      await tx.stockTransfer.deleteMany({ where: owned })
      if (options?.stockCounts) await tx.stockCount.deleteMany({ where: owned })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
  const extra = await Promise.all([
    db.financeProductReturnCost.count({ where: owned }),
    db.financeProductReturnCostAllocation.count({ where: owned }),
    db.productReturn.count({ where: owned }),
    db.productFulfillment.count({ where: { orderLine: { order: owned } } }),
    db.stockReservation.count({ where: owned }),
    db.commercialOrder.count({ where: owned }),
    db.stockTransfer.count({ where: owned }),
    db.offeringSnapshot.count({ where: { orderLine: { order: owned } } }),
  ])
  if (options?.stockCounts)
    extra.push(
      ...(await Promise.all([
        db.stockCount.count({ where: owned }),
        db.stockCountLine.count({ where: { stockCount: owned } }),
        db.stockCountEntry.count({
          where: { stockCountLine: { stockCount: owned } },
        }),
      ])),
    )
  const original = await cleanupOpeningCostAcceptance(db, scope)
  return [...original, ...extra]
}
