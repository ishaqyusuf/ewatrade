import { describe, expect, test } from "bun:test"
import type { ServiceCommerceReportOutput } from "@ewatrade/service-commerce"

import { metricTone, sectionTone } from "@/components/reports/report-metrics"
import {
  buildReportSections,
  buildServiceCommerceReportCsv,
  countRequestDays,
  lifecycleFunnel,
} from "./report-sections"

function report(
  overrides: Partial<ServiceCommerceReportOutput> = {},
): ServiceCommerceReportOutput {
  return {
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
    currencyCode: "NGN",
    daily: [],
    lifecycle: {
      bookingsCompleted: 0,
      bookingsConfirmed: 0,
      byChannel: [
        { channel: "web", count: 3 },
        { channel: "staff", count: 1 },
        { channel: "whatsapp", count: 0 },
      ],
      bySource: [
        { count: 4, source: "service" },
        { count: 0, source: "prescription" },
        { count: 0, source: "commerce_inquiry" },
      ],
      deliveriesCompleted: 0,
      paymentsSucceeded: 2,
      paymentValueMinor: 1_140_000,
      pickupsCompleted: 0,
      quotesAccepted: 0,
      quotesIssued: 3,
      requestsReceived: 4,
      serviceCompletions: 0,
    },
    mayBeTruncated: false,
    media: {
      attachmentsActive: 0,
      attachmentsQuarantined: 0,
      attachmentsRejected: 0,
      attachmentsRetryable: 0,
      attachmentsSafe: 0,
      observationsConverted: 0,
      observationsCurrent: 0,
    },
    observability: [],
    reliability: {
      jobRecoveries: 0,
      jobRecoveryAttempts: 0,
      providerAttempts: 0,
      providerFailures: 0,
      providerRetries: 0,
      staleCapabilityRejections: 0,
    },
    scope: {
      end: new Date("2026-10-07T00:00:00.000Z"),
      start: new Date("2026-09-07T00:00:00.000Z"),
      storeId: null,
      tenantId: "tenant_1",
    },
    storeBreakdown: [],
    storeConversations: {
      availability: {
        coverageBlockObservations: 0,
        paused: 0,
        policyBlockObservations: 64,
        providerBlockObservations: 0,
        resumed: 0,
        scheduleUpdates: 0,
        scheduledClosureObservations: null,
      },
      channels: {
        bridgeConfirmed: 1,
        bridgeInitiated: 2,
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
        firstResponse: { averageSeconds: null, knownCount: 0, unknownCount: 0 },
        reactivated: 0,
        requestKinds: { prescription: 0, product: 0, service: 0 },
        storeReplies: 0,
        unreadWait: { averageSeconds: null, knownCount: 0, unknownCount: 0 },
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
    ...overrides,
  }
}

function findMetric(
  sections: ReturnType<typeof buildReportSections>,
  key: string,
  label: string,
) {
  return sections
    .find((section) => section.key === key)
    ?.groups.flatMap((group) => group.metrics)
    .find((metric) => metric.label === label)
}

describe("Service Commerce report sections", () => {
  test("names every group and splits paired values into separate rows", () => {
    const sections = buildReportSections(report())
    expect(sections.map((section) => section.key)).toEqual([
      "lifecycle",
      "conversations",
      "catalog",
      "reliability",
      "media",
      "costs",
    ])
    for (const section of sections)
      for (const group of section.groups) expect(group.title).not.toBe("")
    expect(
      findMetric(sections, "conversations", "Asked to move to WhatsApp")?.value,
    ).toBe(2)
    expect(
      findMetric(sections, "conversations", "Moved to WhatsApp")?.value,
    ).toBe(1)
    expect(
      findMetric(sections, "conversations", "Blocked by message rules")?.value,
    ).toBe(64)
  })

  test("keeps unavailable facts Unknown instead of zero", () => {
    const sections = buildReportSections(report())
    expect(
      findMetric(sections, "conversations", "Average first reply")?.value,
    ).toBeNull()
    expect(
      findMetric(sections, "conversations", "During a planned closure")?.value,
    ).toBeNull()
    expect(
      findMetric(sections, "conversations", "Waiting for staff")?.current,
    ).toBe(true)
  })

  test("shows channel and source rows as shares of all requests", () => {
    const web = findMetric(
      buildReportSections(report()),
      "lifecycle",
      "Website",
    )
    expect(web).toMatchObject({ shareOf: 4, value: 3 })
  })

  test("has no cost groups without cost facts, and keeps known zero apart from unknown", () => {
    expect(
      buildReportSections(report()).find((section) => section.key === "costs")
        ?.groups,
    ).toEqual([])

    const sections = buildReportSections(
      report({
        costs: [
          {
            costKind: "ewatrade_usage",
            currencyCode: "NGN",
            knownCount: 1,
            knownTotalMinor: 0,
            unknownCount: 0,
          },
          {
            costKind: "number",
            currencyCode: null,
            knownCount: 0,
            knownTotalMinor: null,
            unknownCount: 1,
          },
        ],
        usageCostsByDimension: [
          {
            billingOwner: "business",
            connectionId: "conn_1",
            costs: [
              {
                costKind: "meta_delivered_message",
                currencyCode: "NGN",
                knownCount: 2,
                knownTotalMinor: 500,
                unknownCount: 1,
              },
            ],
            messageCategory: "utility",
            recipientMarket: "NG",
          },
        ],
      }),
    )
    expect(findMetric(sections, "costs", "EwaTrade usage")).toMatchObject({
      currencyCode: "NGN",
      format: "money",
      note: "1 charge",
      value: 0,
    })
    expect(findMetric(sections, "costs", "Phone number fees")?.value).toBeNull()
    expect(
      findMetric(
        sections,
        "costs",
        "WhatsApp number conn_1 · Nigeria · Updates · Paid by you",
      )?.value,
    ).toBe(3)
  })

  test("funnel steps are shares of requests", () => {
    expect(lifecycleFunnel(report().lifecycle)).toEqual([
      { count: 4, label: "Requests" },
      { count: 3, label: "Quotes sent", share: 75 },
      { count: 0, label: "Quotes accepted", share: 0 },
      { count: 2, label: "Paid", share: 50 },
    ])
  })

  test("marks failures red and blocks amber only above zero; Unknown data stays neutral", () => {
    const base = report()
    const sections = buildReportSections(base)
    const tone = (key: string, label: string) => {
      const metric = findMetric(sections, key, label)
      return metric ? metricTone(metric) : undefined
    }
    expect(tone("conversations", "Blocked by message rules")).toBe("block")
    expect(tone("conversations", "Reply overdue")).toBeNull()
    expect(tone("conversations", "Delivery not confirmed")).toBeNull()
    expect(tone("catalog", "Not matched yet")).toBeNull()
    expect(
      sectionTone(
        sections.find((s) => s.key === "conversations") ?? { groups: [] },
      ),
    ).toBe("block")
    expect(
      sectionTone(
        sections.find((s) => s.key === "lifecycle") ?? { groups: [] },
      ),
    ).toBeNull()

    const failing = buildReportSections(
      report({
        media: {
          ...base.media,
          attachmentsQuarantined: 1,
          attachmentsRejected: 2,
        },
        observability: [
          { count: 1, kind: "readiness", outcome: "blocked" },
          { count: 0, kind: "routing", outcome: "failed" },
          { count: 5, kind: "provider_attempt", outcome: "available" },
        ],
        storeConversations: {
          ...base.storeConversations,
          providerReliability: {
            ...base.storeConversations.providerReliability,
            failed: 3,
          },
        },
      }),
    )
    const section = (key: string) =>
      failing.find((s) => s.key === key) ?? { groups: [] }
    expect(sectionTone(section("conversations"))).toBe("failure")
    expect(sectionTone(section("media"))).toBe("failure")
    expect(sectionTone(section("reliability"))).toBe("block")
    expect(
      metricTone(
        findMetric(failing, "reliability", "Message · Available") ?? {
          label: "",
          value: 0,
        },
      ),
    ).toBeNull()
  })

  test("downloads the daily counts with exact amounts", () => {
    const withDays = report({
      daily: [
        {
          date: "2026-10-05",
          paymentsSucceeded: 0,
          paymentValueMinor: 0,
          quotesAccepted: 0,
          quotesIssued: 1,
          requests: 3,
        },
        {
          date: "2026-10-06",
          paymentsSucceeded: 2,
          paymentValueMinor: 1_140_000,
          quotesAccepted: 0,
          quotesIssued: 2,
          requests: 0,
        },
      ],
    })
    expect(countRequestDays(withDays)).toBe(1)
    const csv = buildServiceCommerceReportCsv(
      withDays,
      {
        from: new Date("2026-10-05T00:00:00.000Z"),
        to: new Date("2026-10-07T00:00:00.000Z"),
      },
      "All Stores",
    )
    expect(csv.fileName).toBe(
      "requests-and-quotes_2026-10-05_to_2026-10-06.csv",
    )
    const lines = csv.text.split("\r\n")
    expect(lines[1]).toBe(
      "Date,Requests,Quotes sent,Quotes accepted,Paid,Amount paid",
    )
    expect(lines[3]).toBe("2026-10-06,0,2,0,2,11400.00")
    expect(lines[4]).toBe("Total,4,3,0,2,11400.00")
  })
})
