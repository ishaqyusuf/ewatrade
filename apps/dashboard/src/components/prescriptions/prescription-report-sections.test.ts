import { describe, expect, test } from "bun:test"

import {
  type PrescriptionReportData,
  buildPrescriptionReportSections,
  hasPrescriptionReportActivity,
  prescriptionConversionPercent,
  prescriptionReportFunnel,
} from "./prescription-report-sections"

const emptyCost = { amountMinor: null, observedCount: 0, unknownCount: 0 }

function report(
  overrides: Partial<PrescriptionReportData> = {},
): PrescriptionReportData {
  return {
    channelMix: { staff_phone: 0, staff_walk_in: 1, web: 3, whatsapp: 0 },
    conversionRate: 0.5,
    costs: {
      deliveryCostMinor: emptyCost,
      metaCostMinor: { amountMinor: 0, observedCount: 2, unknownCount: 0 },
      paymentProviderFeeMinor: {
        amountMinor: 150,
        observedCount: 1,
        unknownCount: 1,
      },
      pharmacyRevenueMinor: emptyCost,
      platformChargeMinor: emptyCost,
      taxMinor: emptyCost,
    },
    currencyCode: "NGN",
    deliveryCompleted: 1,
    payment: { paidAmountMinor: 500_000, paidCount: 2, totalAttempts: 3 },
    pickupCompleted: 0,
    quoteCount: 3,
    quoteOutcomes: {
      accepted: 2,
      declined: 1,
      full: 2,
      partial: 1,
      unavailable: 0,
    },
    requestCount: 4,
    reviewTimeMs: 90_000,
    scope: "tenant",
    storeBreakdown: [
      { name: "Ikeja Pharmacy", requestCount: 4, storeId: "s1" },
    ],
    ...overrides,
  }
}

function findMetric(data: PrescriptionReportData, key: string, label: string) {
  return buildPrescriptionReportSections(data)
    .find((section) => section.key === key)
    ?.groups.flatMap((group) => group.metrics)
    .find((metric) => metric.label === label)
}

describe("Prescription report sections", () => {
  test("names every group and keeps the tabs in order", () => {
    const sections = buildPrescriptionReportSections(report())
    expect(sections.map((section) => section.key)).toEqual([
      "lifecycle",
      "quotes",
      "costs",
    ])
    for (const section of sections)
      for (const group of section.groups) expect(group.title).not.toBe("")
  })

  test("labels channels and shows them as shares of all requests", () => {
    expect(findMetric(report(), "lifecycle", "Web")).toMatchObject({
      shareOf: 4,
      value: 3,
    })
    expect(findMetric(report(), "lifecycle", "Staff walk-in")?.value).toBe(1)
  })

  test("keeps review time and conversion Unknown when nothing was measured", () => {
    expect(
      findMetric(report(), "lifecycle", "Average review time")?.value,
    ).toBe(90)
    expect(
      findMetric(
        report({ reviewTimeMs: null }),
        "lifecycle",
        "Average review time",
      )?.value,
    ).toBeNull()
    expect(prescriptionConversionPercent(report())).toBe(50)
    expect(
      prescriptionConversionPercent(
        report({ conversionRate: 0, requestCount: 0 }),
      ),
    ).toBeNull()
  })

  test("keeps a known zero cost apart from an unreported one", () => {
    expect(
      findMetric(report(), "costs", "Meta messaging charges"),
    ).toMatchObject({ note: "2 known · 0 awaiting cost data", value: 0 })
    expect(findMetric(report(), "costs", "Taxes")?.value).toBeNull()
    expect(
      findMetric(report(), "costs", "Payment-provider fees"),
    ).toMatchObject({ note: "1 known · 1 awaiting cost data", value: 150 })
  })

  test("funnel follows requests, quotes, acceptances and paid orders", () => {
    expect(prescriptionReportFunnel(report())).toEqual([
      { count: 4, label: "Requests received" },
      { count: 3, label: "Quotes issued", ratio: 75 },
      { count: 2, label: "Quotes accepted", ratio: 67 },
      { count: 2, label: "Paid orders", ratio: 100 },
    ])
  })

  test("detects a window with no activity at all", () => {
    expect(hasPrescriptionReportActivity(report())).toBe(true)
    expect(
      hasPrescriptionReportActivity(
        report({
          channelMix: { web: 0 },
          conversionRate: 0,
          costs: {
            deliveryCostMinor: emptyCost,
            metaCostMinor: emptyCost,
            paymentProviderFeeMinor: emptyCost,
            pharmacyRevenueMinor: emptyCost,
            platformChargeMinor: emptyCost,
            taxMinor: emptyCost,
          },
          deliveryCompleted: 0,
          payment: { paidAmountMinor: 0, paidCount: 0, totalAttempts: 0 },
          quoteCount: 0,
          quoteOutcomes: {
            accepted: 0,
            declined: 0,
            full: 0,
            partial: 0,
            unavailable: 0,
          },
          requestCount: 0,
        }),
      ),
    ).toBe(false)
  })
})
