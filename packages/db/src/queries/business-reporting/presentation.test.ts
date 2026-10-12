import { expect, test } from "bun:test"
import { itemSalesReportFromGroups } from "./item-sales"
import { businessReportRowValue, businessReportSummary } from "./presentation"
import type { BusinessReport } from "./types"
test("G01 merchant money reads exact numeric totals independently of legacy sentences", () => {
  const report: BusinessReport = {
    report: "payment_collections",
    complete: true,
    asOf: "2026-10-12T00:00:00Z",
    scope: "Sweet Crumbs",
    dateBasis: "Payment recording",
    period: null,
    currencyCode: "NGN",
    summary: "WRONG legacy values 1.23",
    rows: [],
    gaps: [],
    totals: {
      kind: "payment_collections",
      receivedMinor: "9007199254740993",
      refundedMinor: "2",
      netMoneyMinor: "9007199254740991",
      netCustomerCreditMinor: "-350",
    },
  }
  const summary = businessReportSummary(report)
  expect(summary).toContain("₦90,071,992,547,409.93")
  expect(summary).toContain("₦90,071,992,547,409.91")
  expect(summary).toContain("-₦3.50")
  expect(summary).not.toContain("WRONG")
  expect(summary).not.toContain("minor units")
  expect(
    businessReportRowValue(
      {
        id: "row",
        label: "Payment",
        value: "WRONG",
        detail: "",
        moneyMinor: "9007199254740993",
      },
      "NGN",
    ),
  ).toBe("₦90,071,992,547,409.93")
})
test("G01 Store display is human-readable while report origin/cursor authority remains IDs", () => {
  const report = itemSalesReportFromGroups(
    [],
    { groupCount: "0", lineCount: "0", valueMinor: "0" },
    {
      tenantId: "tenant_id",
      storeId: "store_id",
      storeName: "Sweet Crumbs",
      from: new Date("2026-10-10T00:00:00Z"),
      before: new Date("2026-10-11T00:00:00Z"),
      timezone: "UTC",
      currencyCode: "NGN",
    },
  )
  expect(report.scope).toBe("Sweet Crumbs · All permitted orders")
  expect(businessReportSummary(report)).toContain("₦0.00")
  expect(report.totals).toEqual({
    kind: "item_sales",
    groupCount: "0",
    lineCount: "0",
    bookedValueMinor: "0",
  })
})
