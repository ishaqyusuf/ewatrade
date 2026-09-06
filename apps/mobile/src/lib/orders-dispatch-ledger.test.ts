import { describe, expect, it } from "bun:test"
import {
  buildOrdersDispatchSummary,
  getOrderDispatchPresentation,
  orderDispatchDateLabel,
} from "./orders-dispatch-ledger"

const confirmedOrder = {
  currencyCode: "NGN",
  lines: [{ kind: "product" }],
  paymentStatus: "PAID",
  status: "CONFIRMED",
  totalMinor: 48_500_00,
}
const readyOrder = {
  currencyCode: "NGN",
  paymentStatus: "PARTIALLY_PAID",
  status: "READY_FOR_PICKUP",
  totalMinor: 126_000_00,
}
const completedOrder = {
  currencyCode: "NGN",
  paymentStatus: "PENDING",
  status: "COMPLETED",
  totalMinor: 18_400_00,
}
const orders = [confirmedOrder, readyOrder, completedOrder]

describe("orders dispatch ledger", () => {
  it("derives loaded totals without counting provisional work", () => {
    expect(buildOrdersDispatchSummary(orders)).toEqual({
      loadedValue: "₦192,900",
      openCount: 1,
      readyCount: 1,
    })
  })

  it("does not combine incompatible currencies", () => {
    expect(
      buildOrdersDispatchSummary([
        confirmedOrder,
        { ...readyOrder, currencyCode: "USD" },
      ]).loadedValue,
    ).toBe("Mixed currencies")
  })

  it("maps truthful operational copy from order state", () => {
    expect(getOrderDispatchPresentation(confirmedOrder)).toEqual({
      actionLabel: "Pack next",
      paymentLabel: "Paid",
      tone: "attention",
    })
    expect(getOrderDispatchPresentation(readyOrder)).toEqual({
      actionLabel: "Ready",
      paymentLabel: "Partially paid",
      tone: "ready",
    })
    expect(getOrderDispatchPresentation(completedOrder)).toEqual({
      actionLabel: "Completed",
      paymentLabel: "Payment pending",
      tone: "done",
    })
    expect(
      getOrderDispatchPresentation({
        ...confirmedOrder,
        paymentStatus: "AUTHORIZED",
      }).paymentLabel,
    ).toBe("Authorized")
    expect(
      getOrderDispatchPresentation({
        ...confirmedOrder,
        paymentStatus: "FAILED",
      }).paymentLabel,
    ).toBe("Payment failed")
    expect(
      getOrderDispatchPresentation({
        ...confirmedOrder,
        lines: [{ kind: "service" }],
      }),
    ).toEqual({
      actionLabel: "Confirmed",
      paymentLabel: "Paid",
      tone: "pending",
    })
  })

  it("labels the active query window instead of pretending it is today", () => {
    expect(orderDispatchDateLabel("30_days")).toBe("Last 30 days")
    expect(orderDispatchDateLabel("today")).toBe("Today’s dispatch")
    expect(orderDispatchDateLabel("all")).toBe("All dispatch")
  })
})
