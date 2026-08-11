import {
  SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
  type ServiceCommerceReportDrilldownSection,
  serviceCommerceReportDrilldownOutputSchema,
  serviceCommerceReportInputSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../../generated/prisma/client"

import { authorizeServiceCommerceReportRead } from "./audit"

type DrilldownInput = {
  actorUserId: string
  category: ServiceCommerceReportDrilldownSection
  end: Date
  start: Date
  storeId?: string
  tenantId: string
}

type Bucket = {
  billingOwner: string | null
  category: string
  connectionId: string | null
  count: number
  date: string
  messageCategory: string | null
  outcome: string
  recipientMarket: string | null
}

function dateBucket(value: Date) {
  return value.toISOString().slice(0, 10)
}

function isInWindow(value: Date | null, occurrence: { gte: Date; lt: Date }) {
  return Boolean(value && value >= occurrence.gte && value < occurrence.lt)
}

function aggregateBuckets(
  rows: Array<{
    billingOwner?: string | null
    category: string
    connectionId?: string | null
    messageCategory?: string | null
    occurredAt: Date
    outcome: string
    recipientMarket?: string | null
  }>,
) {
  const buckets = new Map<string, Bucket>()
  for (const row of rows) {
    const date = dateBucket(row.occurredAt)
    const key = [
      date,
      row.category,
      row.outcome,
      row.connectionId ?? "",
      row.recipientMarket ?? "",
      row.messageCategory ?? "",
      row.billingOwner ?? "",
    ].join("\u0000")
    const existing = buckets.get(key)
    if (existing) existing.count += 1
    else
      buckets.set(key, {
        category: row.category,
        billingOwner: row.billingOwner ?? null,
        connectionId: row.connectionId ?? null,
        count: 1,
        date,
        messageCategory: row.messageCategory ?? null,
        outcome: row.outcome,
        recipientMarket: row.recipientMarket ?? null,
      })
  }
  return [...buckets.values()].sort((left, right) =>
    left.date === right.date
      ? left.category.localeCompare(right.category)
      : left.date.localeCompare(right.date),
  )
}

export async function getServiceCommerceReportDrilldown(
  db: PrismaClient,
  rawInput: DrilldownInput,
) {
  const input = serviceCommerceReportInputSchema.parse({
    drilldown: rawInput.category,
    end: rawInput.end,
    start: rawInput.start,
    storeId: rawInput.storeId,
    tenantId: rawInput.tenantId,
  })
  const access = await authorizeServiceCommerceReportRead(db, {
    actorUserId: rawInput.actorUserId,
    category: rawInput.category,
    end: input.end,
    kind: "drilldown",
    start: input.start,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })

  const scope = {
    ...(access.storeId ? { storeId: access.storeId } : {}),
    tenantId: input.tenantId,
  }
  const occurrence = { gte: input.start, lt: input.end }
  const wantsLifecycle = input.drilldown === "lifecycle"
  const wantsCatalog = input.drilldown === "catalog"
  const wantsUsage =
    input.drilldown === "costs" || input.drilldown === "reliability"
  const [
    mediaEvents,
    usageEvents,
    legacyNotificationAttempts,
    serviceRequests,
    prescriptionReceived,
    inquiries,
    quoteVersions,
    payments,
    bookings,
    pickupEvents,
    deliveryEvents,
    serviceEvents,
    sourceLinks,
    attestations,
    pricePromotions,
    quoteOverrides,
    graduationEvents,
  ] = await Promise.all([
    input.drilldown === "media"
      ? db.serviceCommerceMediaAuditEvent.findMany({
          select: { effectiveAt: true, lifecycle: true, type: true },
          where: { ...scope, effectiveAt: occurrence },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsUsage
      ? db.serviceCommerceUsageEvent.findMany({
          select: {
            billingOwnerSnapshot: true,
            connectionId: true,
            eventType: true,
            messageCategory: true,
            occurredAt: true,
            providerKey: true,
            recipientMarket: true,
          },
          where: { ...scope, occurredAt: occurrence },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    input.drilldown === "reliability"
      ? db.serviceDeliveryAttempt.findMany({
          select: { attemptedAt: true, completedAt: true, status: true },
          where: {
            notificationIntent: { is: scope },
            OR: [
              { completedAt: occurrence },
              { attemptedAt: occurrence, completedAt: null },
            ],
          },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsLifecycle
      ? db.serviceRequest.findMany({
          select: { channelOrigin: true, requestedAt: true },
          where: { ...scope, requestedAt: occurrence },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsLifecycle
      ? db.prescriptionRequestAuditEvent.findMany({
          select: {
            effectiveAt: true,
            request: { select: { source: true } },
          },
          where: { ...scope, effectiveAt: occurrence, type: "RECEIVED" },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsLifecycle
      ? db.commerceInquiry.findMany({
          select: { channelOrigin: true, createdAt: true },
          where: { ...scope, createdAt: occurrence },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsLifecycle
      ? db.commerceQuoteVersion.findMany({
          select: { acceptedAt: true, declinedAt: true, issuedAt: true },
          where: {
            OR: [
              { acceptedAt: occurrence },
              { declinedAt: occurrence },
              { issuedAt: occurrence },
            ],
            quote: { is: scope },
          },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsLifecycle
      ? db.commercialOrderPayment.findMany({
          select: { recordedAt: true, type: true },
          where: { ...scope, recordedAt: occurrence },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsLifecycle
      ? db.serviceBooking.findMany({
          select: { completedAt: true, confirmedAt: true },
          where: {
            ...scope,
            OR: [{ completedAt: occurrence }, { confirmedAt: occurrence }],
          },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsLifecycle
      ? db.prescriptionPickupEvent.findMany({
          select: { effectiveAt: true },
          where: {
            effectiveAt: occurrence,
            fulfillment: { is: scope },
            type: "HANDED_OFF",
          },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsLifecycle
      ? db.prescriptionDeliveryEvent.findMany({
          select: { effectiveAt: true },
          where: {
            assignment: { is: scope },
            effectiveAt: occurrence,
            type: "DELIVERED",
          },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsLifecycle
      ? db.serviceWorkEvent.findMany({
          select: { effectiveAt: true },
          where: {
            effectiveAt: occurrence,
            serviceJob: input.storeId
              ? { is: { storeId: input.storeId } }
              : undefined,
            tenantId: input.tenantId,
            toStatus: "COMPLETED",
          },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsCatalog
      ? db.catalogSourceLineLink.findMany({
          select: {
            createdAsPrivateDraft: true,
            createdAt: true,
            resolutionCapturedAt: true,
            sourceType: true,
            verifiedObservationId: true,
          },
          where: {
            ...scope,
            OR: [
              { resolutionCapturedAt: occurrence },
              { createdAt: occurrence, resolutionCapturedAt: null },
            ],
          },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsCatalog
      ? db.catalogAvailabilityAttestation.findMany({
          select: { createdAt: true, type: true },
          where: { ...scope, createdAt: occurrence },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsCatalog
      ? db.catalogPricePromotion.findMany({
          select: {
            createdAt: true,
            previousPriceMinor: true,
            priceMinor: true,
          },
          where: { ...scope, createdAt: occurrence },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsCatalog
      ? db.commerceQuoteLine.findMany({
          select: {
            catalogPriceEvaluationAt: true,
            catalogPriceOverride: true,
            quoteVersion: { select: { issuedAt: true } },
          },
          where: {
            OR: [
              { catalogPriceEvaluationAt: occurrence },
              {
                catalogPriceEvaluationAt: null,
                quoteVersion: { issuedAt: occurrence },
              },
            ],
            quoteVersion: { quote: { is: scope } },
          },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
    wantsCatalog
      ? db.serviceCommerceStoreAuditEvent.findMany({
          select: { effectiveAt: true },
          where: {
            ...scope,
            effectiveAt: occurrence,
            type: "CATALOG_GRADUATED",
          },
          take: SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
        })
      : Promise.resolve([]),
  ])

  const rows: Array<{
    billingOwner?: string | null
    category: string
    connectionId?: string | null
    messageCategory?: string | null
    occurredAt: Date
    outcome: string
    recipientMarket?: string | null
  }> = []
  if (input.drilldown === "media") {
    rows.push(
      ...mediaEvents.map((event) => ({
        category: event.type.toLowerCase(),
        occurredAt: event.effectiveAt,
        outcome: (event.lifecycle ?? "recorded").toLowerCase(),
      })),
    )
  }
  if (input.drilldown === "costs" || input.drilldown === "reliability") {
    rows.push(
      ...usageEvents.map((event) => ({
        billingOwner: event.billingOwnerSnapshot,
        category: event.eventType.toLowerCase(),
        connectionId: event.connectionId,
        messageCategory: event.messageCategory,
        occurredAt: event.occurredAt,
        outcome: event.providerKey ? "provider_recorded" : "recorded",
        recipientMarket: event.recipientMarket,
      })),
    )
  }
  if (input.drilldown === "reliability") {
    for (const attempt of legacyNotificationAttempts) {
      rows.push({
        category: "provider_attempt",
        occurredAt: attempt.completedAt ?? attempt.attemptedAt,
        outcome: attempt.status.toLowerCase(),
      })
    }
  }
  if (input.drilldown === "lifecycle") {
    for (const request of serviceRequests) {
      if (!request.requestedAt) continue
      rows.push({
        category: "request_received",
        occurredAt: request.requestedAt,
        outcome: request.channelOrigin.toLowerCase(),
      })
    }
    rows.push(
      ...prescriptionReceived.map((event) => ({
        category: "request_received",
        occurredAt: event.effectiveAt,
        outcome: event.request.source.toLowerCase(),
      })),
      ...inquiries.map((inquiry) => ({
        category: "request_received",
        occurredAt: inquiry.createdAt,
        outcome: inquiry.channelOrigin.toLowerCase(),
      })),
    )
    for (const version of quoteVersions) {
      if (isInWindow(version.issuedAt, occurrence)) {
        rows.push({
          category: "quote",
          occurredAt: version.issuedAt as Date,
          outcome: "issued",
        })
      }
      if (isInWindow(version.acceptedAt, occurrence)) {
        rows.push({
          category: "quote",
          occurredAt: version.acceptedAt as Date,
          outcome: "accepted",
        })
      }
      if (isInWindow(version.declinedAt, occurrence)) {
        rows.push({
          category: "quote",
          occurredAt: version.declinedAt as Date,
          outcome: "declined",
        })
      }
    }
    rows.push(
      ...payments
        .filter((payment) => payment.type === "PAYMENT")
        .map((payment) => ({
          category: "payment",
          occurredAt: payment.recordedAt,
          outcome: "succeeded",
        })),
      ...pickupEvents.map((event) => ({
        category: "pickup",
        occurredAt: event.effectiveAt,
        outcome: "completed",
      })),
      ...deliveryEvents.map((event) => ({
        category: "delivery",
        occurredAt: event.effectiveAt,
        outcome: "completed",
      })),
      ...serviceEvents.map((event) => ({
        category: "service",
        occurredAt: event.effectiveAt,
        outcome: "completed",
      })),
    )
    for (const booking of bookings) {
      if (isInWindow(booking.confirmedAt, occurrence)) {
        rows.push({
          category: "booking",
          occurredAt: booking.confirmedAt as Date,
          outcome: "confirmed",
        })
      }
      if (isInWindow(booking.completedAt, occurrence)) {
        rows.push({
          category: "booking",
          occurredAt: booking.completedAt as Date,
          outcome: "completed",
        })
      }
    }
  }
  if (input.drilldown === "catalog") {
    rows.push(
      ...sourceLinks.map((link) => ({
        category: "catalog_resolution",
        occurredAt: link.resolutionCapturedAt ?? link.createdAt,
        outcome:
          link.resolutionCapturedAt === null
            ? "resolution_unknown"
            : link.createdAsPrivateDraft === true
              ? "draft_created"
              : "existing_offering_matched",
      })),
      ...attestations.map((attestation) => ({
        category: "availability_attestation",
        occurredAt: attestation.createdAt,
        outcome: attestation.type.toLowerCase(),
      })),
      ...pricePromotions.map((promotion) => ({
        category: "price_promotion",
        occurredAt: promotion.createdAt,
        outcome: "reusable_price_promotion",
      })),
      ...quoteOverrides.map((line) => ({
        category: "quote_price",
        occurredAt:
          line.catalogPriceEvaluationAt ?? (line.quoteVersion.issuedAt as Date),
        outcome:
          line.catalogPriceEvaluationAt === null
            ? "quote_override_unknown"
            : line.catalogPriceOverride === true
              ? "quote_override"
              : "no_quote_override",
      })),
      ...graduationEvents.map((event) => ({
        category: "catalog",
        occurredAt: event.effectiveAt,
        outcome: "graduated",
      })),
    )
  }

  const mayBeTruncated = [
    mediaEvents,
    usageEvents,
    legacyNotificationAttempts,
    serviceRequests,
    prescriptionReceived,
    inquiries,
    quoteVersions,
    payments,
    bookings,
    pickupEvents,
    deliveryEvents,
    serviceEvents,
    sourceLinks,
    attestations,
    pricePromotions,
    quoteOverrides,
    graduationEvents,
  ].some((result) => result.length === SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT)

  return serviceCommerceReportDrilldownOutputSchema.parse({
    category: input.drilldown,
    mayBeTruncated,
    rows: aggregateBuckets(rows),
    scope: {
      end: input.end,
      start: input.start,
      storeId: input.storeId ?? null,
    },
  })
}
