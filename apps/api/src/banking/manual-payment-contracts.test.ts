import { expect, test } from "bun:test"
import {
  createBusinessPaymentLinkSchema,
  prepareManualPaymentReportSchema,
  reviewManualPaymentReportSchema,
} from "../schemas/business-banking"
import { staffProcedureAction } from "../utils/staff-procedure-policy"

test("manual report input cannot accept paid status, server amount or customer-chosen merchant scope", () => {
  const input = {
    token: "signed-token",
    clientReportId: "report-123",
    payerName: "Ishaq",
    claimedAmountMinor: 5000,
  }
  expect(prepareManualPaymentReportSchema.safeParse(input).success).toBe(true)
  for (const extra of [
    { status: "CONFIRMED" },
    { tenantId: "other" },
    { receivedAmountMinor: 5000 },
    { moneyAccountId: "other" },
  ])
    expect(
      prepareManualPaymentReportSchema.safeParse({ ...input, ...extra })
        .success,
    ).toBe(false)
})
test("merchant review requires revision and concrete received facts or a customer-facing reason", () => {
  const input = { reportId: "report-1", expectedRevision: 2 }
  expect(
    reviewManualPaymentReportSchema.safeParse({ ...input, outcome: "received" })
      .success,
  ).toBe(false)
  expect(
    reviewManualPaymentReportSchema.safeParse({
      ...input,
      outcome: "not_received",
    }).success,
  ).toBe(false)
  expect(
    reviewManualPaymentReportSchema.safeParse({
      ...input,
      outcome: "not_received",
      note: "No credit found yet.",
    }).success,
  ).toBe(true)
  expect(
    reviewManualPaymentReportSchema.safeParse({
      ...input,
      outcome: "received",
      receivedAmountMinor: 5000,
      moneyAccountId: "bank",
      receivedAt: "2026-10-26T12:00:00Z",
    }).success,
  ).toBe(true)
})
test("payment links cannot introduce provider checkout and scoped staff retain the existing orders permission", () => {
  expect(
    createBusinessPaymentLinkSchema.safeParse({
      orderId: "order",
      bankAccountId: "bank",
      clientLinkId: "link-1234",
      provider: "paystack",
    }).success,
  ).toBe(false)
  expect(staffProcedureAction("businessBanking.reviewReport", "mutation")).toBe(
    "orders",
  )
  expect(
    staffProcedureAction("businessBanking.createPaymentLink", "mutation"),
  ).toBe("orders")
  expect(staffProcedureAction("businessBanking.pendingReports", "query")).toBe(
    "read",
  )
  expect(
    staffProcedureAction("businessBanking.createBankAccount", "mutation"),
  ).toBeNull()
})
