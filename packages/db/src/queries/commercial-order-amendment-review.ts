import type { Prisma } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import { assessOrderAmendment } from "./commercial-order-amendment-policy"

/** Internal read groundwork. Callers must authorize; confirmation must reread under locks. */
export async function getCommercialOrderAmendmentEligibility(
  db: Prisma.TransactionClient,
  input: { tenantId: string; storeId: string; orderId: string },
) {
  const order = await db.commercialOrder.findFirst({
    where: {
      id: input.orderId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      amountPaidMinor: true,
      updatedAt: true,
      store: { select: { status: true } },
      acceptedQuoteVersion: { select: { id: true } },
      acceptedCommerceQuoteVersion: { select: { id: true } },
      serviceIntake: { select: { id: true } },
      prescriptionPickupFulfillment: { select: { id: true } },
      prescriptionDeliveryAddress: { select: { id: true } },
      prescriptionDeliveryAssignment: { select: { id: true } },
      _count: {
        select: {
          lines: true,
          payments: true,
          ledgerEntries: true,
          returns: true,
          serviceAuthorizations: true,
          serviceFulfillments: true,
          serviceJobs: true,
          prescriptionPaymentIntents: true,
          serviceBookings: true,
        },
      },
      lines: {
        orderBy: { id: "asc" },
        take: 501,
        select: {
          id: true,
          orderId: true,
          offeringId: true,
          kind: true,
          quantity: true,
          snapshot: {
            select: {
              orderLineId: true,
              offeringId: true,
              offeringKind: true,
              quantity: true,
            },
          },
          stockReservation: {
            select: {
              status: true,
              committedAt: true,
              committedOperationId: true,
            },
          },
          _count: {
            select: { productFulfillments: true, serviceJobLines: true },
          },
        },
      },
    },
  })
  if (
    !order ||
    order.id !== input.orderId ||
    order.tenantId !== input.tenantId ||
    order.storeId !== input.storeId
  )
    throw new CatalogError(
      "ORDER_NOT_FOUND",
      "Order not found for this business and Store.",
    )
  const evidence = {
    status: order.status,
    paymentStatus: order.paymentStatus,
    amountPaidMinor: order.amountPaidMinor,
    storeActive: order.store.status === "ACTIVE",
    lineCount: order._count.lines,
    inspectedLineCount: order.lines.length,
    snapshotsComplete:
      order.lines.length <= 500 &&
      new Set(order.lines.map((line) => line.id)).size === order.lines.length &&
      order.lines.every(
        (line) =>
          line.orderId === order.id &&
          line.snapshot?.orderLineId === line.id &&
          line.snapshot.offeringId === line.offeringId &&
          line.snapshot.offeringKind === line.kind &&
          line.snapshot.quantity.toString() === line.quantity.toString(),
      ),
    paymentCount: order._count.payments,
    fulfillmentCount:
      order._count.serviceFulfillments +
      order.lines.reduce(
        (total, line) => total + line._count.productFulfillments,
        0,
      ),
    returnCount: order._count.returns,
    committedReservationCount: order.lines.filter(
      (line) =>
        line.stockReservation &&
        (line.stockReservation.status === "COMMITTED" ||
          line.stockReservation.committedAt ||
          line.stockReservation.committedOperationId),
    ).length,
    ledgerEntryCount: order._count.ledgerEntries,
    serviceAuthorizationCount: order._count.serviceAuthorizations,
    trackedWorkCount:
      order._count.serviceJobs +
      order.lines.reduce(
        (total, line) => total + line._count.serviceJobLines,
        0,
      ),
    quoteOwned: Boolean(
      order.acceptedQuoteVersion || order.acceptedCommerceQuoteVersion,
    ),
    prescriptionOwned: Boolean(
      order._count.prescriptionPaymentIntents ||
        order.prescriptionPickupFulfillment ||
        order.prescriptionDeliveryAddress ||
        order.prescriptionDeliveryAssignment,
    ),
    bookingCount: order._count.serviceBookings,
    intakeOwned: Boolean(order.serviceIntake),
  }
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    updatedAt: order.updatedAt.toISOString(),
    evidence,
    eligibility: assessOrderAmendment(evidence),
  }
}
