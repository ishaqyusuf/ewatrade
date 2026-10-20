import { describe, expect, test } from "bun:test"
import { metricTone, sectionTone } from "@/components/reports/report-metrics"
import { reportCsvCell } from "@/lib/report-csv"

import {
  type OperationsSalesReport,
  buildInventoryGroups,
  buildSalesReportCsv,
  buildServiceGroups,
  buildServiceJobsNow,
  countSalesDays,
} from "./operations-report-sections"

const service = {
  commercial: { immutableServiceQuantity: "3", serviceRevenueMinor: 150_000 },
  communications: { intents: 2 },
  work: {
    blocked: 0,
    completed: 5,
    exceptions: 1,
    overdueJobs: 0,
    ready: 2,
    rework: 0,
    wip: 4,
  },
}

const sales: OperationsSalesReport = {
  currencyCode: "NGN",
  days: [
    {
      date: "2026-10-18",
      orderCount: 0,
      orderValueMinor: 0,
      productMinor: 0,
      serviceMinor: 0,
    },
    {
      date: "2026-10-19",
      orderCount: 2,
      orderValueMinor: 1_250_050,
      productMinor: 950_050,
      serviceMinor: 300_000,
    },
  ],
  otherItems: { count: 1, totalMinor: 50 },
  partial: false,
  topItems: [
    {
      catalogItemId: "eggs",
      kind: "product",
      name: "=Fresh eggs",
      quantity: "2",
      totalMinor: 950_000,
    },
  ],
  totals: {
    orderCount: 2,
    orderValueMinor: 1_250_050,
    productMinor: 950_050,
    serviceMinor: 300_000,
    serviceQuantity: "1",
  },
}

describe("Operations report sections", () => {
  test("names stock in plain words and marks waiting changes as right now", () => {
    const groups = buildInventoryGroups({
      balances: {
        rows: [
          { kind: "SHARED_POOL" },
          { kind: "PACKAGED_STOCK" },
          { kind: "PACKAGED_STOCK" },
          { kind: "OTHER" },
        ],
      },
      reconciliation: { provisionalCommands: 1 },
    })
    expect(
      groups.map((group) => [
        group.title,
        group.metrics.map((m) => [m.label, m.value]),
      ]),
    ).toEqual([
      [
        "Stock records",
        [
          ["Stock records", 4],
          ["Shared stock", 1],
          ["Packaged stock", 2],
        ],
      ],
      ["Offline changes", [["Waiting to sync", 1]]],
    ])
    expect(groups[1]?.metrics[0]?.current).toBe(true)
  })

  test("emphasises only blocked and overdue jobs, and only above zero", () => {
    const now = (work: Partial<typeof service.work>) =>
      buildServiceJobsNow({ ...service, work: { ...service.work, ...work } })
    expect(sectionTone({ groups: [{ metrics: now({}), title: "Now" }] })).toBe(
      null,
    )
    expect(
      sectionTone({ groups: [{ metrics: now({ blocked: 2 }), title: "Now" }] }),
    ).toBe("block")
    expect(
      sectionTone({
        groups: [
          { metrics: now({ blocked: 2, overdueJobs: 1 }), title: "Now" },
        ],
      }),
    ).toBe("failure")
    const problems = buildServiceGroups(service)
      .flatMap((group) => group.metrics)
      .find((m) => m.label === "Problems reported")
    expect(problems && metricTone(problems)).toBeNull()
  })

  test("counts days with sales for the quiet-period note", () => {
    expect(countSalesDays(sales)).toBe(1)
  })

  test("downloads sales by day and top sellers with exact amounts", () => {
    const csv = buildSalesReportCsv(
      sales,
      {
        from: new Date("2026-10-18T00:00:00.000Z"),
        to: new Date("2026-10-20T00:00:00.000Z"),
      },
      "Main store",
    )
    expect(csv.fileName).toBe("sales_2026-10-18_to_2026-10-19.csv")
    const lines = csv.text.split("\r\n")
    expect(lines[1]).toBe("Date,Orders,Product sales,Service sales,Sales")
    expect(lines[3]).toBe("2026-10-19,2,9500.50,3000.00,12500.50")
    expect(lines[4]).toBe("Total,2,9500.50,3000.00,12500.50")
    expect(lines).toContain(`${reportCsvCell("=Fresh eggs")},Product,2,9500.00`)
    expect(lines.at(-1)).toBe("Everything else (1 item),,,0.50")
  })
})
