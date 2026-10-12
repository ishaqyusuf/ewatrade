import { expect, test } from "bun:test"
import { businessReportTargetSchema } from "../../../../packages/assistant/src/general/business-report-target"
import { assertBusinessReportOrigin } from "./business-report-origin"
test("G01 original origin refuses business/Store changes before a read", () => {
  const target = businessReportTargetSchema.parse({
    kind: "business_report",
    origin: { tenantId: "tenant", storeId: "store" },
    request: { report: "stock", filters: {} },
  })
  expect(() =>
    assertBusinessReportOrigin(target, {
      tenantId: "tenant",
      storeId: "store",
    }),
  ).not.toThrow()
  for (const current of [
    { tenantId: "foreign", storeId: "store" },
    { tenantId: "tenant", storeId: "foreign" },
    { tenantId: "tenant", storeId: null },
  ])
    expect(() => assertBusinessReportOrigin(target, current)).toThrow(
      "different business or Store",
    )
  const tenantReport = businessReportTargetSchema.parse({
    kind: "business_report",
    origin: { tenantId: "tenant", storeId: null },
    request: { report: "customer_debt", filters: { currencyCode: "NGN" } },
  })
  expect(() =>
    assertBusinessReportOrigin(tenantReport, {
      tenantId: "tenant",
      storeId: "any",
    }),
  ).not.toThrow()
  expect(() =>
    assertBusinessReportOrigin(
      { ...tenantReport, origin: { tenantId: "tenant", storeId: "store" } },
      { tenantId: "tenant", storeId: "store" },
    ),
  ).toThrow()
})
