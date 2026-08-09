import { describe, expect, test } from "bun:test"

import {
  averageDurationMs,
  isInPrescriptionReportWindow,
  prescriptionReportStoreScope,
  prescriptionReviewDurationPairs,
  summarizePrescriptionQuoteVersionEvents,
  summarizePrescriptionUsageAmounts,
} from "./prescription-reporting"

describe("prescription reporting definitions", () => {
  test("places late lifecycle events in their half-open occurrence window", () => {
    const window = {
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-09-01T00:00:00.000Z"),
    }
    expect(
      isInPrescriptionReportWindow(
        new Date("2026-08-31T23:59:59.999Z"),
        window,
      ),
    ).toBe(true)
    expect(
      isInPrescriptionReportWindow(
        new Date("2026-09-01T00:00:00.000Z"),
        window,
      ),
    ).toBe(false)
  })

  test("counts lifecycle events from superseded Quote Versions", () => {
    const window = {
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-09-01T00:00:00.000Z"),
    }
    expect(
      summarizePrescriptionQuoteVersionEvents(
        [
          {
            acceptedAt: null,
            availabilityOutcome: "PARTIAL",
            declinedAt: new Date("2026-08-10T10:00:00.000Z"),
            issuedAt: new Date("2026-08-09T10:00:00.000Z"),
            status: "DECLINED",
          },
          {
            acceptedAt: new Date("2026-08-12T10:00:00.000Z"),
            availabilityOutcome: "FULL",
            declinedAt: null,
            issuedAt: new Date("2026-08-11T10:00:00.000Z"),
            status: "ACCEPTED",
          },
        ],
        window,
      ),
    ).toEqual({
      quoteCount: 2,
      quoteOutcomes: {
        accepted: 1,
        declined: 1,
        full: 1,
        partial: 1,
        unavailable: 0,
      },
    })
  })

  test("uses only completed non-negative lifecycle durations", () => {
    expect(
      averageDurationMs([
        {
          endedAt: new Date("2026-08-08T10:05:00Z"),
          startedAt: new Date("2026-08-08T10:00:00Z"),
        },
        {
          endedAt: null,
          startedAt: new Date("2026-08-08T10:00:00Z"),
        },
      ]),
    ).toBe(300_000)
  })

  test("uses canonical received and pharmacist-review audit timestamps", () => {
    expect(
      averageDurationMs(
        prescriptionReviewDurationPairs([
          {
            auditEvents: [
              {
                effectiveAt: new Date("2026-08-08T10:00:00Z"),
                type: "RECEIVED",
              },
              {
                effectiveAt: new Date("2026-08-08T10:07:00Z"),
                type: "PHARMACIST_REVIEWED",
              },
            ],
            createdAt: new Date("2026-08-08T09:59:00Z"),
          },
        ]),
      ),
    ).toBe(420_000)
  })

  test("keeps provider charges, platform charges, tax, and revenue separate", () => {
    expect(
      summarizePrescriptionUsageAmounts([
        {
          amounts: {
            pharmacyRevenueMinor: 12_000,
            platformChargeMinor: 300,
            taxMinor: 900,
          },
          eventType: "ORDER_CREATED",
        },
        {
          amounts: { paymentProviderFeeMinor: 180 },
          eventType: "PAYMENT_SUCCEEDED",
        },
        { amounts: {}, eventType: "MESSAGE_SENT" },
      ]),
    ).toMatchObject({
      metaCostMinor: {
        amountMinor: null,
        observedCount: 0,
        unknownCount: 1,
      },
      paymentProviderFeeMinor: { amountMinor: 180, unknownCount: 0 },
      pharmacyRevenueMinor: { amountMinor: 12_000, unknownCount: 0 },
      platformChargeMinor: { amountMinor: 300, unknownCount: 2 },
      taxMinor: { amountMinor: 900, unknownCount: 0 },
    })
  })

  test("supports tenant-wide and explicit Store report scopes", () => {
    expect(prescriptionReportStoreScope({ tenantId: "tenant-1" })).toEqual({
      tenantId: "tenant-1",
    })
    expect(
      prescriptionReportStoreScope({
        storeId: "store-2",
        tenantId: "tenant-1",
      }),
    ).toEqual({ storeId: "store-2", tenantId: "tenant-1" })
  })
})
