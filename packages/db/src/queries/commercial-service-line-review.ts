import { createHash } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { effectiveCommercialAmountPaid } from "./commercial-payments"
import {
  assertChargeOnlyServicePerformance,
  assertChargeOnlyServiceRelease,
} from "./commercial-service-line-policy"

/** Caller authorizes this read; confirmation must repeat it under the command locks. */
export async function getCommercialServiceLineReview(
  db: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    orderLineId: string
    action: "authorize" | "fulfill"
  },
) {
  const line = await db.commercialOrderLine.findFirst({
    where: {
      id: input.orderLineId,
      order: { tenantId: input.tenantId, storeId: input.storeId },
    },
    select: {
      id: true,
      kind: true,
      quantity: true,
      snapshot: {
        select: {
          offeringName: true,
          serviceWorkPolicy: true,
          serviceAuthorizationPolicy: true,
        },
      },
      serviceJobLines: { orderBy: { id: "asc" }, select: { id: true } },
      serviceAuthorization: true,
      serviceFulfillment: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          completedAt: true,
          currencyCode: true,
          amountPaidMinor: true,
          totalMinor: true,
          paymentStatus: true,
          payments: { orderBy: { id: "asc" }, select: { id: true } },
          deliveryDueAt: true,
          acceptedCommerceQuoteVersion: {
            select: { quote: { select: { sourceType: true } } },
          },
          prescriptionPickupFulfillment: { select: { orderId: true } },
          prescriptionDeliveryAssignment: { select: { orderId: true } },
        },
      },
    },
  })
  if (!line) {
    throw new CatalogError("ORDER_NOT_FOUND", "Order line was not found in this Store.")
  }
  let blocker: { code: string; message: string } | null = null
  let quantity = line.quantity.toString()
  try {
    quantity = input.action === "authorize"
      ? assertChargeOnlyServiceRelease(line)
      : assertChargeOnlyServicePerformance(line, input).quantity
  } catch (error) {
    if (!(error instanceof CatalogError)) throw error
    blocker = { code: error.code, message: error.message }
  }
  const amountPaidMinor = effectiveCommercialAmountPaid({
    amountPaidMinor: line.order.amountPaidMinor,
    totalMinor: line.order.totalMinor,
    paymentStatus: line.order.paymentStatus,
    paymentCount: line.order.payments.length,
  })
  return {
    action: input.action,
    orderId: line.order.id,
    orderNumber: line.order.orderNumber,
    orderLineId: line.id,
    offeringName: line.snapshot?.offeringName ?? null,
    quantity,
    quantityScope: "full_saved_line" as const,
    workPolicy: line.snapshot?.serviceWorkPolicy ?? null,
    authorizationPolicy: line.snapshot?.serviceAuthorizationPolicy ?? null,
    scheduledFor: line.order.deliveryDueAt,
    payment: {
      currencyCode: line.order.currencyCode,
      amountPaidMinor,
      totalMinor: line.order.totalMinor,
      balanceDueMinor: Math.max(0, line.order.totalMinor - amountPaidMinor),
    },
    eligible: blocker === null,
    blocker,
    effects: {
      physicalStockChange: false,
      recordsManagerRelease: input.action === "authorize",
      recordsServicePerformance: input.action === "fulfill",
      orderCompletion: input.action === "fulfill" ? "derived_from_all_lines" : "unchanged",
    },
    // Bind action, scope and persisted evidence; never bind a moving server clock.
    revision: createHash("sha256").update(JSON.stringify({
      tenantId: input.tenantId,
      storeId: input.storeId,
      action: input.action,
      line,
    })).digest("hex"),
  }
}
