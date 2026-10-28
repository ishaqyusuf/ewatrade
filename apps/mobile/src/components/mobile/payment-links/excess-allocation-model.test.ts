import { expect, test } from "bun:test"
import { formatMinorMoney } from "@ewatrade/utils"
import {
  type ConfirmedAllocation,
  MAX_RECEIVED_MINOR,
  customerPreferenceFacts,
  excessSplit,
  excessTreatmentText,
  savedAllocationOutcome,
  usableFundsReview,
} from "./excess-allocation-model"

const review = {
  expectedCustomerFundsAccountId: "acct_1",
  expectedCustomerFundsRevision: "12",
  expectedOrderUpdatedAt: new Date("2026-10-27T09:00:00.123Z"),
  expectedOrderTotalMinor: 1_500_000,
  expectedOrderPaidMinor: 1_000_000,
}
const report = {
  customerFundsReview: review,
  totalMinor: 1_500_000,
  paidMinor: 1_000_000,
}

test("without the Finance snapshot the balance cap stays", () => {
  expect(usableFundsReview({ ...report, customerFundsReview: null })).toBeNull()
  expect(excessSplit(2_000_000, null)).toBeNull()
})

test("a snapshot that disagrees with the report's totals isn't used", () => {
  expect(usableFundsReview(report)).toBe(review)
  expect(usableFundsReview({ ...report, paidMinor: 1_100_000 })).toBeNull()
  expect(usableFundsReview({ ...report, totalMinor: 1_600_000 })).toBeNull()
})

test("received = applied to the Order + kept as credit, in whole minor units", () => {
  const split = excessSplit(2_000_001, review)
  expect(split?.orderAmountMinor).toBe(500_000)
  expect(split?.excessMinor).toBe(1_500_001)
  expect((split?.orderAmountMinor ?? 0) + (split?.excessMinor ?? 0)).toBe(
    2_000_001,
  )
  // The exact snapshot goes back unchanged, including the millisecond date.
  expect(split?.allocationReview).toEqual({
    orderAmountMinor: 500_000,
    ...review,
  })
  expect(split?.allocationReview.expectedOrderUpdatedAt.getTime()).toBe(
    review.expectedOrderUpdatedAt.getTime(),
  )
})

test("an amount within the balance, or an invalid one, has no split", () => {
  expect(excessSplit(500_000, review)).toBeNull()
  expect(excessSplit(1, review)).toBeNull()
  expect(excessSplit(null, review)).toBeNull()
  expect(excessSplit(0, review)).toBeNull()
  expect(excessSplit(500_000.5, review)).toBeNull()
  expect(excessSplit(MAX_RECEIVED_MINOR + 1, review)).toBeNull()
})

test("an Order already paid in full sends everything to credit", () => {
  const paid = { ...review, expectedOrderPaidMinor: 1_500_000 }
  const split = excessSplit(300_000, paid)
  expect(split?.orderAmountMinor).toBe(0)
  expect(split?.excessMinor).toBe(300_000)
})

test("the customer's choice shows as a request, not an outcome", () => {
  expect(
    customerPreferenceFacts(
      { allocationPreference: null, requestedApplyMinor: null },
      "NGN",
    ),
  ).toEqual([])
  const facts = customerPreferenceFacts(
    { allocationPreference: "REFUND", requestedApplyMinor: "500000" },
    "NGN",
  )
  expect(facts.map((fact) => fact.label)).toEqual([
    "Customer asked",
    "Asked to apply to Order",
  ])
  expect(facts[0]?.value).toBe("Refund the extra")
  expect(
    customerPreferenceFacts(
      { allocationPreference: "CREDIT", requestedApplyMinor: "-1" },
      "NGN",
    ),
  ).toHaveLength(1)
  expect(excessTreatmentText("REFUND", "₦5,000")).toContain("No money is sent")
  expect(excessTreatmentText("CREDIT", "₦5,000")).toContain(
    "Nothing is returned",
  )
})

const saved = (
  allocation: Partial<ConfirmedAllocation> | null,
): ReturnType<typeof savedAllocationOutcome> =>
  savedAllocationOutcome(
    allocation && {
      receivedAmountMinor: 2_000_000,
      orderAmountMinor: 500_000,
      excessAmountMinor: 1_500_000,
      refundState: null,
      excessResolution: "held_credit",
      ...allocation,
    },
    "ORD-7",
    "NGN",
  )
const value = (
  outcome: ReturnType<typeof savedAllocationOutcome>,
  label: string,
) => outcome.facts.find((fact) => fact.label === label)?.value

