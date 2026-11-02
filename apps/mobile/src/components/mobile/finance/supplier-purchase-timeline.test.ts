import { describe, expect, it } from "bun:test"
import { purchasePaymentsTimeline } from "./supplier-purchase-timeline"

const payment = (id: string, day: number, reversedDay?: number) => ({
  id,
  amountMinor: "1200000",
  effectiveAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  reference: id === "p1" ? "RCPT-1" : null,
  reversedAt: reversedDay
    ? `2026-10-${String(reversedDay).padStart(2, "0")}T12:00:00.000Z`
    : null,
  reversalEffectiveAt: null,
  account: { name: "Cash box" },
})

const release = {
  id: "r1",
  amountMinor: "500000",
  effectiveAt: "2026-10-09T10:00:00.000Z",
  reason: "Wrong purchase",
}

const allocation = {
  id: "a1",
  amountMinor: "2000000",
  effectiveAt: "2026-10-08T10:00:00.000Z",
  releases: [release],
}

const purchase = {
  id: "bill-1",
  totalMinor: "4500000",
  incurredAt: "2026-10-04T10:00:00.000Z",
  reference: "INV-3391",
}

describe("purchase payments and advances timeline", () => {
  it("merges payments, reversals, allocations and releases newest first, purchase last", () => {
    const rows = purchasePaymentsTimeline({
      payments: [payment("p1", 5), payment("p2", 6, 6)],
      allocations: [allocation],
      voided: false,
      purchase,
    })
    expect(rows.map((row) => row.id)).toEqual([
      "release:r1",
      "allocation:a1",
      "payment-reversal:p2",
      "payment:p2",
      "payment:p1",
      "purchase:bill-1",
    ])
    expect(rows.find((row) => row.id === "payment:p2")).toMatchObject({
      dot: "muted",
      status: "Reversed",
      action: undefined,
    })
    expect(rows.find((row) => row.id === "payment-reversal:p2")).toMatchObject({
      negative: true,
      dot: "warn",
    })
    expect(rows.at(-1)).toMatchObject({
      title: "Purchase recorded",
      detail: "INV-3391",
      amountMinor: "4500000",
    })
  })

  it("keeps every correction action on the row it belongs to", () => {
    const rows = purchasePaymentsTimeline({
      payments: [payment("p1", 5), payment("p2", 6, 7)],
      allocations: [allocation],
      voided: false,
      purchase,
    })
    const actions = rows.flatMap((row) =>
      row.action
        ? [
            row.action.kind === "release"
              ? `${row.id}:release:${row.action.allocation.id}`
              : `${row.id}:reverse:${row.action.payment.id}`,
          ]
        : [],
    )
    // p2 is reversed, so only p1 can be reversed; a1 is part released.
    expect(actions).toEqual([
      "allocation:a1:release:a1",
      "payment:p1:reverse:p1",
    ])
  })

  it("drops release once fully released or the purchase is cancelled", () => {
    const fullyReleased = purchasePaymentsTimeline({
      payments: [],
      allocations: [
        {
          ...allocation,
          releases: [{ ...release, amountMinor: "2000000" }],
        },
      ],
      voided: false,
      purchase,
    })
    expect(
      fullyReleased.find((row) => row.id === "allocation:a1"),
    ).toMatchObject({
      dot: "muted",
      status: "Released",
      action: undefined,
    })
    const cancelled = purchasePaymentsTimeline({
      payments: [payment("p1", 5)],
      allocations: [allocation],
      voided: true,
      purchase,
    })
    expect(
      cancelled.find((row) => row.id === "allocation:a1")?.action,
    ).toBeUndefined()
    // Reversing a payment on a cancelled purchase stayed available before.
    expect(cancelled.find((row) => row.id === "payment:p1")?.action?.kind).toBe(
      "reverse-payment",
    )
    expect(cancelled.at(-1)).toMatchObject({
      status: "Cancelled",
      dot: "muted",
    })
  })
})
