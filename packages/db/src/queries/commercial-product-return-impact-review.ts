import { createHash } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"
import { getCommercialProductReturnStockReview } from "./commercial-product-return-review"
import { previewProductReturnOriginalCost } from "./finance/preview-product-return-cost"
import { productReturnDestinationImpact } from "./finance/product-return-destination-impact"

/** Stock and valuation review; journal eligibility must be composed before confirmation. */
export async function getCommercialProductReturnImpactReview(
  db: Prisma.TransactionClient,
  input: Parameters<typeof getCommercialProductReturnStockReview>[1],
) {
  const stockReview = await getCommercialProductReturnStockReview(db, input)
  const originalCost = await previewProductReturnOriginalCost(db, input)
  let destination = null
  let destinationEvidence = null
  if (stockReview.stock && originalCost.bookId) {
    const balanceSourceId = stockReview.stock.balanceSourceId
    const pool = await db.financeInventoryPool.findUnique({
      where: { bookId_balanceSourceId: { bookId: originalCost.bookId, balanceSourceId } },
    })
    const movementCount = await db.stockMovement.count({ where: { balanceSourceId } })
    const impact = productReturnDestinationImpact({
      pool, before: stockReview.stock.canonicalBefore, movementCount: movementCount + 1,
      effectiveAt: new Date(),
      sourceCostMinor: originalCost.sourceCostMinor === null ? null : BigInt(originalCost.sourceCostMinor),
      sourceUnknownReason: originalCost.unknownReason,
    })
    destination = {
      valueBeforeMinor: impact.valueBeforeMinor?.toString() ?? null,
      valueAfterMinor: impact.valueAfterMinor?.toString() ?? null,
      valueDeltaMinor: impact.valueBeforeMinor === null || originalCost.sourceCostMinor === null ? null : originalCost.sourceCostMinor,
      unknownReason: impact.resolvedUnknown,
    }
    destinationEvidence = { pool, movementCount }
  }
  return {
    ...stockReview, originalCost, destination,
    customerCredit: "NOT_RECORDED" as const, cashRefund: "NOT_RECORDED" as const,
    financialReview: "JOURNAL_PENDING" as const,
    impactRevision: createHash("sha256").update(JSON.stringify({
      stockRevision: stockReview.stockRevision, sourceRevision: originalCost.sourceRevision,
      destinationEvidence,
    }, (_key, value) => typeof value === "bigint" ? value.toString() : value)).digest("hex"),
  }
}
