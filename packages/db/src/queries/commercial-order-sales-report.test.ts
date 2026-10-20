import { describe, expect, test } from "bun:test"

import {
  SALES_REPORT_TOP_ITEMS,
  salesReportDayKeys,
  summarizeSalesWindow,
} from "./commercial-order-sales-report"

const window = {
  from: new Date("2026-10-17T00:00:00.000Z"),
  to: new Date("2026-10-20T00:00:00.000Z"),
}

function line(
  kind: "PRODUCT_UNIT" | "SERVICE",
  catalogItemId: string,
  name: string,
  quantity: string,
  totalMinor: number,
) {
  return {
    kind,
    offering: { catalogItemId, name: `${name} offering` },
    quantity,
    snapshot: { catalogItemId, catalogItemName: name },
    totalMinor,
  }
}

describe("salesReportDayKeys", () => {
  test("lists every UTC day in the half-open window", () => {
    expect(salesReportDayKeys(window.from, window.to)).toEqual([
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
    ])
  })
})

describe("summarizeSalesWindow", () => {
  test("splits each day into Products and Services and keeps quiet days", () => {
    const report = summarizeSalesWindow(
      [
        {
          createdAt: new Date("2026-10-17T09:00:00.000Z"),
          lines: [
            line("PRODUCT_UNIT", "eggs", "Fresh eggs", "2", 900_000),
            line("SERVICE", "delivery", "Farm delivery", "1", 300_000),
          ],
          totalMinor: 1_250_000,
        },
        {
          createdAt: new Date("2026-10-19T23:59:00.000Z"),
          lines: [line("PRODUCT_UNIT", "eggs", "Fresh eggs", "1.5", 675_000)],
          totalMinor: 675_000,
        },
      ],
      window,
    )
    expect(report.days).toEqual([
      {
        date: "2026-10-17",
        orderCount: 1,
        orderValueMinor: 1_250_000,
        productMinor: 900_000,
        serviceMinor: 300_000,
      },
      {
        date: "2026-10-18",
        orderCount: 0,
        orderValueMinor: 0,
        productMinor: 0,
        serviceMinor: 0,
      },
      {
        date: "2026-10-19",
        orderCount: 1,
        orderValueMinor: 675_000,
        productMinor: 675_000,
        serviceMinor: 0,
      },
    ])
    expect(report.totals).toEqual({
      orderCount: 2,
      orderValueMinor: 1_925_000,
      productMinor: 1_575_000,
      serviceMinor: 300_000,
      serviceQuantity: "1",
    })
    expect(report.topItems[0]).toEqual({
      catalogItemId: "eggs",
      kind: "product",
      name: "Fresh eggs",
      quantity: "3.5",
      totalMinor: 1_575_000,
    })
  })

  test("ranks top sellers by sales and sums the rest", () => {
    const lines = Array.from(
      { length: SALES_REPORT_TOP_ITEMS + 2 },
      (_, index) =>
        line(
          "PRODUCT_UNIT",
          `item-${index}`,
          `Item ${index}`,
          "1",
          (index + 1) * 1000,
        ),
    )
    const report = summarizeSalesWindow(
      [
        {
          createdAt: new Date("2026-10-18T12:00:00.000Z"),
          lines,
          totalMinor: 36_000,
        },
      ],
      window,
    )
    expect(report.topItems).toHaveLength(SALES_REPORT_TOP_ITEMS)
    expect(report.topItems[0]?.name).toBe(`Item ${SALES_REPORT_TOP_ITEMS + 1}`)
    expect(report.otherItems).toEqual({ count: 2, totalMinor: 3000 })
  })

  test("falls back to the offering name when a line has no snapshot", () => {
    const report = summarizeSalesWindow(
      [
        {
          createdAt: new Date("2026-10-18T12:00:00.000Z"),
          lines: [
            {
              kind: "SERVICE",
              offering: { catalogItemId: "visit", name: "Health check" },
              quantity: "1",
              snapshot: null,
              totalMinor: 1_000_000,
            },
          ],
          totalMinor: 1_000_000,
        },
      ],
      window,
    )
    expect(report.topItems[0]?.name).toBe("Health check")
  })
})
