import { createHash } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { getCommercialProductLineReviews } from "./commercial-product-line-review"
import { getCommercialServiceLineReview } from "./commercial-service-line-review"
import { productBatchImpact } from "./product-batch-impact"

/** Authorized read only. Confirmation must re-read the complete scope under locks. */
export async function getCommercialProductBatchReview(
  db: Prisma.TransactionClient,
  input: { tenantId: string; storeId: string; orderId: string },
) {
  const order = await db.commercialOrder.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId, storeId: input.storeId },
    select: { id: true, orderNumber: true, status: true, deliveryDueAt: true },
  })
  if (!order) throw new CatalogError("ORDER_NOT_FOUND", "Order was not found in this Store.")
  const targets = await db.commercialOrderLine.findMany({
    where: { orderId: order.id, OR: [
      { kind: "PRODUCT_UNIT", productFulfillments: { none: {} }, stockReservation: { status: "ACTIVE" } },
      { kind: "SERVICE", serviceFulfillment: null, snapshot: { customLineRole: { not: null } } },
    ] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, kind: true },
  })
  if (!targets.length) throw new CatalogError("INVALID_ORDER", "This Order has no remaining eligible fulfillment lines.")
  const products = await getCommercialProductLineReviews(db, { ...input,
    orderLineIds: targets.filter(target => target.kind === "PRODUCT_UNIT").map(target => target.id),
  })
  const services: Awaited<ReturnType<typeof getCommercialServiceLineReview>>[] = []
  for (const target of targets) {
    if (target.kind !== "PRODUCT_UNIT") {
      const service = await getCommercialServiceLineReview(db, { ...input, orderLineId: target.id, action: "fulfill" })
      if (!service.eligible)
        throw new CatalogError("INVALID_ORDER", service.blocker?.message ?? "A catalog-free line cannot be fulfilled.")
      services.push(service)
    }
  }
  return {
    orderId: order.id, orderNumber: order.orderNumber,
    quantityScope: "full_saved_lines" as const,
    products, services, balances: productBatchImpact(products),
    executionOrder: [...services, ...products].map(line => line.orderLineId),
    revision: createHash("sha256").update(JSON.stringify({ tenantId: input.tenantId, storeId: input.storeId, orderId: input.orderId, order, targets,
      products: products.map(line => line.revision), services: services.map(line => line.revision),
    })).digest("hex"),
  }
}

/** Call after canonical financial/Order locks, before the first fulfillment effect. */
export async function assertCommercialProductBatchReview(
  db: Prisma.TransactionClient,
  input: { tenantId: string; storeId?: string; orderId: string; expectedReviewRevision?: string },
) {
  if (input.expectedReviewRevision === undefined) return
  if (!input.storeId)
    throw new CatalogError("INVALID_ORDER", "A reviewed batch requires its Store.")
  // Lock the Order's reservations first, then each unique balance in stable order.
  // The parent Order lock prevents canonical line-set mutations during this check.
  const reservations = await db.$queryRaw<Array<{ id: string; balanceSourceId: string }>>`
    SELECT r."id", r."balanceSourceId" FROM "StockReservation" r
    JOIN "CommercialOrderLine" l ON l."id" = r."commercialOrderLineId"
    WHERE l."orderId" = ${input.orderId} AND r."tenantId" = ${input.tenantId}
      AND r."storeId" = ${input.storeId}
    ORDER BY r."id" FOR UPDATE OF r
  `
  for (const id of [...new Set(reservations.map(row => row.balanceSourceId))].sort()) {
    const balances = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "StockBalanceSource"
      WHERE "id" = ${id} AND "tenantId" = ${input.tenantId}
        AND "storeId" = ${input.storeId} FOR UPDATE
    `
    if (balances.length !== 1 || balances[0]?.id !== id)
      throw new CatalogError("REVISION_CONFLICT", "A reviewed stock balance is no longer available.")
  }
  try {
    const review = await getCommercialProductBatchReview(db, {
      tenantId: input.tenantId, storeId: input.storeId, orderId: input.orderId,
    })
    if (review.revision !== input.expectedReviewRevision)
      throw new CatalogError("REVISION_CONFLICT", "Order fulfillment evidence changed. Review this action again.")
  } catch (error) {
    if (!(error instanceof CatalogError)) throw error
    throw new CatalogError("REVISION_CONFLICT", "Order fulfillment evidence changed. Review this action again.")
  }
}
