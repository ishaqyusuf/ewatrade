import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import type { PaymentStatus } from "../../generated/prisma/enums"
import { CatalogError } from "./catalog-errors"
import { isCommercialOrderFulfillmentAllowed } from "./commercial-order-completion"
import { effectiveCommercialAmountPaid } from "./commercial-payments"

type Quantity = { toString(): string }
export type ChargeOnlyLineEvidence = {
  id: string
  kind: string
  quantity: Quantity
  snapshot: {
    serviceWorkPolicy: string | null
    serviceAuthorizationPolicy: string | null
  } | null
  serviceJobLines: Array<{ id: string }>
  serviceFulfillment: unknown | null
  serviceAuthorization: {
    tenantId: string
    orderId: string
    orderLineId: string
    quantity: Quantity
    authorizedAt: Date
  } | null
  order: {
    id: string
    status: string
    completedAt: Date | null
    deliveryDueAt?: Date | null
    acceptedCommerceQuoteVersion: { quote: { sourceType: string } } | null
    prescriptionPickupFulfillment: unknown | null
    prescriptionDeliveryAssignment: unknown | null
  }
}
export type ChargeOnlyPerformanceEvidence = ChargeOnlyLineEvidence & {
  order: {
    amountPaidMinor: number
    totalMinor: number
    paymentStatus: PaymentStatus
    payments: Array<{ id: string }>
  }
}

/** Shared by read previews and locked execution; actor authority stays with the command. */
export function assertChargeOnlyServiceRelease(line: ChargeOnlyLineEvidence) {
  if (line.serviceAuthorization) {
    throw new CatalogError(
      "REVISION_CONFLICT",
      "This Service Order line already has a manager release.",
    )
  }
  if (
    line.kind !== "SERVICE" ||
    !line.snapshot ||
    line.snapshot.serviceWorkPolicy !== "CHARGE_ONLY" ||
    line.snapshot.serviceAuthorizationPolicy !== "MANUAL_RELEASE" ||
    line.serviceJobLines.length > 0
  ) {
    throw new CatalogError(
      "SERVICE_WORK_NOT_AUTHORIZED",
      "Only unallocated CHARGE_ONLY Services with manual-release policy can be released here.",
    )
  }
  if (
    line.serviceFulfillment ||
    line.order.completedAt ||
    !["CONFIRMED", "FULFILLING"].includes(line.order.status)
  ) {
    throw new CatalogError(
      "REVISION_CONFLICT",
      "This Order line cannot receive a new Service release in its current state.",
    )
  }
  if (
    line.order.acceptedCommerceQuoteVersion?.quote.sourceType ===
      "PRESCRIPTION_REQUEST" ||
    line.order.prescriptionPickupFulfillment ||
    line.order.prescriptionDeliveryAssignment
  ) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Prescription Orders require their clinical fulfillment source.",
    )
  }

  let quantity: string
  try {
    quantity = parseExactDecimal(line.quantity.toString(), {
      allowZero: false,
      maxScale: 6,
    })
  } catch {
    throw new CatalogError(
      "INVALID_ORDER",
      "The Service Order line has an invalid quantity.",
    )
  }
  return quantity
}

export function assertChargeOnlyServicePerformance(
  line: ChargeOnlyPerformanceEvidence,
  input: { tenantId: string },
  now = new Date(),
) {
  if (line.serviceFulfillment) {
    throw new CatalogError(
      "REVISION_CONFLICT",
      "This Service Order line has already been performed.",
    )
  }
  if (line.kind !== "SERVICE" || !line.snapshot) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Only snapshotted Service Order lines can be performed here.",
    )
  }
  if (
    line.snapshot.serviceWorkPolicy !== "CHARGE_ONLY" ||
    line.serviceJobLines.length > 0
  ) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Only unallocated CHARGE_ONLY Service lines can be performed here.",
    )
  }
  if (
    line.order.acceptedCommerceQuoteVersion?.quote.sourceType ===
      "PRESCRIPTION_REQUEST" ||
    line.order.prescriptionPickupFulfillment ||
    line.order.prescriptionDeliveryAssignment
  ) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Prescription Orders require their clinical fulfillment source.",
    )
  }
  if (
    !isCommercialOrderFulfillmentAllowed(line.order.status) ||
    line.order.status === "COMPLETED" ||
    (line.order.deliveryDueAt &&
      line.order.deliveryDueAt.getTime() > now.getTime())
  ) {
    throw new CatalogError(
      "INVALID_ORDER",
      "This Order cannot accept new Service performance in its current state.",
    )
  }

  let quantity: string
  try {
    quantity = parseExactDecimal(line.quantity.toString(), {
      allowZero: false,
      maxScale: 6,
    })
  } catch {
    throw new CatalogError(
      "INVALID_ORDER",
      "The Service Order line has an invalid quantity.",
    )
  }

  if (line.snapshot.serviceAuthorizationPolicy === "AFTER_REQUIRED_PAYMENT") {
    const amountPaidMinor = effectiveCommercialAmountPaid({
      amountPaidMinor: line.order.amountPaidMinor,
      paymentCount: line.order.payments.length,
      paymentStatus: line.order.paymentStatus,
      totalMinor: line.order.totalMinor,
    })
    if (amountPaidMinor < line.order.totalMinor) {
      throw new CatalogError(
        "SERVICE_WORK_NOT_AUTHORIZED",
        "The Order must be fully settled before this Service can be performed.",
      )
    }
  } else if (line.snapshot.serviceAuthorizationPolicy === "MANUAL_RELEASE") {
    const authorization = line.serviceAuthorization
    if (
      !authorization ||
      authorization.tenantId !== input.tenantId ||
      authorization.orderId !== line.order.id ||
      authorization.orderLineId !== line.id
    ) {
      throw new CatalogError(
        "SERVICE_WORK_NOT_AUTHORIZED",
        "A matching manager release is required before this Service can be performed.",
      )
    }
    let authorizedQuantity: string
    try {
      authorizedQuantity = parseExactDecimal(
        authorization.quantity.toString(),
        { allowZero: false, maxScale: 6 },
      )
    } catch {
      throw new CatalogError(
        "SERVICE_WORK_NOT_AUTHORIZED",
        "The stored Service release is invalid.",
      )
    }
    if (
      authorizedQuantity !== quantity ||
      Number.isNaN(authorization.authorizedAt.getTime())
    ) {
      throw new CatalogError(
        "SERVICE_WORK_NOT_AUTHORIZED",
        "The stored Service release does not match this Order line.",
      )
    }
  } else if (
    line.snapshot.serviceAuthorizationPolicy !== "ON_ORDER_CONFIRMATION"
  ) {
    throw new CatalogError(
      "SERVICE_WORK_NOT_AUTHORIZED",
      "This Service authorization policy requires a tracked work release.",
    )
  }

  const performedAt = now
  if (
    line.snapshot.serviceAuthorizationPolicy === "MANUAL_RELEASE" &&
    line.serviceAuthorization &&
    line.serviceAuthorization.authorizedAt.getTime() > performedAt.getTime()
  ) {
    throw new CatalogError(
      "SERVICE_WORK_NOT_AUTHORIZED",
      "The Service release must be effective before performance is recorded.",
    )
  }
  return { quantity, performedAt }
}
