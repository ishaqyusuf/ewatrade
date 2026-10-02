import {
  addExactDecimals,
  compareExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../generated/prisma/client"

type Quantity = { toString(): string }
export type CommercialCompletionLine = {
  kind: string
  id?: string
  quantity: Quantity
  productFulfillments: Array<{ createdAt?: Date; quantity: Quantity }>
  snapshot?: {
    serviceAuthorizationPolicy?: string | null
    serviceWorkPolicy: string | null
  } | null
  serviceAuthorization?: {
    authorizedAt: Date
    orderId: string
    orderLineId: string
    quantity: Quantity
    tenantId: string
  } | null
  serviceFulfillment?: {
    orderId: string
    performedAt: Date
    quantity: Quantity
    tenantId: string
  } | null
  serviceJobLines: Array<{
    allocatedQuantity: Quantity
    authorizationStatus: string
    completedAt: Date | null
    reworkOfLineId: string | null
    status: string
    serviceJob: { commercialOrderId: string; storeId: string; tenantId: string }
  }>
}

export type CommercialCompletionScope = {
  orderId: string
  storeId: string
  tenantId: string
}

export function isCommercialOrderFulfillmentAllowed(status: string) {
  return (
    status === "CONFIRMED" || status === "FULFILLING" || status === "COMPLETED"
  )
}

/** Full original obligations only: cancellations and rework never add sold quantity. */
export function areCommercialOrderLinesComplete(
  lines: CommercialCompletionLine[],
  scope: CommercialCompletionScope,
  completedBy?: Date,
) {
  if (lines.length === 0) return false
  return lines.every((line) => {
    const ordered = parseExactDecimal(line.quantity.toString(), {
      allowZero: false,
      maxScale: 6,
    })
    let performed = "0"
    if (line.kind === "PRODUCT_UNIT") {
      for (const fulfillment of line.productFulfillments) {
        if (
          completedBy &&
          (!fulfillment.createdAt || fulfillment.createdAt > completedBy)
        )
          return false
        performed = addExactDecimals(
          performed,
          parseExactDecimal(fulfillment.quantity.toString(), {
            allowZero: false,
            maxScale: 6,
          }),
        )
      }
    } else if (line.kind === "SERVICE") {
      const serviceWorkPolicy = line.snapshot?.serviceWorkPolicy ?? null
      const serviceAuthorizationPolicy =
        line.snapshot?.serviceAuthorizationPolicy ?? null
      if (serviceWorkPolicy === "CHARGE_ONLY") {
        const source = line.serviceFulfillment
        if (
          !source ||
          line.serviceJobLines.length > 0 ||
          source.orderId !== scope.orderId ||
          source.tenantId !== scope.tenantId ||
          Number.isNaN(source.performedAt.getTime()) ||
          (completedBy && source.performedAt > completedBy)
        )
          return false
        if (serviceAuthorizationPolicy === "MANUAL_RELEASE") {
          const authorization = line.serviceAuthorization
          if (
            !authorization ||
            authorization.tenantId !== scope.tenantId ||
            authorization.orderId !== scope.orderId ||
            authorization.orderLineId !== line.id ||
            Number.isNaN(authorization.authorizedAt.getTime()) ||
            authorization.authorizedAt > source.performedAt ||
            compareExactDecimals(
              parseExactDecimal(authorization.quantity.toString(), {
                allowZero: false,
                maxScale: 6,
              }),
              parseExactDecimal(line.quantity.toString(), {
                allowZero: false,
                maxScale: 6,
              }),
            ) !== 0
          )
            return false
        } else if (
          serviceAuthorizationPolicy !== "ON_ORDER_CONFIRMATION" &&
          serviceAuthorizationPolicy !== "AFTER_REQUIRED_PAYMENT"
        )
          return false
        performed = parseExactDecimal(source.quantity.toString(), {
          allowZero: false,
          maxScale: 6,
        })
      } else {
        if (
          (serviceWorkPolicy !== null && serviceWorkPolicy !== "TRACKED") ||
          line.serviceFulfillment
        )
          return false
        let allocated = "0"
        for (const allocation of line.serviceJobLines) {
          const job = allocation.serviceJob
          if (
            job.commercialOrderId !== scope.orderId ||
            job.storeId !== scope.storeId ||
            job.tenantId !== scope.tenantId
          )
            return false
          if (allocation.reworkOfLineId) continue
          const quantity = parseExactDecimal(
            allocation.allocatedQuantity.toString(),
            {
              allowZero: false,
              maxScale: 6,
            },
          )
          allocated = addExactDecimals(allocated, quantity)
          if (allocation.status === "CANCELLED") continue
          if (
            allocation.status !== "COMPLETED" ||
            allocation.authorizationStatus !== "AUTHORIZED" ||
            !allocation.completedAt
          )
            return false
          if (completedBy && allocation.completedAt > completedBy) return false
          performed = addExactDecimals(performed, quantity)
        }
        if (compareExactDecimals(allocated, ordered) !== 0) return false
      }
    } else return false
    return compareExactDecimals(performed, ordered) === 0
  })
}

/** Caller holds the financial Order lock before source mutations and this reread. */
export async function readCommercialOrderLinesComplete(
  tx: Prisma.TransactionClient,
  scope: CommercialCompletionScope,
  completedBy?: Date,
) {
  const lines = await tx.commercialOrderLine.findMany({
    where: {
      orderId: scope.orderId,
      order: { storeId: scope.storeId, tenantId: scope.tenantId },
    },
    select: {
      kind: true,
      id: true,
      quantity: true,
      productFulfillments: { select: { createdAt: true, quantity: true } },
      snapshot: {
        select: {
          serviceAuthorizationPolicy: true,
          serviceWorkPolicy: true,
        },
      },
      serviceAuthorization: {
        select: {
          authorizedAt: true,
          orderId: true,
          orderLineId: true,
          quantity: true,
          tenantId: true,
        },
      },
      serviceFulfillment: {
        select: {
          orderId: true,
          performedAt: true,
          quantity: true,
          tenantId: true,
        },
      },
      serviceJobLines: {
        select: {
          allocatedQuantity: true,
          authorizationStatus: true,
          completedAt: true,
          reworkOfLineId: true,
          status: true,
          serviceJob: {
            select: { commercialOrderId: true, storeId: true, tenantId: true },
          },
        },
      },
    },
  })
  return areCommercialOrderLinesComplete(lines, scope, completedBy)
}

/** Completion status alone cannot turn unperformed obligations into earned sales. */
export async function readCommercialOrderEarnedCompletion(
  tx: Prisma.TransactionClient,
  scope: CommercialCompletionScope,
) {
  const order = await tx.commercialOrder.findFirst({
    where: {
      id: scope.orderId,
      storeId: scope.storeId,
      tenantId: scope.tenantId,
    },
    select: {
      completedAt: true,
      currencyCode: true,
      status: true,
      totalMinor: true,
      acceptedCommerceQuoteVersion: {
        select: {
          acceptedOrderId: true,
          currencyCode: true,
          fulfilmentType: true,
          status: true,
          totalMinor: true,
          quote: {
            select: { sourceType: true, storeId: true, tenantId: true },
          },
        },
      },
      prescriptionPickupFulfillment: {
        select: {
          handedOffAt: true,
          orderId: true,
          packedAt: true,
          status: true,
          storeId: true,
          tenantId: true,
        },
      },
      prescriptionDeliveryAssignment: {
        select: {
          deliveredAt: true,
          orderId: true,
          proofReference: true,
          status: true,
          storeId: true,
          tenantId: true,
          address: { select: { packedAt: true } },
        },
      },
    },
  })
  if (!order || order.status !== "COMPLETED" || !order.completedAt) return false
  const version = order.acceptedCommerceQuoteVersion
  if (
    version &&
    (version.status !== "ACCEPTED" ||
      version.acceptedOrderId !== scope.orderId ||
      version.quote.tenantId !== scope.tenantId ||
      version.quote.storeId !== scope.storeId ||
      version.currencyCode !== order.currencyCode ||
      version.totalMinor !== order.totalMinor)
  )
    return false
  if (version?.quote.sourceType !== "PRESCRIPTION_REQUEST") {
    // A Prescription fulfillment row cannot be reclassified as ordinary stock proof.
    if (
      order.prescriptionPickupFulfillment ||
      order.prescriptionDeliveryAssignment
    )
      return false
    return readCommercialOrderLinesComplete(tx, scope, order.completedAt)
  }
  if (version.fulfilmentType === "PICKUP") {
    const pickup = order.prescriptionPickupFulfillment
    return Boolean(
      pickup &&
        pickup.orderId === scope.orderId &&
        pickup.storeId === scope.storeId &&
        pickup.tenantId === scope.tenantId &&
        pickup.status === "HANDED_OFF" &&
        pickup.packedAt &&
        pickup.handedOffAt &&
        pickup.packedAt <= pickup.handedOffAt &&
        pickup.handedOffAt <= order.completedAt,
    )
  }
  if (version.fulfilmentType === "DELIVERY") {
    const delivery = order.prescriptionDeliveryAssignment
    return Boolean(
      delivery &&
        delivery.orderId === scope.orderId &&
        delivery.storeId === scope.storeId &&
        delivery.tenantId === scope.tenantId &&
        delivery.status === "DELIVERED" &&
        delivery.address.packedAt &&
        delivery.deliveredAt &&
        delivery.proofReference?.trim() &&
        delivery.address.packedAt <= delivery.deliveredAt &&
        delivery.deliveredAt <= order.completedAt,
    )
  }
  return false
}
