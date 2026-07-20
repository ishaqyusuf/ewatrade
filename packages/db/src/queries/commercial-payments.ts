import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CommercialPaymentMethod,
  CommercialPaymentType,
  PaymentStatus,
  ServiceWorkEventType,
  WorkAuthorizationPolicy,
  WorkAuthorizationStatus,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"

export type CommercialPaymentMethodValue =
  | "bank_transfer"
  | "card"
  | "cash"
  | "other"
  | "pos"

function paymentMethod(value: CommercialPaymentMethodValue) {
  if (value === "bank_transfer") return CommercialPaymentMethod.BANK_TRANSFER
  if (value === "card") return CommercialPaymentMethod.CARD
  if (value === "pos") return CommercialPaymentMethod.POS
  if (value === "other") return CommercialPaymentMethod.OTHER
  return CommercialPaymentMethod.CASH
}

export function summarizeCommercialPayment(input: {
  amountPaidMinor: number
  totalMinor: number
}) {
  const amountPaidMinor = Math.max(0, input.amountPaidMinor)
  const balanceDueMinor = Math.max(0, input.totalMinor - amountPaidMinor)
  return {
    amountPaidMinor,
    balanceDueMinor,
    paymentStatus:
      amountPaidMinor >= input.totalMinor
        ? ("paid" as const)
        : amountPaidMinor > 0
          ? ("partially_paid" as const)
          : ("pending" as const),
  }
}

function assertPaymentAmount(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 100_000_000) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Payment amount must be a positive minor-unit amount.",
    )
  }
}

function serializePaymentStatus(status: PaymentStatus) {
  if (status === PaymentStatus.PARTIALLY_PAID) return "partially_paid" as const
  if (status === PaymentStatus.PAID) return "paid" as const
  if (status === PaymentStatus.REFUNDED) return "refunded" as const
  if (status === PaymentStatus.AUTHORIZED) return "authorized" as const
  if (status === PaymentStatus.FAILED) return "failed" as const
  return "pending" as const
}

export function effectiveCommercialAmountPaid(input: {
  amountPaidMinor: number
  paymentCount?: number
  paymentStatus: PaymentStatus
  totalMinor: number
}) {
  if (
    input.amountPaidMinor === 0 &&
    input.paymentStatus === PaymentStatus.PAID &&
    (input.paymentCount ?? 0) === 0
  ) {
    return input.totalMinor
  }
  return input.amountPaidMinor
}

export async function recordCommercialOrderPaymentInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string
    amountMinor: number
    clientPaymentId: string
    method: CommercialPaymentMethodValue
    note?: string
    orderId: string
    reference?: string
    tenantId: string
    type?: "payment" | "refund"
  },
) {
  assertPaymentAmount(input.amountMinor)
  const expectedMethod = paymentMethod(input.method)
  const expectedNote = input.note?.trim() || null
  const expectedReference = input.reference?.trim() || null
  const expectedType =
    input.type === "refund"
      ? CommercialPaymentType.REFUND
      : CommercialPaymentType.PAYMENT

  async function serializePrevious(
    previous: NonNullable<
      Awaited<ReturnType<typeof tx.commercialOrderPayment.findUnique>>
    >,
  ) {
    if (
      previous.orderId !== input.orderId ||
      previous.amountMinor !== input.amountMinor ||
      previous.method !== expectedMethod ||
      previous.reference !== expectedReference ||
      previous.note !== expectedNote ||
      previous.type !== expectedType
    ) {
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This payment identity was already used with different details.",
      )
    }
    const order = await tx.commercialOrder.findUniqueOrThrow({
      include: { payments: { select: { id: true } } },
      where: { id: previous.orderId },
    })
    const amountPaidMinor = effectiveCommercialAmountPaid({
      amountPaidMinor: order.amountPaidMinor,
      paymentCount: order.payments.length,
      paymentStatus: order.paymentStatus,
      totalMinor: order.totalMinor,
    })
    return {
      amountPaidMinor,
      balanceDueMinor: Math.max(0, order.totalMinor - amountPaidMinor),
      id: previous.id,
      paymentStatus: serializePaymentStatus(order.paymentStatus),
    }
  }

  const previous = await tx.commercialOrderPayment.findUnique({
    where: {
      tenantId_clientPaymentId: {
        clientPaymentId: input.clientPaymentId,
        tenantId: input.tenantId,
      },
    },
  })
  if (previous) {
    return serializePrevious(previous)
  }

  const lockedOrder = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "CommercialOrder"
    WHERE "id" = ${input.orderId}
      AND "tenantId" = ${input.tenantId}
    FOR UPDATE
  `
  if (lockedOrder.length === 0) {
    throw new CatalogError("ORDER_NOT_FOUND", "Order not found.")
  }
  const concurrentPrevious = await tx.commercialOrderPayment.findUnique({
    where: {
      tenantId_clientPaymentId: {
        clientPaymentId: input.clientPaymentId,
        tenantId: input.tenantId,
      },
    },
  })
  if (concurrentPrevious) {
    return serializePrevious(concurrentPrevious)
  }

  const order = await tx.commercialOrder.findFirst({
    include: { payments: { select: { id: true } } },
    where: { id: input.orderId, tenantId: input.tenantId },
  })
  if (!order) throw new CatalogError("ORDER_NOT_FOUND", "Order not found.")
  const currentPaid = effectiveCommercialAmountPaid({
    amountPaidMinor: order.amountPaidMinor,
    paymentCount: order.payments.length,
    paymentStatus: order.paymentStatus,
    totalMinor: order.totalMinor,
  })
  const isRefund = input.type === "refund"
  const nextPaid = isRefund
    ? currentPaid - input.amountMinor
    : currentPaid + input.amountMinor
  if (nextPaid < 0) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Refund cannot exceed the amount collected.",
    )
  }
  if (nextPaid > order.totalMinor) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Payment cannot exceed the outstanding balance.",
    )
  }
  const summary = summarizeCommercialPayment({
    amountPaidMinor: nextPaid,
    totalMinor: order.totalMinor,
  })
  const nextStatus =
    isRefund && nextPaid === 0
      ? PaymentStatus.REFUNDED
      : summary.paymentStatus === "paid"
        ? PaymentStatus.PAID
        : summary.paymentStatus === "partially_paid"
          ? PaymentStatus.PARTIALLY_PAID
          : PaymentStatus.PENDING

  const payment = await tx.commercialOrderPayment.create({
    data: {
      amountMinor: input.amountMinor,
      clientPaymentId: input.clientPaymentId,
      method: expectedMethod,
      note: expectedNote,
      orderId: order.id,
      recordedByUserId: input.actorUserId,
      reference: expectedReference,
      storeId: order.storeId,
      tenantId: input.tenantId,
      type: expectedType,
    },
  })
  await tx.commercialOrder.update({
    data: {
      amountPaidMinor: nextPaid,
      paymentStatus: nextStatus,
    },
    where: { id: order.id },
  })

  if (nextStatus === PaymentStatus.PAID) {
    const awaitingPayment = await tx.serviceJobLine.findMany({
      include: { serviceJob: true },
      where: {
        authorizationPolicy: WorkAuthorizationPolicy.AFTER_REQUIRED_PAYMENT,
        authorizationStatus: WorkAuthorizationStatus.PENDING_PAYMENT,
        commercialOrderLine: { orderId: order.id },
      },
    })
    for (const line of awaitingPayment) {
      await tx.serviceJobLine.update({
        data: {
          authorizationSource: "payment",
          authorizationStatus: WorkAuthorizationStatus.AUTHORIZED,
          authorizedAt: new Date(),
          revision: { increment: 1 },
        },
        where: { id: line.id },
      })
      await tx.serviceWorkEvent.create({
        data: {
          actorUserId: input.actorUserId,
          reason: "Commercial Order payment completed",
          serviceJobId: line.serviceJobId,
          serviceJobLineId: line.id,
          source: "commercial_payment",
          tenantId: input.tenantId,
          type: ServiceWorkEventType.AUTHORIZED,
        },
      })
      await tx.serviceJob.update({
        data: { revision: { increment: 1 } },
        where: { id: line.serviceJob.id },
      })
    }
  }

  return {
    amountPaidMinor: nextPaid,
    balanceDueMinor: summary.balanceDueMinor,
    id: payment.id,
    paymentStatus: serializePaymentStatus(nextStatus),
  }
}

export async function recordCommercialOrderPayment(
  db: PrismaClient,
  input: Parameters<typeof recordCommercialOrderPaymentInTransaction>[1],
) {
  return db.$transaction((tx) =>
    recordCommercialOrderPaymentInTransaction(tx, input),
  )
}
