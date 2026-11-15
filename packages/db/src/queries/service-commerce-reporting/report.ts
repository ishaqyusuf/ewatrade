import {
  SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT,
  type ServiceCommerceCostObservation,
  type ServiceCommerceReportInput,
  type ServiceCommerceReportOutput,
  serviceCommerceReportInputSchema,
  serviceCommerceReportOutputSchema,
  summarizeServiceCommerceCosts as summarizeContractCosts,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../../generated/prisma/client"

import { countByUtcDay } from "../report-days"
import { authorizeServiceCommerceReportRead } from "./audit"
import { readServiceCommerceReportRows } from "./report-rows"
import { getStoreConversationReportAggregates } from "./store-conversations"
import { prescriptionUsageAmountsToServiceCommerce } from "./usage"

const channelNames = {
  STAFF: "staff",
  STAFF_PHONE: "staff",
  STAFF_WALK_IN: "staff",
  WEB: "web",
  WHATSAPP: "whatsapp",
} as const

function countBy<T extends string>(values: T[], allowlist: readonly T[]) {
  return allowlist.map((value) => ({
    count: values.filter((candidate) => candidate === value).length,
    value,
  }))
}

function costObservations(
  usage: Array<{
    bspCostMinor?: number | null
    deliveryCostMinor?: number | null
    metaCostMinor?: number | null
    numberCostMinor?: number | null
    paymentProviderFeeMinor?: number | null
    platformChargeMinor?: number | null
    subscriptionChargeMinor?: number | null
    revenueMinor?: number | null
    taxMinor?: number | null
    currencyCode?: string | null
    eventType: string
  }>,
): ServiceCommerceCostObservation[] {
  const mapping = [
    ["meta_delivered_message", "metaCostMinor", ["MESSAGE_DELIVERED"]],
    ["bsp_or_twilio_markup", "bspCostMinor", ["MESSAGE_DELIVERED"]],
    ["number", "numberCostMinor", ["NUMBER_FEE_RECONCILED"]],
    [
      "payment_provider_fee",
      "paymentProviderFeeMinor",
      ["PAYMENT_SUCCEEDED", "PAYMENT_RECONCILED"],
    ],
    [
      "delivery",
      "deliveryCostMinor",
      ["DELIVERY_COMPLETED", "DELIVERY_RECONCILED"],
    ],
    ["tax", "taxMinor", ["ORDER_CREATED", "TAX_RECONCILED"]],
    [
      "revenue",
      "revenueMinor",
      ["ORDER_CREATED", "PAYMENT_SUCCEEDED", "PAYMENT_RECONCILED"],
    ],
    [
      "ewatrade_subscription",
      "subscriptionChargeMinor",
      ["SUBSCRIPTION_CHARGE_RECONCILED"],
    ],
    [
      "ewatrade_usage",
      "platformChargeMinor",
      [
        "DELIVERY_COMPLETED",
        "DELIVERY_RECONCILED",
        "MESSAGE_SENT",
        "MESSAGE_DELIVERED",
        "MESSAGE_READ",
        "MESSAGE_FAILED",
        "ORDER_CREATED",
        "PAYMENT_SUCCEEDED",
        "PAYMENT_RECONCILED",
        "PICKUP_COMPLETED",
        "QUOTE_ISSUED",
        "REQUEST_RECEIVED",
        "PLATFORM_CHARGE_RECONCILED",
      ],
    ],
  ] as const
  return usage.flatMap((event) =>
    mapping.flatMap(([costKind, key, applicableEventTypes]) =>
      applicableEventTypes.includes(event.eventType as never)
        ? [
            {
              amountMinor: event[key] ?? null,
              costKind,
              currencyCode: event.currencyCode ?? null,
            },
          ]
        : [],
    ),
  )
}

type UsageEvent = Parameters<typeof costObservations>[0][number] & {
  billingOwnerSnapshot?: string | null
  connectionId?: string | null
  messageCategory?: string | null
  recipientMarket?: string | null
}

function summarizeUsageCostsByDimension(usage: UsageEvent[]) {
  const groups = new Map<string, { event: UsageEvent; usage: UsageEvent[] }>()
  for (const event of usage) {
    const key = [
      event.connectionId ?? "",
      event.recipientMarket ?? "",
      event.messageCategory ?? "",
      event.billingOwnerSnapshot ?? "",
    ].join("\u0000")
    const group = groups.get(key) ?? { event, usage: [] }
    group.usage.push(event)
    groups.set(key, group)
  }
  return [...groups.values()]
    .map(({ event, usage }) => ({
      billingOwner: event.billingOwnerSnapshot ?? null,
      connectionId: event.connectionId ?? null,
      costs: summarizeContractCosts(costObservations(usage)),
      messageCategory: event.messageCategory ?? null,
      recipientMarket: event.recipientMarket ?? null,
    }))
    .sort((left, right) =>
      [
        left.connectionId ?? "",
        left.recipientMarket ?? "",
        left.messageCategory ?? "",
        left.billingOwner ?? "",
      ]
        .join("\u0000")
        .localeCompare(
          [
            right.connectionId ?? "",
            right.recipientMarket ?? "",
            right.messageCategory ?? "",
            right.billingOwner ?? "",
          ].join("\u0000"),
        ),
    )
}

export async function getServiceCommerceReport(
  db: PrismaClient,
  rawInput: ServiceCommerceReportInput & { actorUserId: string },
): Promise<ServiceCommerceReportOutput> {
  const { actorUserId, ...reportInput } = rawInput
  const parsedInput = serviceCommerceReportInputSchema.parse(reportInput)
  const access = await authorizeServiceCommerceReportRead(db, {
    actorUserId,
    end: parsedInput.end,
    kind: "report",
    start: parsedInput.start,
    storeId: parsedInput.storeId,
    tenantId: parsedInput.tenantId,
  })
  const input = { ...parsedInput, storeId: access.storeId }
  // Two statements: every report source in one bounded JSON read, and the
  // store-conversation aggregates (was 28 + 1 separate reads).
  const [rows, storeConversationAggregates] = await Promise.all([
    readServiceCommerceReportRows(db, input),
    getStoreConversationReportAggregates(db, input),
  ])
  const {
    tenant,
    stores,
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
    quoteOverrideLines,
    graduationEvents,
    mediaEvents,
    attachments,
    observations,
    notificationAttempts,
    notificationReceipts,
    legacyNotificationAttempts,
    actionRecoveries,
    usage,
    prescriptionUsage,
    profileAuditEvents,
    connectionAuditEvents,
    routingAlerts,
  } = rows

  if (input.storeId && !stores.some((store) => store.id === input.storeId)) {
    throw new Error("REPORT_STORE_NOT_FOUND")
  }

  const channels = [
    ...serviceRequests.map(
      (request) => channelNames[request.channelOrigin] ?? "staff",
    ),
    ...prescriptionReceived.map(
      (event) => channelNames[event.request.source] ?? "staff",
    ),
    ...inquiries.map((inquiry) => channelNames[inquiry.channelOrigin]),
  ] as Array<"staff" | "web" | "whatsapp">
  const sources = [
    ...serviceRequests.map(() => "service" as const),
    ...prescriptionReceived.map(() => "prescription" as const),
    ...inquiries.map(() => "commerce_inquiry" as const),
  ]
  const genericUsage = usage.map((event) => ({ ...event }))
  const legacyUsage = prescriptionUsage.map((event) => ({
    ...prescriptionUsageAmountsToServiceCommerce(event),
    currencyCode: tenant.currencyCode,
  }))
  const costs = summarizeContractCosts(
    costObservations([...genericUsage, ...legacyUsage]),
  )
  const retries = notificationAttempts.filter(
    (attempt) => attempt.attemptNumber > 1,
  ).length
  const recovered = notificationAttempts.filter(
    (attempt) => attempt.attemptNumber > 1 && attempt.status === "SENT",
  ).length
  const providerSuccesses =
    notificationAttempts.filter((attempt) => attempt.status === "SENT").length +
    notificationReceipts.filter((receipt) =>
      ["DELIVERED", "READ"].includes(receipt.status),
    ).length +
    legacyNotificationAttempts.filter((attempt) =>
      ["SENT", "DELIVERED"].includes(attempt.status),
    ).length
  const providerFailures =
    notificationAttempts.filter((attempt) => attempt.status === "FAILED")
      .length +
    legacyNotificationAttempts.filter((attempt) => attempt.status === "FAILED")
      .length
  const mayBeTruncated = [
    stores,
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
    quoteOverrideLines,
    graduationEvents,
    mediaEvents,
    attachments,
    observations,
    notificationAttempts,
    notificationReceipts,
    legacyNotificationAttempts,
    actionRecoveries,
    usage,
    prescriptionUsage,
    profileAuditEvents,
    connectionAuditEvents,
    routingAlerts,
  ].some((rows) => rows.length === SERVICE_COMMERCE_REPORT_QUERY_ROW_LIMIT)

  return serviceCommerceReportOutputSchema.parse({
    catalog: {
      demandResolved: sourceLinks.filter(
        (link) => link.resolutionCapturedAt !== null,
      ).length,
      draftsCreated: sourceLinks.filter(
        (link) =>
          link.resolutionCapturedAt !== null && link.createdAsPrivateDraft,
      ).length,
      existingOfferingsMatched: sourceLinks.filter(
        (link) =>
          link.resolutionCapturedAt !== null &&
          link.createdAsPrivateDraft === false,
      ).length,
      managedInventoryGraduations: graduationEvents.length,
      procureToOrderCommitments: attestations.filter(
        (attestation) => attestation.type === "MANUAL_PROCURE_TO_ORDER",
      ).length,
      quoteOverrides: quoteOverrideLines.filter(
        (line) =>
          line.catalogPriceEvaluationAt !== null &&
          line.catalogPriceOverride === true,
      ).length,
      quoteOverrideUnknown: quoteOverrideLines.filter(
        (line) => line.catalogPriceEvaluationAt === null,
      ).length,
      resolutionUnknown: sourceLinks.filter(
        (link) => link.resolutionCapturedAt === null,
      ).length,
      reusablePricePromotions: pricePromotions.length,
    },
    costs,
    currencyCode: tenant.currencyCode,
    daily: countByUtcDay(
      { from: input.start, to: input.end },
      {
        paymentsSucceeded: payments
          .filter((payment) => payment.type === "PAYMENT")
          .map((payment) => ({ at: payment.recordedAt })),
        paymentValueMinor: payments
          .filter((payment) => payment.type === "PAYMENT")
          .map((payment) => ({
            amountMinor: payment.amountMinor,
            at: payment.recordedAt,
          })),
        quotesAccepted: quoteVersions.map((version) => ({
          at: version.acceptedAt,
        })),
        quotesIssued: quoteVersions.map((version) => ({
          at: version.issuedAt,
        })),
        requests: [
          ...serviceRequests.map((request) => ({ at: request.requestedAt })),
          ...prescriptionReceived.map((event) => ({ at: event.effectiveAt })),
          ...inquiries.map((inquiry) => ({ at: inquiry.createdAt })),
        ],
      },
      // Business days, so "Today" matches the Overview.
      tenant.timezone ?? "UTC",
    ),
    lifecycle: {
      bookingsCompleted: bookings.filter(
        (booking) =>
          booking.completedAt &&
          booking.completedAt >= input.start &&
          booking.completedAt < input.end,
      ).length,
      bookingsConfirmed: bookings.filter(
        (booking) =>
          booking.confirmedAt &&
          booking.confirmedAt >= input.start &&
          booking.confirmedAt < input.end,
      ).length,
      byChannel: countBy(channels, ["web", "staff", "whatsapp"]).map(
        ({ count, value }) => ({ channel: value, count }),
      ),
      bySource: countBy(sources, [
        "service",
        "prescription",
        "commerce_inquiry",
      ]).map(({ count, value }) => ({ count, source: value })),
      deliveriesCompleted: deliveryEvents.length,
      paymentsSucceeded: payments.filter(
        (payment) => payment.type === "PAYMENT",
      ).length,
      paymentValueMinor: payments.reduce(
        (total, payment) =>
          payment.type === "PAYMENT" ? total + payment.amountMinor : total,
        0,
      ),
      pickupsCompleted: pickupEvents.length,
      quotesAccepted: quoteVersions.filter(
        (version) =>
          version.acceptedAt &&
          version.acceptedAt >= input.start &&
          version.acceptedAt < input.end,
      ).length,
      quotesIssued: quoteVersions.filter(
        (version) =>
          version.issuedAt &&
          version.issuedAt >= input.start &&
          version.issuedAt < input.end,
      ).length,
      requestsReceived: sources.length,
      serviceCompletions: serviceEvents.length,
    },
    media: {
      attachmentsActive: attachments.filter(
        (attachment) => attachment.lifecycle === "ACTIVE",
      ).length,
      attachmentsQuarantined: mediaEvents.filter(
        (event) => event.lifecycle === "QUARANTINED",
      ).length,
      attachmentsRejected: mediaEvents.filter(
        (event) => event.lifecycle === "REJECTED",
      ).length,
      attachmentsRetryable: mediaEvents.filter(
        (event) => event.lifecycle === "RETRYABLE",
      ).length,
      attachmentsSafe: mediaEvents.filter((event) => event.lifecycle === "SAFE")
        .length,
      observationsConverted: sourceLinks.filter(
        (link) => link.verifiedObservationId,
      ).length,
      observationsCurrent: observations.filter(
        (observation) => observation.lifecycle === "CURRENT",
      ).length,
    },
    observability: [
      {
        count: providerSuccesses,
        kind: "provider_attempt",
        outcome: "available",
      },
      {
        count: providerFailures,
        kind: "provider_attempt",
        outcome: "failed",
      },
      {
        count: retries,
        kind: "provider_attempt",
        outcome: "retryable",
      },
      {
        count: recovered,
        kind: "job_recovery",
        outcome: "recovered",
      },
      {
        count:
          profileAuditEvents.filter((event) => event.type === "ACTIVATED")
            .length +
          connectionAuditEvents.filter(
            (event) => event.type === "readiness_passed",
          ).length,
        kind: "readiness",
        outcome: "available",
      },
      {
        count:
          profileAuditEvents.filter(
            (event) =>
              event.type === "DEACTIVATED" || event.type === "SUSPENDED",
          ).length +
          connectionAuditEvents.filter(
            (event) => event.type === "readiness_failed",
          ).length,
        kind: "readiness",
        outcome: "blocked",
      },
      {
        count: routingAlerts.filter(
          (alert) =>
            alert.createdAt >= input.start && alert.createdAt < input.end,
        ).length,
        kind: "routing",
        outcome: "failed",
      },
      {
        count: routingAlerts.filter(
          (alert) =>
            alert.resolvedAt &&
            alert.resolvedAt >= input.start &&
            alert.resolvedAt < input.end,
        ).length,
        kind: "routing",
        outcome: "recovered",
      },
    ],
    mayBeTruncated,
    reliability: {
      jobRecoveries: recovered,
      jobRecoveryAttempts: retries,
      providerAttempts:
        notificationAttempts.length + legacyNotificationAttempts.length,
      providerFailures,
      providerRetries: retries,
      staleCapabilityRejections: actionRecoveries.length,
    },
    scope: {
      end: input.end,
      start: input.start,
      storeId: input.storeId ?? null,
      tenantId: input.tenantId,
    },
    storeBreakdown: stores.map((store) => ({
      completions:
        bookings.filter(
          (booking) =>
            booking.storeId === store.id &&
            booking.completedAt &&
            booking.completedAt >= input.start &&
            booking.completedAt < input.end,
        ).length +
        serviceEvents.filter((event) => event.serviceJob.storeId === store.id)
          .length +
        pickupEvents.filter((event) => event.fulfillment.storeId === store.id)
          .length +
        deliveryEvents.filter((event) => event.assignment.storeId === store.id)
          .length,
      name: store.name,
      paymentsSucceeded: payments.filter(
        (payment) => payment.storeId === store.id && payment.type === "PAYMENT",
      ).length,
      quotesIssued: quoteVersions.filter(
        (version) =>
          version.quote.storeId === store.id &&
          version.issuedAt &&
          version.issuedAt >= input.start &&
          version.issuedAt < input.end,
      ).length,
      requestsReceived:
        serviceRequests.filter((request) => request.storeId === store.id)
          .length +
        prescriptionReceived.filter((event) => event.storeId === store.id)
          .length +
        inquiries.filter((inquiry) => inquiry.storeId === store.id).length,
      storeId: store.id,
    })),
    storeConversations: {
      ...storeConversationAggregates,
      costVisibility: {
        knownObservations: costs.reduce(
          (total, cost) => total + cost.knownCount,
          0,
        ),
        unknownObservations: costs.reduce(
          (total, cost) => total + cost.unknownCount,
          0,
        ),
      },
    },
    timezone: tenant.timezone ?? "UTC",
    usageCostsByDimension: summarizeUsageCostsByDimension(genericUsage),
  })
}
