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

const costApplicability = {
  deliveryCostMinor: ["DELIVERY_COMPLETED"],
  metaCostMinor: ["MESSAGE_SENT"],
  paymentProviderFeeMinor: ["PAYMENT_SUCCEEDED"],
  pharmacyRevenueMinor: ["ORDER_CREATED"],
  platformChargeMinor: [
    "DELIVERY_COMPLETED",
    "MESSAGE_SENT",
    "ORDER_CREATED",
    "PAYMENT_SUCCEEDED",
    "PICKUP_COMPLETED",
    "QUOTE_ISSUED",
    "REQUEST_RECEIVED",
  ],
  taxMinor: ["ORDER_CREATED"],
} satisfies Record<keyof PrescriptionUsageAmounts, string[]>

export function summarizePrescriptionUsageAmounts(
  usage: Array<{ amounts: unknown; eventType: string }>,
) {
  return Object.fromEntries(
    Object.entries(costApplicability).map(([key, eventTypes]) => {
      let amountMinor = 0
      let observedCount = 0
      let unknownCount = 0
      for (const event of usage) {
        if (!eventTypes.includes(event.eventType)) continue
        const amounts =
          event.amounts &&
          typeof event.amounts === "object" &&
          !Array.isArray(event.amounts)
            ? (event.amounts as Record<string, unknown>)
            : {}
        const value = amounts[key]
        if (typeof value === "number" && Number.isSafeInteger(value)) {
          amountMinor += value
          observedCount += 1
        } else {
          unknownCount += 1
        }
      }
      return [
        key,
        {
          amountMinor: observedCount > 0 ? amountMinor : null,
          observedCount,
          unknownCount,
        },
      ]
    }),
  ) as Record<
    keyof PrescriptionUsageAmounts,
    { amountMinor: number | null; observedCount: number; unknownCount: number }
  >
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

export function prescriptionReportStoreScope(input: {
  storeId?: string | null
  tenantId: string
}) {
  return {
    ...(input.storeId ? { storeId: input.storeId } : {}),
    tenantId: input.tenantId,
  }
}

export function isInPrescriptionReportWindow(
  value: Date | null | undefined,
  input: { from: Date; to: Date },
) {
  return Boolean(value && value >= input.from && value < input.to)
}

export async function getPrescriptionOperationsReport(
  db: PrismaClient,
  input: {
    from: Date
    storeId?: string | null
    tenantId: string
    to: Date
  },
) {
  const reportScope = prescriptionReportStoreScope(input)
  const storeScope = input.storeId ? { storeId: input.storeId } : {}
  const scope = {
    createdAt: { gte: input.from, lt: input.to },
    ...reportScope,
  }
  const [
    tenant,
    stores,
    requests,
    quotes,
    paymentIntents,
    pickups,
    deliveries,
    usage,
  ] = await Promise.all([
    db.tenant.findFirstOrThrow({
      select: { currencyCode: true },
      where: { id: input.tenantId },
    }),
    db.store.findMany({
      select: { id: true, name: true },
      where: { id: input.storeId ?? undefined, tenantId: input.tenantId },
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
        storeId: true,
      },
      where: scope,
    }),
    db.commerceQuote.findMany({
      select: {
        currentVersion: {
          select: {
            acceptedAt: true,
            availabilityOutcome: true,
            declinedAt: true,
            issuedAt: true,
            status: true,
          },
        },
      },
      where: {
        currentVersion: {
          is: {
            OR: [
              { acceptedAt: scope.createdAt },
              { declinedAt: scope.createdAt },
              { issuedAt: scope.createdAt },
            ],
          },
        },
        sourceType: "PRESCRIPTION_REQUEST",
        ...storeScope,
        tenantId: input.tenantId,
      },
    }),
    db.prescriptionPaymentIntent.findMany({
      select: {
        amountMinor: true,
        createdAt: true,
        paidAt: true,
        status: true,
      },
      where: {
        OR: [{ createdAt: scope.createdAt }, { paidAt: scope.createdAt }],
        ...reportScope,
      },
    }),
    db.prescriptionPickupFulfillment.count({
      where: {
        handedOffAt: scope.createdAt,
        ...storeScope,
        tenantId: input.tenantId,
        status: "HANDED_OFF",
      },
    }),
    db.prescriptionDeliveryAssignment.count({
      where: {
        deliveredAt: scope.createdAt,
        ...storeScope,
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
        ...storeScope,
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
  const paid = paymentIntents.filter(
    (intent) =>
      ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(intent.status) &&
      isInPrescriptionReportWindow(intent.paidAt, input),
  )
  const issuedQuotes = quotes.filter((quote) =>
    isInPrescriptionReportWindow(quote.currentVersion?.issuedAt, input),
  )
  return {
    channelMix,
    costs: summarizePrescriptionUsageAmounts(usage),
    currencyCode: tenant.currencyCode,
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
      totalAttempts: paymentIntents.filter((intent) =>
        isInPrescriptionReportWindow(intent.createdAt, input),
      ).length,
    },
    pickupCompleted: pickups,
    quoteCount: issuedQuotes.length,
    quoteOutcomes: {
      accepted: quotes.filter(
        (quote) =>
          quote.currentVersion?.status === "ACCEPTED" &&
          isInPrescriptionReportWindow(quote.currentVersion.acceptedAt, input),
      ).length,
      declined: quotes.filter(
        (quote) =>
          quote.currentVersion?.status === "DECLINED" &&
          isInPrescriptionReportWindow(quote.currentVersion.declinedAt, input),
      ).length,
      full: issuedQuotes.filter(
        (quote) => quote.currentVersion?.availabilityOutcome === "FULL",
      ).length,
      partial: issuedQuotes.filter(
        (quote) => quote.currentVersion?.availabilityOutcome === "PARTIAL",
      ).length,
      unavailable: issuedQuotes.filter(
        (quote) => quote.currentVersion?.availabilityOutcome === "UNAVAILABLE",
      ).length,
    },
    requestCount: requests.length,
    reviewTimeMs: averageDurationMs(prescriptionReviewDurationPairs(requests)),
    scope: input.storeId ? "store" : "tenant",
    storeBreakdown: stores.map((store) => ({
      name: store.name,
      requestCount: requests.filter((request) => request.storeId === store.id)
        .length,
      storeId: store.id,
    })),
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
    const sourceScope = {
      storeId: input.storeId,
      tenantId: input.tenantId,
    }
    const exists =
      event.sourceType === "request"
        ? await db.prescriptionRequest.count({
            where: { id: event.sourceId, ...sourceScope },
          })
        : event.sourceType === "order"
          ? await db.commercialOrder.count({
              where: { id: event.sourceId, ...sourceScope },
            })
          : event.sourceType === "payment"
            ? await db.prescriptionPaymentIntent.count({
                where: { id: event.sourceId, ...sourceScope },
              })
            : event.sourceType === "quote"
              ? await db.commerceQuoteVersion.count({
                  where: {
                    id: event.sourceId,
                    quote: { is: sourceScope },
                  },
                })
              : event.sourceType === "communication_attempt"
                ? await db.prescriptionCommunicationAttempt.count({
                    where: {
                      id: event.sourceId,
                      intent: { is: sourceScope },
                    },
                  })
                : 0
    if (!exists) {
      missingSources.push({
        sourceId: event.sourceId,
        sourceType: event.sourceType,
      })
    }
  }
  return { checked: events.length, missingSources }
}
