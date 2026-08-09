import { createHash } from "node:crypto"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  HostedPaymentStatus,
  PaymentProviderEventOutcome,
  PrescriptionRefundProviderDispatchState,
  PrescriptionRefundStatus,
} from "../../generated/prisma/enums"
import { resolveCommerceQuoteAccess } from "./commerce-quotes"
import { recordCommercialOrderPaymentInTransaction } from "./commercial-payments"

export class PrescriptionPaymentError extends Error {
  constructor(
    readonly code:
      | "AMOUNT_MISMATCH"
      | "EVENT_CONFLICT"
      | "PAYMENT_CONFLICT"
      | "PAYMENT_NOT_FOUND"
      | "REFUND_CONFLICT",
    message: string,
  ) {
    super(message)
  }
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function stableHash(value: unknown) {
  return digest(JSON.stringify(value))
}

export async function preparePrescriptionHostedCheckout(
  db: PrismaClient,
  input: {
    acceptanceToken: string
    clientPaymentId: string
    provider: string
    statusToken: string
  },
) {
  return db.$transaction(async (tx) => {
    const access = await resolveCommerceQuoteAccess(tx, input)
    const version = await tx.commerceQuoteVersion.findFirst({
      include: { quote: true },
      where: {
        acceptedOrderId: { not: null },
        id: access.versionId,
        ...(access.storeId && access.tenantId
          ? {
              quote: {
                is: {
                  storeId: access.storeId,
                  tenantId: access.tenantId,
                },
              },
            }
          : {}),
        status: "ACCEPTED",
      },
    })
    if (!version?.acceptedOrderId) {
      throw new PrescriptionPaymentError(
        "PAYMENT_CONFLICT",
        "Select fulfilment before starting payment.",
      )
    }
    const order = await tx.commercialOrder.findFirst({
      where: {
        id: version.acceptedOrderId,
        storeId: version.quote.storeId,
        tenantId: version.quote.tenantId,
      },
    })
    if (!order || !order.customerEmail) {
      throw new PrescriptionPaymentError(
        "PAYMENT_CONFLICT",
        "A customer email is required for hosted checkout.",
      )
    }
    if (order.paymentStatus === "PAID") {
      throw new PrescriptionPaymentError(
        "PAYMENT_CONFLICT",
        "This order is already paid.",
      )
    }
    const existing = await tx.prescriptionPaymentIntent.findUnique({
      where: {
        tenantId_clientPaymentId: {
          clientPaymentId: input.clientPaymentId,
          tenantId: order.tenantId,
        },
      },
    })
    const providerReference = `rxpay_${input.clientPaymentId.replaceAll("-", "")}`
    if (existing) {
      if (
        existing.orderId !== order.id ||
        existing.amountMinor !== order.totalMinor ||
        existing.provider !== input.provider ||
        existing.statusTokenDigest !== digest(input.statusToken)
      ) {
        throw new PrescriptionPaymentError(
          "PAYMENT_CONFLICT",
          "This payment identity was already used with different details.",
        )
      }
      return {
        amountMinor: existing.amountMinor,
        currencyCode: existing.currencyCode,
        customerEmail: order.customerEmail,
        intentId: existing.id,
        providerReference: existing.providerReference,
        replay: true,
        statusToken: input.statusToken,
      }
    }
    const intent = await tx.prescriptionPaymentIntent.create({
      data: {
        amountMinor: order.totalMinor,
        clientPaymentId: input.clientPaymentId,
        currencyCode: order.currencyCode,
        orderId: order.id,
        provider: input.provider,
        providerReference,
        statusTokenDigest: digest(input.statusToken),
        storeId: order.storeId,
        tenantId: order.tenantId,
      },
    })
    return {
      amountMinor: intent.amountMinor,
      currencyCode: intent.currencyCode,
      customerEmail: order.customerEmail,
      intentId: intent.id,
      providerReference,
      replay: false,
      statusToken: input.statusToken,
    }
  })
}

export async function attachPrescriptionHostedCheckout(
  db: PrismaClient,
  input: {
    checkoutUrl: string
    expiresAt?: Date
    intentId: string
    providerReference: string
  },
) {
  return db.prescriptionPaymentIntent.update({
    data: {
      checkoutUrl: input.checkoutUrl,
      expiresAt: input.expiresAt,
      status: HostedPaymentStatus.PENDING,
    },
    where: {
      id: input.intentId,
      providerReference: input.providerReference,
      status: {
        in: [HostedPaymentStatus.CREATED, HostedPaymentStatus.PENDING],
      },
    },
  })
}

export async function getPublicPrescriptionPaymentStatus(
  db: PrismaClient,
  input: { statusToken: string },
) {
  const intent = await db.prescriptionPaymentIntent.findUnique({
    include: { order: { select: { amountPaidMinor: true, totalMinor: true } } },
    where: { statusTokenDigest: digest(input.statusToken) },
  })
  if (!intent) {
    throw new PrescriptionPaymentError(
      "PAYMENT_NOT_FOUND",
      "Payment status is unavailable.",
    )
  }
  return {
    amountPaidMinor: intent.order.amountPaidMinor,
    balanceDueMinor: Math.max(
      0,
      intent.order.totalMinor - intent.order.amountPaidMinor,
    ),
    currencyCode: intent.currencyCode,
    status: intent.status.toLowerCase(),
    totalMinor: intent.order.totalMinor,
  }
}

export async function processPrescriptionPaymentProviderEvent(
  db: PrismaClient,
  input: {
    amountMinor: number
    currencyCode: string
    eventId: string
    provider: string
    providerReference: string
    status: "failed" | "paid" | "refund_failed" | "refund_succeeded"
  },
) {
  const payloadHash = stableHash(input)
  return db.$transaction(async (tx) => {
    const existing = await tx.prescriptionPaymentProviderEvent.findUnique({
      where: { providerEventId: input.eventId },
    })
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new PrescriptionPaymentError(
          "EVENT_CONFLICT",
          "A provider event identity was reused with different details.",
        )
      }
      return { replay: true }
    }
    const intent = await tx.prescriptionPaymentIntent.findUnique({
      where: { providerReference: input.providerReference },
    })
    if (!intent) {
      await tx.prescriptionPaymentProviderEvent.create({
        data: {
          eventType: input.status,
          outcome: PaymentProviderEventOutcome.REJECTED,
          payloadHash,
          provider: input.provider,
          providerEventId: input.eventId,
          processedAt: new Date(),
        },
      })
      throw new PrescriptionPaymentError(
        "PAYMENT_NOT_FOUND",
        "Payment intent was not found.",
      )
    }
    const event = await tx.prescriptionPaymentProviderEvent.create({
      data: {
        eventType: input.status,
        payloadHash,
        paymentIntentId: intent.id,
        provider: input.provider,
        providerEventId: input.eventId,
      },
    })
    let communicationIntentId: string | null = null
    if (
      input.amountMinor !== intent.amountMinor ||
      input.currencyCode.toUpperCase() !== intent.currencyCode.toUpperCase()
    ) {
      await tx.prescriptionPaymentProviderEvent.update({
        data: {
          outcome: PaymentProviderEventOutcome.REJECTED,
          processedAt: new Date(),
        },
        where: { id: event.id },
      })
      throw new PrescriptionPaymentError(
        "AMOUNT_MISMATCH",
        "Payment amount or currency does not match the order.",
      )
    }
    if (input.status === "paid") {
      if (
        intent.status !== HostedPaymentStatus.PAID &&
        intent.status !== HostedPaymentStatus.PARTIALLY_REFUNDED &&
        intent.status !== HostedPaymentStatus.REFUNDED
      ) {
        await recordCommercialOrderPaymentInTransaction(tx, {
          actorUserId: "payment-provider",
          amountMinor: intent.amountMinor,
          clientPaymentId: `provider:${input.eventId}`,
          method: "card",
          orderId: intent.orderId,
          reference: intent.providerReference,
          tenantId: intent.tenantId,
        })
        await tx.prescriptionPaymentIntent.update({
          data: { paidAt: new Date(), status: HostedPaymentStatus.PAID },
          where: { id: intent.id },
        })
        await tx.prescriptionUsageEvent.upsert({
          create: {
            amounts: {
              paymentProviderFeeMinor: null,
              pharmacyRevenueMinor: intent.amountMinor,
              platformChargeMinor: null,
            },
            deduplicationKey: `payment-succeeded:${intent.id}`,
            eventType: "PAYMENT_SUCCEEDED",
            occurredAt: new Date(),
            sourceId: intent.id,
            sourceType: "payment",
            storeId: intent.storeId,
            tenantId: intent.tenantId,
          },
          update: {},
          where: {
            tenantId_deduplicationKey: {
              deduplicationKey: `payment-succeeded:${intent.id}`,
              tenantId: intent.tenantId,
            },
          },
        })
        const order = await tx.commercialOrder.findUnique({
          select: { customerPhone: true },
          where: { id: intent.orderId },
        })
        if (order?.customerPhone) {
          const communication = await tx.prescriptionCommunicationIntent.upsert(
            {
              create: {
                deduplicationKey: `payment-receipt:${intent.id}`,
                orderId: intent.orderId,
                payload: {},
                recipientReference: order.customerPhone,
                storeId: intent.storeId,
                tenantId: intent.tenantId,
                type: "PAYMENT_RECEIPT",
              },
              update: {},
              where: {
                tenantId_deduplicationKey: {
                  deduplicationKey: `payment-receipt:${intent.id}`,
                  tenantId: intent.tenantId,
                },
              },
            },
          )
          communicationIntentId = communication.id
        }
      }
    } else if (
      input.status === "failed" &&
      (intent.status === HostedPaymentStatus.CREATED ||
        intent.status === HostedPaymentStatus.PENDING)
    ) {
      await tx.prescriptionPaymentIntent.update({
        data: { failedAt: new Date(), status: HostedPaymentStatus.FAILED },
        where: { id: intent.id },
      })
    } else if (input.status.startsWith("refund_")) {
      const refund = await tx.prescriptionPaymentRefund.findFirst({
        where: {
          amountMinor: input.amountMinor,
          paymentIntentId: intent.id,
          status: PrescriptionRefundStatus.PENDING,
        },
      })
      if (refund) {
        const succeeded = input.status === "refund_succeeded"
        if (succeeded) {
          await recordCommercialOrderPaymentInTransaction(tx, {
            actorUserId: refund.requestedByUserId,
            amountMinor: refund.amountMinor,
            clientPaymentId: `provider:${input.eventId}`,
            method: "card",
            orderId: intent.orderId,
            reference: intent.providerReference,
            tenantId: intent.tenantId,
            type: "refund",
          })
        }
        await tx.prescriptionPaymentRefund.update({
          data: {
            completedAt: new Date(),
            status: succeeded
              ? PrescriptionRefundStatus.SUCCEEDED
              : PrescriptionRefundStatus.FAILED,
          },
          where: { id: refund.id },
        })
        if (succeeded) {
          const refunded = await tx.prescriptionPaymentRefund.aggregate({
            _sum: { amountMinor: true },
            where: {
              paymentIntentId: intent.id,
              status: PrescriptionRefundStatus.SUCCEEDED,
            },
          })
          await tx.prescriptionPaymentIntent.update({
            data: {
              status:
                (refunded._sum.amountMinor ?? 0) >= intent.amountMinor
                  ? HostedPaymentStatus.REFUNDED
                  : HostedPaymentStatus.PARTIALLY_REFUNDED,
            },
            where: { id: intent.id },
          })
        }
      }
    }
    await tx.prescriptionPaymentProviderEvent.update({
      data: {
        outcome: PaymentProviderEventOutcome.PROCESSED,
        processedAt: new Date(),
      },
      where: { id: event.id },
    })
    return { communicationIntentId, replay: false }
  })
}

