import { expect, test } from "bun:test"
import { generalAnswerSchema } from "@ewatrade/assistant/general/contracts"
import { businessReportTargetSchema } from "../../../../packages/assistant/src/general/business-report-target"
import type { BusinessReport } from "../../../../packages/db/src/queries/business-reporting/types"
import { generalBusinessReportAnswer } from "./general-business-reporting"
const report: BusinessReport = {
  report: "customer_debt",
  asOf: "2026-10-12T12:00:00Z",
  complete: true,
  scope: "Business · all Stores",
  dateBasis: "Current snapshot",
  currencyCode: "NGN",
  period: null,
  rows: [],
  summary: "Debt 0; available credit 0 across 0 matching posted accounts.",
  gaps: [
    "Unintegrated orders excluded; no accounts does not mean no unpaid orders.",
  ],
}
test("G01 saved answer remains bounded and retains strict navigation/unknown coverage", () => {
  const target = businessReportTargetSchema.parse({
    kind: "business_report",
    origin: { tenantId: "tenant", storeId: null },
    request: {
      report: "customer_debt",
      filters: { currencyCode: "NGN", query: "Original name" },
    },
  })
  const { target: actualTarget, ...answer } = generalBusinessReportAnswer(
    report,
    target,
  )
  expect(generalAnswerSchema.omit({ target: true }).parse(answer)).toEqual(
    answer,
  )
  expect(actualTarget).toEqual(target)
  expect(answer.detail).toContain("no accounts does not mean no unpaid orders")
  expect(answer.scope).toContain("all Stores")
})
test("G01 overflow/long report does not expose partial amounts as a saved total", () => {
  const target = businessReportTargetSchema.parse({
    kind: "business_report",
    origin: { tenantId: "tenant", storeId: null },
    request: { report: "customer_debt", filters: { currencyCode: "NGN" } },
  })
  const { target: unused, ...answer } = generalBusinessReportAnswer(
    {
      ...report,
      complete: false,
      summary: "Complete total unavailable",
      gaps: ["x".repeat(3000)],
    },
    target,
  )
  expect(answer.value).toBe("Complete report unavailable")
  expect(answer.detail).toContain("no partial total or zero")
  expect(
    generalAnswerSchema.omit({ target: true }).safeParse(answer).success,
  ).toBe(true)
})
