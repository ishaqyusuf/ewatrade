import { describe, expect, test } from "bun:test"

import {
  SERVICE_COMMERCE_COST_KINDS,
  SERVICE_COMMERCE_REPORT_CHANNELS,
  SERVICE_COMMERCE_REPORT_DRILLDOWN_SECTIONS,
  SERVICE_COMMERCE_REPORT_PILOT_CONCURRENT_READS,
  SERVICE_COMMERCE_REPORT_PILOT_MAX_TARGET_MILLISECONDS,
  SERVICE_COMMERCE_REPORT_PILOT_P95_TARGET_MILLISECONDS,
  SERVICE_COMMERCE_REPORT_RATE_LIMIT_MAX_READS,
  SERVICE_COMMERCE_REPORT_RATE_LIMIT_WINDOW_MILLISECONDS,
  SERVICE_COMMERCE_REPORT_SOURCES,
  isServiceCommerceReportOccurrenceInWindow,
  serviceCommerceRedactedObservabilitySchema,
  serviceCommerceReportInputSchema,
  serviceCommerceReportOutputSchema,
  serviceCommerceUsageCostDimensionSchema,
  summarizeServiceCommerceCosts,
} from "."

describe("Service Commerce reporting contracts", () => {
  test("defines bounded pilot performance and actor-scoped read-rate thresholds", () => {
    expect(SERVICE_COMMERCE_REPORT_RATE_LIMIT_MAX_READS).toBe(30)
    expect(SERVICE_COMMERCE_REPORT_RATE_LIMIT_WINDOW_MILLISECONDS).toBe(60_000)
    expect(SERVICE_COMMERCE_REPORT_PILOT_CONCURRENT_READS).toBe(4)
    expect(SERVICE_COMMERCE_REPORT_PILOT_P95_TARGET_MILLISECONDS).toBe(15_000)
    expect(SERVICE_COMMERCE_REPORT_PILOT_MAX_TARGET_MILLISECONDS).toBe(30_000)
  })

  test("uses an explicit, bounded report scope and a half-open occurrence window", () => {
    const input = serviceCommerceReportInputSchema.parse({
      end: new Date("2026-09-01T00:00:00.000Z"),
      start: new Date("2026-08-01T00:00:00.000Z"),
      storeId: "store-1",
      tenantId: "tenant-1",
    })

    expect(
      isServiceCommerceReportOccurrenceInWindow(
        new Date("2026-08-01T00:00:00.000Z"),
        input,
      ),
    ).toBe(true)
    expect(
      isServiceCommerceReportOccurrenceInWindow(
        new Date("2026-08-31T23:59:59.999Z"),
        input,
      ),
    ).toBe(true)
    expect(
      isServiceCommerceReportOccurrenceInWindow(
        new Date("2026-09-01T00:00:00.000Z"),
        input,
      ),
    ).toBe(false)
    expect(
      serviceCommerceReportInputSchema.safeParse({
        end: new Date("2027-08-03T00:00:00.000Z"),
        start: new Date("2026-08-01T00:00:00.000Z"),
        tenantId: "tenant-1",
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceReportInputSchema.safeParse({
        end: new Date("2026-08-01T00:00:00.000Z"),
        start: new Date("2026-08-01T00:00:00.000Z"),
        tenantId: "tenant-1",
      }).success,
    ).toBe(false)
  })

  test("keeps unknown provider cost separate from a recorded zero", () => {
    expect(
      summarizeServiceCommerceCosts([
        {
          amountMinor: null,
          costKind: "meta_delivered_message",
          currencyCode: "NGN",
        },
        {
          amountMinor: 0,
          costKind: "meta_delivered_message",
          currencyCode: "NGN",
        },
      ]),
    ).toEqual([
      {
        costKind: "meta_delivered_message",
        currencyCode: "NGN",
        knownCount: 1,
        knownTotalMinor: 0,
        unknownCount: 1,
      },
    ])
    expect(
      summarizeServiceCommerceCosts([
        {
          amountMinor: null,
          costKind: "delivery",
          currencyCode: null,
        },
      ]),
    ).toEqual([
      {
        costKind: "delivery",
        currencyCode: null,
        knownCount: 0,
        knownTotalMinor: null,
        unknownCount: 1,
      },
    ])
  })

  test("uses strict, allowlisted reporting and cost vocabulary", () => {
    expect(SERVICE_COMMERCE_REPORT_DRILLDOWN_SECTIONS).toEqual([
      "lifecycle",
      "catalog",
      "reliability",
      "media",
      "costs",
    ])
    expect(SERVICE_COMMERCE_REPORT_SOURCES).toEqual([
      "service",
      "prescription",
      "commerce_inquiry",
    ])
    expect(SERVICE_COMMERCE_REPORT_CHANNELS).toEqual([
      "web",
      "staff",
      "whatsapp",
    ])
    expect(SERVICE_COMMERCE_COST_KINDS).toEqual([
      "meta_delivered_message",
      "bsp_or_twilio_markup",
      "number",
      "payment_provider_fee",
      "delivery",
      "tax",
      "revenue",
      "ewatrade_subscription",
      "ewatrade_usage",
    ])
    expect(
      serviceCommerceReportInputSchema.safeParse({
        end: new Date("2026-09-01T00:00:00.000Z"),
        start: new Date("2026-08-01T00:00:00.000Z"),
        tenantId: "tenant-1",
        unrestricted: true,
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceReportInputSchema.safeParse({
        drilldown: "raw_provider_events",
        end: new Date("2026-09-01T00:00:00.000Z"),
        start: new Date("2026-08-01T00:00:00.000Z"),
        tenantId: "tenant-1",
      }).success,
    ).toBe(false)
  })

  test("accepts aggregate-only redacted output and rejects private fields", () => {
    expect(
      serviceCommerceUsageCostDimensionSchema.parse({
        billingOwner: "tenant",
        connectionId: "connection_1",
        costs: [],
        messageCategory: "utility",
        recipientMarket: "NG",
      }),
    ).toMatchObject({ connectionId: "connection_1", recipientMarket: "NG" })
    expect(
      serviceCommerceUsageCostDimensionSchema.safeParse({
        billingOwner: "tenant",
        connectionId: "connection_1",
        costs: [],
        messageCategory: "utility",
        providerOperationId: "meta-operation",
        recipientMarket: "NG",
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceRedactedObservabilitySchema.parse({
        count: 3,
        kind: "provider_attempt",
        outcome: "retryable",
      }),
    ).toEqual({
      count: 3,
      kind: "provider_attempt",
      outcome: "retryable",
    })
    expect(
      serviceCommerceRedactedObservabilitySchema.safeParse({
        count: 1,
        kind: "routing",
        outcome: "failed",
        providerOperationId: "provider-operation-1",
      }).success,
    ).toBe(false)
    expect(
      serviceCommerceReportOutputSchema.safeParse({
        catalog: {
          demandResolved: 0,
          draftsCreated: 0,
          existingOfferingsMatched: 0,
          managedInventoryGraduations: 0,
          procureToOrderCommitments: 0,
          quoteOverrides: 0,
          quoteOverrideUnknown: 0,
          resolutionUnknown: 0,
          reusablePricePromotions: 0,
        },
        costs: [],
        lifecycle: {
          bookingsCompleted: 0,
          bookingsConfirmed: 0,
          byChannel: [],
          bySource: [],
          deliveriesCompleted: 0,
          paymentsSucceeded: 0,
          paymentValueMinor: 0,
          pickupsCompleted: 0,
          quotesAccepted: 0,
          quotesIssued: 0,
          requestsReceived: 0,
          serviceCompletions: 0,
        },
        media: {
          attachmentsActive: 0,
          attachmentsQuarantined: 0,
          attachmentsRejected: 0,
          attachmentsRetryable: 0,
          attachmentsSafe: 0,
          observationsConverted: 0,
          observationsCurrent: 0,
        },
        observability: [
          {
            count: 1,
            kind: "routing",
            outcome: "failed",
            rawCustomerMessage: "where is my booking?",
          },
        ],
        mayBeTruncated: false,
        reliability: {
          jobRecoveries: 0,
          jobRecoveryAttempts: 0,
          providerAttempts: 0,
          providerFailures: 0,
          providerRetries: 0,
          staleCapabilityRejections: 0,
        },
        scope: {
          end: new Date("2026-09-01T00:00:00.000Z"),
          start: new Date("2026-08-01T00:00:00.000Z"),
          storeId: null,
          tenantId: "tenant-1",
        },
        currencyCode: "NGN",
        storeBreakdown: [],
        storeConversations: {
          availability: {
            coverageBlockObservations: 0,
            paused: 0,
            policyBlockObservations: 0,
            providerBlockObservations: 0,
            resumed: 0,
            scheduleUpdates: 0,
            scheduledClosureObservations: null,
          },
          channels: {
            bridgeConfirmed: 0,
            bridgeInitiated: 0,
            desiredBothCurrent: 0,
            desiredChatCurrent: 0,
            desiredWhatsAppCurrent: 0,
            directContinued: 0,
            directStartedNew: 0,
            mobileMessages: 0,
            modeChanges: 0,
            providerHistoryUnknown: null,
            webMessages: 0,
            whatsAppMessages: 0,
          },
          costVisibility: { knownObservations: 0, unknownObservations: 0 },
          lifecycle: {
            archived: 0,
            conversationsStarted: 0,
            currentSnapshot: { active: 0, archived: 0, restricted: 0 },
            customerMessages: 0,
            firstResponse: {
              averageSeconds: null,
              knownCount: 0,
              unknownCount: 0,
            },
            reactivated: 0,
            requestKinds: { prescription: 0, product: 0, service: 0 },
            storeReplies: 0,
            unreadWait: {
              averageSeconds: null,
              knownCount: 0,
              unknownCount: 0,
            },
          },
          notifications: {
            cancelled: 0,
            cancelledByRead: 0,
            coalesced: 0,
            delivered: 0,
            failed: 0,
            scheduled: 0,
            sent: 0,
            suppressed: 0,
            unavailable: 0,
          },
          providerReliability: {
            attempts: 0,
            failed: 0,
            outcomeUnknown: 0,
            retries: 0,
            sent: 0,
          },
          team: {
            claimed: 0,
            escalationsOpened: 0,
            escalationsResolved: 0,
            handedOff: 0,
            overdueCurrent: 0,
            reassigned: 0,
            released: 0,
            unclaimedCurrent: 0,
          },
        },
        timezone: "Africa/Lagos",
        usageCostsByDimension: [],
      }).success,
    ).toBe(false)
  })
})