test("an unknown saved breakdown claims nothing", () => {
  const unknown = saved(null)
  expect(unknown).toMatchObject({
    known: false,
    hasExtra: false,
    recordedOn: "on ORD-7",
    actionNeeded: false,
    canOpenRefund: false,
  })
  expect(unknown.facts).toEqual([])
})

test("partial and full payments with no extra show no extra section", () => {
  for (const received of [300_000, 500_000]) {
    const outcome = saved({
      receivedAmountMinor: received,
      orderAmountMinor: received,
      excessAmountMinor: 0,
      excessResolution: null,
    })
    expect(outcome).toMatchObject({
      known: true,
      hasExtra: false,
      recordedOn: "on ORD-7",
      actionNeeded: false,
      canOpenRefund: false,
    })
    expect(outcome.facts).toEqual([])
  }
})

test("held credit shows the saved split, not a local one", () => {
  const outcome = saved({})
  expect(outcome.recordedOn).toBe(
    "for ORD-7, with the extra kept as customer credit",
  )
  expect(value(outcome, "You received")).toBe(
    formatMinorMoney(2_000_000, "NGN"),
  )
  expect(value(outcome, "Applied to ORD-7")).toBe(
    formatMinorMoney(500_000, "NGN"),
  )
  expect(value(outcome, "Kept as customer credit")).toBe(
    formatMinorMoney(1_500_000, "NGN"),
  )
  expect(value(outcome, "Refund")).toBe("Not requested")
  expect(outcome).toMatchObject({ actionNeeded: false, canOpenRefund: false })
  expect(outcome.note).toBeNull()
  // Received with nothing left to pay: all of it is credit.
  expect(
    value(
      saved({ orderAmountMinor: 0, excessAmountMinor: 2_000_000 }),
      "Applied to ORD-7",
    ),
  ).toBe(formatMinorMoney(0, "NGN"))
})

test("each saved refund state reads as itself", () => {
  const requested = saved({
    excessResolution: "refund_requested",
    refundState: "REQUESTED",
  })
  expect(value(requested, "Refund")).toBe(
    "Requested · waiting for Finance review",
  )
  expect(requested).toMatchObject({ actionNeeded: true, canOpenRefund: true })
  expect(requested.note).toContain("No money has been sent")

  const reserved = saved({
    excessResolution: "refund_requested",
    refundState: "RESERVED",
  })
  expect(value(reserved, "Refund")).toBe("Approved · set aside, not sent yet")
  expect(value(reserved, "Refund")).not.toContain("waiting for Finance")
  expect(reserved).toMatchObject({ actionNeeded: true, canOpenRefund: true })

  const completed = saved({
    excessResolution: "refund_requested",
    refundState: "COMPLETED",
  })
  expect(value(completed, "Refund")).toBe("Returned · recorded by Finance")
  expect(value(completed, "Extra")).toBe(formatMinorMoney(1_500_000, "NGN"))
  expect(value(completed, "Kept as customer credit")).toBeUndefined()
  expect(completed.recordedOn).toBe(
    "for ORD-7, with the extra returned to the customer",
  )
  expect(completed).toMatchObject({ actionNeeded: false, canOpenRefund: true })

  const cancelled = saved({
    excessResolution: "refund_requested",
    refundState: "CANCELLED",
  })
  expect(value(cancelled, "Refund")).toBe("Cancelled · no money was sent")
  expect(cancelled.note).not.toContain("Finance review")
  expect(cancelled).toMatchObject({ actionNeeded: false, canOpenRefund: true })

  const odd = saved({ excessResolution: "refund_requested", refundState: null })
  expect(value(odd, "Refund")).toBe("Requested · status unavailable")
  expect(odd.actionNeeded).toBe(true)
})

test("a refund preference without details isn't 'no refund requested'", () => {
  const outcome = saved({ excessResolution: "refund_details_needed" })
  expect(value(outcome, "Refund")).toBe("Asked for · bank details not received")
  expect(outcome.note).toContain("no bank details were saved")
  expect(outcome).toMatchObject({ actionNeeded: true, canOpenRefund: false })
})

test("an undecided extra is held for the business to review", () => {
  const outcome = saved({ excessResolution: "business_review" })
  expect(value(outcome, "Kept as customer credit")).toBe(
    formatMinorMoney(1_500_000, "NGN"),
  )
  expect(value(outcome, "Refund")).toBe("Not requested")
  expect(outcome.note).toContain("for you to review")
  expect(outcome).toMatchObject({ actionNeeded: true, canOpenRefund: false })
})
