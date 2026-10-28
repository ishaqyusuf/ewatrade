import { describe, expect, test } from "bun:test"
import {
  allocationPreferenceWords,
  confirmedAllocationSummary,
  excessPlan,
  fundsSnapshotKey,
  nibssSessionIdProblem,
} from "./excess-allocation-model"

const updatedAt = new Date("2026-10-28T09:00:00Z")
const snapshot = {
  expectedCustomerFundsAccountId: "acc_1",
  expectedCustomerFundsRevision: "7",
  expectedOrderUpdatedAt: updatedAt,
  expectedOrderTotalMinor: 1_500_000,
  expectedOrderPaidMinor: 500_000,
}
const order = {
  totalMinor: 1_500_000,
  paidMinor: 500_000,
  balanceMinor: 1_000_000,
}

describe("received more than the balance", () => {
  test("up to the balance is the ordinary record", () => {
    for (const receivedMinor of [null, 0, 400_000, 1_000_000])
      expect(excessPlan({ receivedMinor, order, snapshot })).toEqual({
        kind: "none",
      })
  })
  test("splits exactly as the server requires: received = order + held", () => {
    const plan = excessPlan({ receivedMinor: 2_000_000, order, snapshot })
    expect(plan).toEqual({
      kind: "excess",
      receivedMinor: 2_000_000,
      applyMinor: 1_000_000,
      heldMinor: 1_000_000,
      allocationReview: { orderAmountMinor: 1_000_000, ...snapshot },
    })
  })
  test("a fully paid Order keeps everything as the customer's money", () => {
    const paid = { totalMinor: 500_000, paidMinor: 500_000, balanceMinor: 0 }
    const plan = excessPlan({
      receivedMinor: 300_000,
      order: paid,
      snapshot: {
        ...snapshot,
        expectedOrderTotalMinor: 500_000,
        expectedOrderPaidMinor: 500_000,
      },
    })
    expect(plan).toMatchObject({ applyMinor: 0, heldMinor: 300_000 })
  })
  test("no snapshot is never treated as a known zero", () => {
    for (const missing of [null, undefined])
      expect(
        excessPlan({ receivedMinor: 2_000_000, order, snapshot: missing }),
      ).toEqual({ kind: "unavailable" })
  })
  test("a snapshot that disagrees with the report needs a refresh", () => {
    expect(
      excessPlan({
        receivedMinor: 2_000_000,
        order: { ...order, paidMinor: 600_000, balanceMinor: 900_000 },
        snapshot,
      }),
    ).toEqual({ kind: "changed" })
  })
})

describe("snapshot key", () => {
  test("changes with any snapshot fact", () => {
    const key = fundsSnapshotKey(snapshot)
    expect(fundsSnapshotKey(null)).toBe("none")
    for (const change of [
      { expectedCustomerFundsAccountId: "acc_2" },
      { expectedCustomerFundsRevision: "8" },
      { expectedOrderUpdatedAt: new Date("2026-10-28T09:00:01Z") },
      { expectedOrderTotalMinor: 1_600_000 },
      { expectedOrderPaidMinor: 600_000 },
    ])
      expect(fundsSnapshotKey({ ...snapshot, ...change })).not.toBe(key)
  })
})

describe("customer preference and NIBSS session IDs", () => {
  const money = (minor: number) => `₦${minor / 100}`
  test("a refund preference reads as a request, never an approval", () => {
    expect(allocationPreferenceWords("REFUND", null, money)).toContain(
      "not an approved refund",
    )
    expect(allocationPreferenceWords("CREDIT", "500000", money)).toContain(
      "₦5000",
    )
    expect(allocationPreferenceWords(null, null, money)).toBeNull()
    expect(allocationPreferenceWords("CREDIT", "-5", money)).not.toContain("₦")
  })
  test("accepts exactly 30 digits", () => {
    expect(nibssSessionIdProblem("0".repeat(30))).toBeNull()
    expect(nibssSessionIdProblem(` ${"1".repeat(30)} `)).toBeNull()
    expect(nibssSessionIdProblem("1".repeat(29))).toContain("has 29")
    expect(nibssSessionIdProblem("1234 5678")).toBe(
      "Use digits only, no spaces.",
    )
    expect(nibssSessionIdProblem("")).toContain("Enter the NIBSS")
  })
})

describe("saved split of a confirmed payment", () => {
  const base = {
    receivedAmountMinor: 2_000_000,
    orderAmountMinor: 1_500_000,
    excessAmountMinor: 500_000,
    refundState: null,
    excessResolution: "held_credit" as const,
  }
  test("shows only the server's amounts, with the extra when there is one", () => {
    expect(confirmedAllocationSummary(base).rows).toEqual([
      { label: "Received in this payment", minor: 2_000_000 },
      { label: "Went to the Order", minor: 1_500_000 },
      { label: "Kept as customer money", minor: 500_000 },
    ])
    const exact = confirmedAllocationSummary({
      ...base,
      orderAmountMinor: 2_000_000,
      excessAmountMinor: 0,
      excessResolution: null,
    })
    expect(exact.rows).toHaveLength(2)
    expect(exact.extra).toBeNull()
  })
  test("reads each refund state separately; a request isn't held or sent", () => {
    const words = (refundState: string) =>
      confirmedAllocationSummary({
        ...base,
        refundState,
        excessResolution: "refund_requested",
      }).extra
    expect(words("REQUESTED")).toContain("isn’t held or sent")
    expect(words("RESERVED")).toContain("hasn’t been recorded as sent")
    expect(words("COMPLETED")).toContain("recorded as returned")
    expect(words("CANCELLED")).toContain("holds nothing")
    expect(words("SOMETHING")).toBe("Refund request: SOMETHING.")
  })
  test("without a request, says what the customer chose", () => {
    expect(
      confirmedAllocationSummary({
        ...base,
        excessResolution: "refund_details_needed",
      }).extra,
    ).toContain("bank details are needed")
  })
})
