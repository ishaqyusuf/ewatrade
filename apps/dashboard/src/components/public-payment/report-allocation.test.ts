import { expect, test } from "bun:test"
import {
  type ReportAllocation,
  allocationSummary,
  isReportAllocation,
  reportAllocation,
  reviewSentAmount,
} from "./report-allocation"
import {
  type StoredReport,
  parseStoredReport,
  sameReportDetails,
} from "./report-storage"

const link = {
  dueMinor: 500_000,
  balanceMinor: 1_500_000,
  allowPartial: false,
  currencyCode: "NGN",
}

test("the sent amount is reviewed against the installment and the order balance", () => {
  expect(reviewSentAmount({ ...link, sentMinor: null }).kind).toBe("invalid")
  expect(reviewSentAmount({ ...link, sentMinor: 0 }).kind).toBe("invalid")
  expect(reviewSentAmount({ ...link, sentMinor: 100_000_001 }).kind).toBe(
    "invalid",
  )
  // A fixed link can't be reported as less than it asks for.
  expect(reviewSentAmount({ ...link, sentMinor: 400_000 })).toEqual({
    kind: "invalid",
    message:
      "This business asks for ₦5,000.00. Enter the amount you sent if it was more.",
  })
  expect(
    reviewSentAmount({ ...link, allowPartial: true, sentMinor: 400_000 }),
  ).toEqual({ kind: "ordinary" })
  expect(reviewSentAmount({ ...link, sentMinor: 500_000 })).toEqual({
    kind: "ordinary",
  })
  expect(reviewSentAmount({ ...link, sentMinor: 800_000 })).toEqual({
    kind: "more",
    applyMinor: 800_000,
    leftMinor: 700_000,
  })
  expect(reviewSentAmount({ ...link, sentMinor: 2_000_000 })).toEqual({
    kind: "excess",
    applyMinor: 1_500_000,
    extraMinor: 500_000,
  })
})

test("the proposal always applies what the order owes first", () => {
  expect(reportAllocation({ kind: "ordinary" }, "CREDIT")).toBeNull()
  expect(
    reportAllocation({ kind: "more", applyMinor: 800_000, leftMinor: 0 }, null),
  ).toEqual({
    allocationPreference: "ORDER_MORE",
    requestedApplyMinor: 800_000,
  })
  const excess = {
    kind: "excess",
    applyMinor: 1_500_000,
    extraMinor: 500_000,
  } as const
  expect(reportAllocation(excess, null)).toBe("choice_required")
  expect(reportAllocation(excess, "REFUND")).toEqual({
    allocationPreference: "REFUND",
    requestedApplyMinor: 1_500_000,
  })
})

test("stored proposals never carry refund bank details", () => {
  expect(
    isReportAllocation({
      allocationPreference: "CREDIT",
      requestedApplyMinor: 1,
    }),
  ).toBe(true)
  expect(
    isReportAllocation({
      allocationPreference: "REFUND",
      requestedApplyMinor: 1,
      refundDestination: { accountNumber: "0123456789" },
    }),
  ).toBe(false)
  expect(
    isReportAllocation({
      allocationPreference: "PAYOUT",
      requestedApplyMinor: 1,
    }),
  ).toBe(false)
  const report = {
    v: 1,
    clientReportId: "pr_stableoperation",
    payerName: "Ada",
    claimedAmountMinor: 2_000_000,
    receipt: null,
    reportToken: null,
    previousReportToken: null,
    reportedAt: null,
  }
  const allocation: ReportAllocation = {
    allocationPreference: "CREDIT",
    requestedApplyMinor: 1_500_000,
  }
  expect(
    parseStoredReport(JSON.stringify({ ...report, allocation }))?.allocation,
  ).toEqual(allocation)
  expect(
    parseStoredReport(
      JSON.stringify({
        ...report,
        allocation: { ...allocation, refundDestination: { bankCode: "058" } },
      }),
    ),
  ).toBeNull()
})

test("a changed proposal is a different report, not a silent retry", () => {
  const stored: StoredReport = {
    v: 1,
    clientReportId: "pr_stableoperation",
    payerName: "Ada",
    claimedAmountMinor: 2_000_000,
    receipt: null,
    reportToken: null,
    previousReportToken: null,
    reportedAt: null,
    paymentAttemptId: "attempt_1",
    allocation: {
      allocationPreference: "CREDIT",
      requestedApplyMinor: 1_500_000,
    },
  }
  const details = {
    payerName: "Ada",
    claimedAmountMinor: 2_000_000,
    receipt: null,
    paymentAttemptId: "attempt_1",
  }
  expect(
    sameReportDetails(stored, {
      ...details,
      allocation: {
        allocationPreference: "CREDIT",
        requestedApplyMinor: 1_500_000,
      },
    }),
  ).toBe(true)
  expect(
    sameReportDetails(stored, {
      ...details,
      allocation: {
        allocationPreference: "REFUND",
        requestedApplyMinor: 1_500_000,
      },
    }),
  ).toBe(false)
  expect(sameReportDetails(stored, { ...details, allocation: null })).toBe(
    false,
  )
})

test("the waiting summary states the request, never an outcome", () => {
  expect(
    allocationSummary({
      allocationPreference: null,
      requestedApplyMinor: null,
      claimedAmountMinor: 500_000,
      currencyCode: "NGN",
    }),
  ).toBeNull()
  expect(
    allocationSummary({
      allocationPreference: "REFUND",
      requestedApplyMinor: "1500000",
      claimedAmountMinor: 2_000_000,
      currencyCode: "NGN",
    }),
  ).toBe(
    "You asked them to put ₦15,000.00 toward this order and refund ₦5,000.00. Nothing is refunded until they confirm your transfer.",
  )
  expect(
    allocationSummary({
      allocationPreference: "CREDIT",
      requestedApplyMinor: "1e9",
      claimedAmountMinor: 2_000_000,
      currencyCode: "NGN",
    }),
  ).toBeNull()
})
