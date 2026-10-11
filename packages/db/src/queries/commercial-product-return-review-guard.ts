import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { assertHeldCommerceFinancialOrder } from "./customer-ledger/commerce-locks"
import { getCommercialProductReturnImpactReview } from "./commercial-product-return-impact-review"

/** Caller already owns financial/Order locks; lock stock before repeating review. */
export async function assertCommercialProductReturnReview(
  tx: Prisma.TransactionClient,
  input: Parameters<typeof getCommercialProductReturnImpactReview>[1] & {
    orderId: string; expectedReviewRevision: string
  },
  heldOrder: object,
) {
  assertHeldCommerceFinancialOrder(tx, heldOrder, input)
  const line = await tx.commercialOrderLine.findFirst({
    where: { id: input.orderLineId, orderId: input.orderId, order: { tenantId: input.tenantId, storeId: input.storeId } },
    select: { snapshot: { select: { balanceSourceId: true } } },
  })
  if (!line?.snapshot) throw new CatalogError("ORDER_NOT_FOUND", "Product return source not found.")
  const ids = [...new Set([
    line.snapshot.balanceSourceId,
    input.disposition === "restock" ? input.destinationBalanceSourceId : null,
  ].filter((id): id is string => !!id))].sort()
  for (const id of ids) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "StockBalanceSource"
      WHERE id = ${id} AND "tenantId" = ${input.tenantId} AND "storeId" = ${input.storeId}
      FOR UPDATE
    `
    if (!rows.length) throw new CatalogError("REVISION_CONFLICT", "Return stock source changed.")
  }
  const review = await getCommercialProductReturnImpactReview(tx, {
    tenantId: input.tenantId, storeId: input.storeId, orderLineId: input.orderLineId,
    quantity: input.quantity, disposition: input.disposition,
    destinationBalanceSourceId: input.destinationBalanceSourceId,
  })
  if (review.impactRevision !== input.expectedReviewRevision)
    throw new CatalogError("REVISION_CONFLICT", "Return quantities, stock or cost evidence changed. Review the return again.")
  return review
}