export async function createPrescriptionRefund(
  db: PrismaClient,
  input: {
    actorUserId: string
    amountMinor: number
    clientRefundId: string
    orderId: string
    reason: string
    storeId: string
    tenantId: string
  },
) {
  if (!input.reason.trim() || input.amountMinor <= 0) {
    throw new PrescriptionPaymentError(
      "REFUND_CONFLICT",
      "A positive refund amount and reason are required.",
    )
  }
  return db.$transaction(async (tx) => {
    const previous = await tx.prescriptionPaymentRefund.findUnique({
      include: { paymentIntent: true },
      where: {
        tenantId_clientRefundId: {
          clientRefundId: input.clientRefundId,
          tenantId: input.tenantId,
        },
      },
    })
    if (previous) {
      if (
        previous.amountMinor !== input.amountMinor ||
        previous.reason !== input.reason.trim() ||
        previous.storeId !== input.storeId ||
        previous.paymentIntent.orderId !== input.orderId
      ) {
        throw new PrescriptionPaymentError(
          "REFUND_CONFLICT",
          "This refund identity was already used with different details.",
        )
      }
      return { refund: previous, replay: true }
    }
    const intent = await tx.prescriptionPaymentIntent.findFirst({
      where: {
        orderId: input.orderId,
        status: {
          in: [
            HostedPaymentStatus.PAID,
            HostedPaymentStatus.PARTIALLY_REFUNDED,
          ],
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!intent) {
      throw new PrescriptionPaymentError(
        "REFUND_CONFLICT",
        "The payment is not eligible for this refund.",
      )
    }
    await tx.$queryRaw`
      SELECT "id"
      FROM "PrescriptionPaymentIntent"
      WHERE "id" = ${intent.id}
        AND "tenantId" = ${input.tenantId}
        AND "storeId" = ${input.storeId}
      FOR UPDATE
    `
    const reserved = await tx.prescriptionPaymentRefund.aggregate({
      _sum: { amountMinor: true },
      where: {
        paymentIntentId: intent.id,
        status: {
          in: [
            PrescriptionRefundStatus.PENDING,
            PrescriptionRefundStatus.SUCCEEDED,
          ],
        },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (
      (reserved._sum.amountMinor ?? 0) + input.amountMinor >
      intent.amountMinor
    ) {
      throw new PrescriptionPaymentError(
        "REFUND_CONFLICT",
        "The refund exceeds the remaining refundable balance.",
      )
    }
    const refund = await tx.prescriptionPaymentRefund.create({
      data: {
        amountMinor: input.amountMinor,
        clientRefundId: input.clientRefundId,
        paymentIntentId: intent.id,
        reason: input.reason.trim(),
        requestedByUserId: input.actorUserId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      include: { paymentIntent: true },
    })
    return { refund, replay: false }
  })
}

export async function claimPrescriptionRefundProviderDispatch(
  db: PrismaClient,
  input: { refundId: string; storeId: string; tenantId: string },
) {
  return db.$transaction(async (tx) => {
    const identity = await tx.prescriptionPaymentRefund.findFirst({
      select: { id: true },
      where: {
        id: input.refundId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!identity) {
      throw new PrescriptionPaymentError(
        "PAYMENT_NOT_FOUND",
        "Refund was not found.",
      )
    }
    await tx.$queryRaw`
      SELECT "id"
      FROM "PrescriptionPaymentRefund"
      WHERE "id" = ${identity.id}
        AND "tenantId" = ${input.tenantId}
        AND "storeId" = ${input.storeId}
      FOR UPDATE
    `
    const refund = await tx.prescriptionPaymentRefund.findUnique({
      include: { paymentIntent: true },
      where: { id: identity.id },
    })
    if (!refund) {
      throw new PrescriptionPaymentError(
        "PAYMENT_NOT_FOUND",
        "Refund was not found.",
      )
    }
    if (
      refund.providerDispatchState ===
      PrescriptionRefundProviderDispatchState.CONFIRMED
    ) {
      return { action: "complete" as const, refund }
    }
    if (
      refund.providerDispatchState ===
      PrescriptionRefundProviderDispatchState.OUTCOME_UNKNOWN
    ) {
      return { action: "reconcile" as const, refund }
    }
    if (
      refund.providerDispatchState ===
      PrescriptionRefundProviderDispatchState.NEEDS_REVIEW
    ) {
      return { action: "review" as const, refund }
    }
    const claimed = await tx.prescriptionPaymentRefund.update({
      data: {
        providerDispatchCount: { increment: 1 },
        providerDispatchClaimedAt: new Date(),
        providerDispatchState:
          PrescriptionRefundProviderDispatchState.OUTCOME_UNKNOWN,
      },
      include: { paymentIntent: true },
      where: {
        id: refund.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    return { action: "dispatch" as const, refund: claimed }
  })
}

const REFUND_PROVIDER_CONSISTENCY_WINDOW_MS = 24 * 60 * 60_000

export async function resolvePrescriptionRefundReconciliationMiss(
  db: PrismaClient,
  input: {
    now?: Date
    refundId: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const identity = await tx.prescriptionPaymentRefund.findFirst({
      select: { id: true },
      where: {
        id: input.refundId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!identity) {
      throw new PrescriptionPaymentError(
        "PAYMENT_NOT_FOUND",
        "Refund was not found.",
      )
    }
    await tx.$queryRaw`
      SELECT "id"
      FROM "PrescriptionPaymentRefund"
      WHERE "id" = ${identity.id}
        AND "tenantId" = ${input.tenantId}
        AND "storeId" = ${input.storeId}
      FOR UPDATE
    `
    const refund = await tx.prescriptionPaymentRefund.findUnique({
      include: { paymentIntent: true },
      where: { id: identity.id },
    })
    if (
      !refund ||
      refund.providerDispatchState !==
        PrescriptionRefundProviderDispatchState.OUTCOME_UNKNOWN ||
      !refund.providerDispatchClaimedAt
    ) {
      return refund
    }
    const now = input.now ?? new Date()
    if (
      now.getTime() - refund.providerDispatchClaimedAt.getTime() <
      REFUND_PROVIDER_CONSISTENCY_WINDOW_MS
    ) {
      return refund
    }
    return tx.prescriptionPaymentRefund.update({
      data: {
        providerDispatchClaimedAt: null,
        providerDispatchState:
          refund.providerDispatchCount < 2
            ? PrescriptionRefundProviderDispatchState.READY
            : PrescriptionRefundProviderDispatchState.NEEDS_REVIEW,
      },
      include: { paymentIntent: true },
      where: {
        id: refund.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
  })
}

export async function attachPrescriptionRefundProviderResult(
  db: PrismaClient,
  input: {
    providerRefundId: string
    refundId: string
    storeId: string
    status: "pending" | "succeeded"
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const refund = await tx.prescriptionPaymentRefund.findFirst({
      include: { paymentIntent: true },
      where: {
        id: input.refundId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!refund) {
      throw new PrescriptionPaymentError(
        "PAYMENT_NOT_FOUND",
        "Refund was not found.",
      )
    }
    if (
      refund.providerRefundId &&
      refund.providerRefundId !== input.providerRefundId
    ) {
      throw new PrescriptionPaymentError(
        "REFUND_CONFLICT",
        "This refund is already attached to another provider result.",
      )
    }
    if (input.status === "succeeded") {
      await recordCommercialOrderPaymentInTransaction(tx, {
        actorUserId: refund.requestedByUserId,
        amountMinor: refund.amountMinor,
        clientPaymentId: `provider-refund:${refund.id}`,
        method: "card",
        orderId: refund.paymentIntent.orderId,
        reference: input.providerRefundId,
        tenantId: input.tenantId,
        type: "refund",
      })
    }
    const updated = await tx.prescriptionPaymentRefund.update({
      data: {
        completedAt: input.status === "succeeded" ? new Date() : undefined,
        providerDispatchState:
          PrescriptionRefundProviderDispatchState.CONFIRMED,
        providerRefundId: input.providerRefundId,
        status:
          input.status === "succeeded"
            ? PrescriptionRefundStatus.SUCCEEDED
            : PrescriptionRefundStatus.PENDING,
      },
      where: {
        id: refund.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (input.status === "succeeded") {
      const refunded = await tx.prescriptionPaymentRefund.aggregate({
        _sum: { amountMinor: true },
        where: {
          paymentIntentId: refund.paymentIntentId,
          status: PrescriptionRefundStatus.SUCCEEDED,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
      await tx.prescriptionPaymentIntent.update({
        data: {
          status:
            (refunded._sum.amountMinor ?? 0) >= refund.paymentIntent.amountMinor
              ? HostedPaymentStatus.REFUNDED
              : HostedPaymentStatus.PARTIALLY_REFUNDED,
        },
        where: {
          id: refund.paymentIntentId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
    }
    return updated
  })
}
