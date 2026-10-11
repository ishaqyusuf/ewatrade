import { previewProductReturnJournal } from "./finance/preview-product-return-journal"
import { createHash } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"
import { getCommercialProductReturnStockReview, readCommercialProductReturnStockReview } from "./commercial-product-return-review"
import { previewProductReturnOriginalCostFromSource } from "./finance/preview-product-return-cost"
import { productReturnDestinationImpact } from "./finance/product-return-destination-impact"

/** Complete impact evidence; confirmation must repeat this under canonical locks. */
export async function getCommercialProductReturnImpactReview(
  db: Prisma.TransactionClient,
  input: Parameters<typeof getCommercialProductReturnStockReview>[1],
) {
  const { review: stockReview, line } = await readCommercialProductReturnStockReview(db, input)
  const originalCost = await previewProductReturnOriginalCostFromSource(db, input, {
    id: line.id,
    order: { currencyCode: line.order.currencyCode, tenantId: line.order.tenantId, storeId: line.order.storeId },
    productFulfillments: [...line.productFulfillments].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(({ quantity }) => ({ quantity })),
    productReturns: [...line.productReturns].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(({ quantity }) => ({ quantity })),
  })
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
  const journal = await previewProductReturnJournal(db, {
    ...input, orderId: stockReview.orderId, bookId: originalCost.bookId,
    sourceCostMinor: originalCost.sourceCostMinor,
  })
  return {
    ...stockReview, originalCost, destination, journal,
    customerCredit: "NOT_RECORDED" as const, cashRefund: "NOT_RECORDED" as const,
    financialReview: "REVIEWED" as const,
    impactRevision: createHash("sha256").update(JSON.stringify({
      stockRevision: stockReview.stockRevision, sourceRevision: originalCost.sourceRevision,
      destinationEvidence, journal,
    }, (_key, value) => typeof value === "bigint" ? value.toString() : value)).digest("hex"),
  }
}
