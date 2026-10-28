import { expect, test } from "bun:test"
import {
  cancelManualPaymentDraftSchema,
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
      bankCheckAttested: true,
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

test("bank reference namespace cannot substitute for explicit actual bank-check consent", () => {
  const received = {
    reportId: "report-1",
    expectedRevision: 2,
    outcome: "received",
    receivedAmountMinor: 5000,
    moneyAccountId: "bank",
    receivedAt: "2026-10-26T12:00:00Z",
    reference: "123456789012345678901234567890",
    transferReferenceNamespace: "nibss_session_id",
  }
  expect(reviewManualPaymentReportSchema.safeParse(received).success).toBe(
    false,
  )
  expect(
    reviewManualPaymentReportSchema.safeParse({
      ...received,
      bankCheckAttested: false,
    }).success,
  ).toBe(false)
  expect(
    reviewManualPaymentReportSchema.safeParse({
      ...received,
      bankCheckAttested: true,
    }).success,
  ).toBe(true)
})

test("refund destination accepts an actual bank name or legacy code and never public authority fields", () => {
  const claim = {
    token: "signed-token",
    clientReportId: "report-123",
    payerName: "Payer",
    claimedAmountMinor: 12000,
    allocation: {
      allocationPreference: "REFUND",
      requestedApplyMinor: 10000,
      refundDestination: {
        bankName: "Actual Bank",
        accountNumber: "0012345678",
        accountName: "Payer",
      },
    },
  }
  expect(prepareManualPaymentReportSchema.safeParse(claim).success).toBe(true)
  expect(
    prepareManualPaymentReportSchema.safeParse({
      ...claim,
      authenticatedUserId: "forged",
    }).success,
  ).toBe(false)
  const destination = claim.allocation.refundDestination
  expect(
    prepareManualPaymentReportSchema.safeParse({
      ...claim,
      allocation: {
        ...claim.allocation,
        refundDestination: {
          accountNumber: destination.accountNumber,
          accountName: destination.accountName,
        },
      },
    }).success,
  ).toBe(false)
  expect(
    prepareManualPaymentReportSchema.safeParse({
      ...claim,
      allocation: {
        ...claim.allocation,
        refundDestination: {
          bankCode: "058",
          accountNumber: destination.accountNumber,
          accountName: destination.accountName,
        },
      },
    }).success,
  ).toBe(true)
  expect(
    prepareManualPaymentReportSchema.safeParse({
      ...claim,
      allocation: {
        ...claim.allocation,
        refundDestination: { ...destination, customerId: "forged" },
      },
    }).success,
  ).toBe(false)
})

test("draft cancellation requires exact report proof and revision, never accepts an unsigned report id or bank decision", () => {
  expect(
    cancelManualPaymentDraftSchema.safeParse({
      reportToken: "report-proof",
      expectedRevision: 1,
    }).success,
  ).toBe(true)
  expect(
    cancelManualPaymentDraftSchema.safeParse({
      reportId: "unsigned",
      expectedRevision: 1,
    }).success,
  ).toBe(false)
  expect(
    cancelManualPaymentDraftSchema.safeParse({
      reportToken: "report-proof",
      expectedRevision: 0,
    }).success,
  ).toBe(false)
  expect(
    cancelManualPaymentDraftSchema.safeParse({
      reportToken: "report-proof",
      expectedRevision: 1,
      status: "NOT_RECEIVED",
    }).success,
  ).toBe(false)
})
