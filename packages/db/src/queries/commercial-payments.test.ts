import { describe, expect, test } from "bun:test"

import { PaymentStatus } from "../../generated/prisma/enums"
import {
  effectiveCommercialAmountPaid,
  summarizeCommercialPayment,
} from "./commercial-payments"

describe("summarizeCommercialPayment", () => {
  test("keeps a deposit separate from the outstanding balance", () => {
    expect(
      summarizeCommercialPayment({
        amountPaidMinor: 40_000,
        totalMinor: 97_500,
      }),
    ).toEqual({
      amountPaidMinor: 40_000,
      balanceDueMinor: 57_500,
      paymentStatus: "partially_paid",
    })
  })

  test("marks a fully settled order as paid", () => {
    expect(
      summarizeCommercialPayment({
        amountPaidMinor: 97_500,
        totalMinor: 97_500,
      }),
    ).toEqual({
      amountPaidMinor: 97_500,
      balanceDueMinor: 0,
      paymentStatus: "paid",
    })
  })

  test("preserves legacy paid orders that predate payment rows", () => {
    expect(
      effectiveCommercialAmountPaid({
        amountPaidMinor: 0,
        paymentCount: 0,
        paymentStatus: PaymentStatus.PAID,
        totalMinor: 97_500,
      }),
    ).toBe(97_500)
  })
})
