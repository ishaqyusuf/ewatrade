import { createHash } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { getCommercialProductLineReview } from "./commercial-product-line-review"
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
  const products: Awaited<ReturnType<typeof getCommercialProductLineReview>>[] = []
  const services: Awaited<ReturnType<typeof getCommercialServiceLineReview>>[] = []
  for (const target of targets) {
    if (target.kind === "PRODUCT_UNIT") {
      products.push(await getCommercialProductLineReview(db, { ...input, orderLineId: target.id }))
    } else {
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
    revision: createHash("sha256").update(JSON.stringify({ input, order, targets,
      products: products.map(line => line.revision), services: services.map(line => line.revision),
    })).digest("hex"),
  }
}
