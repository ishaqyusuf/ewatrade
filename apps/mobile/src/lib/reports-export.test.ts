import { describe, expect, test } from "bun:test"
import { buildRetailOpsReportCsv } from "./reports-export"

describe("retail ops reports CSV export", () => {
  test("builds report metadata and section rows", () => {
    const csv = buildRetailOpsReportCsv({
      businessId: "business_123",
      generatedAt: new Date("2026-07-12T12:30:00.000Z"),
      sections: [
        {
          rows: [
            {
              detail: "2 sales",
              label: "Ada",
              value: "NGN 12,000.00",
            },
          ],
          title: "Sales by attendant",
        },
      ],
      source: "Online",
      syncDeviceFilter: "current device",
    })

    expect(csv).toContain("Ewatrade Retail Ops report")
    expect(csv).toContain("Generated at,2026-07-12T12:30:00.000Z")
    expect(csv).toContain("Report source,Online")
    expect(csv).toContain("Business,business_123")
    expect(csv).toContain("Sync device filter,current device")
    expect(csv).toContain('Sales by attendant,Ada,"NGN 12,000.00",2 sales')
  })

  test("escapes commas, quotes, and empty sections", () => {
    const csv = buildRetailOpsReportCsv({
      generatedAt: new Date("2026-07-12T12:30:00.000Z"),
      sections: [
        {
          rows: [
            {
              detail: 'Expected "cash", transfer',
              label: "Cash variance",
              value: "NGN 0.00",
            },
          ],
          title: "Cash and stock variance",
        },
        {
          rows: [],
          title: "Server sync conflicts",
        },
      ],
      source: "Mixed",
    })

    expect(csv).toContain(
      'Cash and stock variance,Cash variance,NGN 0.00,"Expected ""cash"", transfer"',
    )
    expect(csv).toContain("Server sync conflicts,No rows,,")
    expect(csv).toEndWith("\n")
  })
})
