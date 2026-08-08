import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import type { PrescriptionUsageEventType } from "../../generated/prisma/enums"

export type PrescriptionUsageAmounts = {
  deliveryCostMinor?: number | null
  metaCostMinor?: number | null
  paymentProviderFeeMinor?: number | null
  pharmacyRevenueMinor?: number | null
  platformChargeMinor?: number | null
  taxMinor?: number | null
}

export async function recordPrescriptionUsageEvent(
  db: PrismaClient,
  input: {
    amounts?: PrescriptionUsageAmounts
    deduplicationKey: string
    dimensions?: Record<string, string | number | boolean | null>
    eventType:
      | "delivery_completed"
      | "message_sent"
      | "order_created"
      | "payment_succeeded"
      | "pickup_completed"
      | "quote_issued"
      | "request_received"
    occurredAt?: Date
    sourceId: string
    sourceType: string
    storeId: string
    tenantId: string
  },
) {
  return db.prescriptionUsageEvent.upsert({
    create: {
      amounts: input.amounts as Prisma.InputJsonValue | undefined,
      deduplicationKey: input.deduplicationKey,
      dimensions: input.dimensions as Prisma.InputJsonValue | undefined,
      eventType: input.eventType.toUpperCase() as PrescriptionUsageEventType,
      occurredAt: input.occurredAt ?? new Date(),
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    update: {},
    where: {
      tenantId_deduplicationKey: {
        deduplicationKey: input.deduplicationKey,
        tenantId: input.tenantId,
      },
    },
  })
}

export function averageDurationMs(
  pairs: Array<{ endedAt: Date | null; startedAt: Date }>,
) {
  const durations = pairs
    .filter((pair): pair is { endedAt: Date; startedAt: Date } =>
      Boolean(pair.endedAt && pair.endedAt >= pair.startedAt),
    )
    .map((pair) => pair.endedAt.getTime() - pair.startedAt.getTime())
  return durations.length
    ? Math.round(
        durations.reduce((sum, value) => sum + value, 0) / durations.length,
      )
    : null
}

export function prescriptionReviewDurationPairs(
  requests: Array<{
    auditEvents: Array<{
      effectiveAt: Date
      type: string
    }>
    createdAt: Date
  }>,
) {
  return requests.map((request) => ({
    endedAt:
      request.auditEvents.find((event) => event.type === "PHARMACIST_REVIEWED")
        ?.effectiveAt ?? null,
    startedAt:
      request.auditEvents.find((event) => event.type === "RECEIVED")
        ?.effectiveAt ?? request.createdAt,
  }))
}

export async function getPrescriptionOperationsReport(
  db: PrismaClient,
  input: {
    from: Date
    storeId: string
    tenantId: string
    to: Date
  },
) {
  const scope = {
    createdAt: { gte: input.from, lt: input.to },
    storeId: input.storeId,
    tenantId: input.tenantId,
  }
  const [
    store,
    requests,
    quoteCount,
    paymentIntents,
    pickups,
    deliveries,
    usage,
  ] = await Promise.all([
    db.store.findFirstOrThrow({
      select: { currencyCode: true },
      where: { id: input.storeId, tenantId: input.tenantId },
    }),
    db.prescriptionRequest.findMany({
      select: {
        auditEvents: {
          orderBy: { effectiveAt: "asc" },
          select: { effectiveAt: true, type: true },
          where: { type: { in: ["RECEIVED", "PHARMACIST_REVIEWED"] } },
        },
        convertedAt: true,
        createdAt: true,
        source: true,
      },
      where: scope,
    }),
    db.commerceQuote.count({
      where: {
        createdAt: scope.createdAt,
        sourceType: "PRESCRIPTION_REQUEST",
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
    db.prescriptionPaymentIntent.findMany({
      select: { amountMinor: true, status: true },
      where: scope,
    }),
    db.prescriptionPickupFulfillment.count({
      where: {
        createdAt: scope.createdAt,
        storeId: input.storeId,
        tenantId: input.tenantId,
        status: "HANDED_OFF",
      },
    }),
    db.prescriptionDeliveryAssignment.count({
      where: {
        createdAt: scope.createdAt,
        storeId: input.storeId,
        tenantId: input.tenantId,
        status: "DELIVERED",
      },
    }),
    db.prescriptionUsageEvent.findMany({
      select: {
        amounts: true,
        eventType: true,
        sourceId: true,
        sourceType: true,
      },
      where: {
        occurredAt: { gte: input.from, lt: input.to },
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    }),
  ])
  const channelMix = Object.fromEntries(
    ["WEB", "WHATSAPP", "STAFF_WALK_IN", "STAFF_PHONE"].map((source) => [
      source.toLowerCase(),
      requests.filter((request) => request.source === source).length,
    ]),
  )
  const paid = paymentIntents.filter((intent) =>
    ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(intent.status),
  )
  return {
    channelMix,
    currencyCode: store.currencyCode,
    conversionRate:
      requests.length > 0
        ? requests.filter((request) => request.convertedAt).length /
          requests.length
        : 0,
    deliveryCompleted: deliveries,
    payment: {
      paidAmountMinor: paid.reduce(
        (sum, intent) => sum + intent.amountMinor,
        0,
      ),
      paidCount: paid.length,
      totalAttempts: paymentIntents.length,
    },
    pickupCompleted: pickups,
    quoteCount,
    requestCount: requests.length,
    reviewTimeMs: averageDurationMs(prescriptionReviewDurationPairs(requests)),
    usage,
  }
}

export async function reconcilePrescriptionUsageEvents(
  db: PrismaClient,
  input: { storeId: string; tenantId: string },
) {
  const events = await db.prescriptionUsageEvent.findMany({
    select: { eventType: true, sourceId: true, sourceType: true },
    where: { storeId: input.storeId, tenantId: input.tenantId },
  })
  const missingSources: Array<{ sourceId: string; sourceType: string }> = []
  for (const event of events) {
    const exists =
      event.sourceType === "request"
        ? await db.prescriptionRequest.count({ where: { id: event.sourceId } })
        : event.sourceType === "order"
          ? await db.commercialOrder.count({ where: { id: event.sourceId } })
          : event.sourceType === "payment"
            ? await db.prescriptionPaymentIntent.count({
                where: { id: event.sourceId },
              })
            : 1
    if (!exists) {
      missingSources.push({
        sourceId: event.sourceId,
        sourceType: event.sourceType,
      })
    }
  }
  return { checked: events.length, missingSources }
}
