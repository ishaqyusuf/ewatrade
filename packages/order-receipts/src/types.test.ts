import { describe, expect, test } from "bun:test"
import {
  defaultReceiptSettings,
  readReceiptSettings,
  receiptFileStem,
  receiptMoney,
  receiptPaymentLabel,
  receiptSettingsSchema,
} from "./types"

describe("Order receipt facts and defaults", () => {
  test("rejects invalid or unsupported saved configuration", () => {
    expect(
      readReceiptSettings({
        orderReceiptSettings: { showCustomerName: "true" },
      }),
    ).toBeNull()
    expect(
      receiptSettingsSchema.safeParse({
        ...defaultReceiptSettings,
        template: "other",
      }).success,
    ).toBe(false)
    expect(
      receiptSettingsSchema.safeParse({
        ...defaultReceiptSettings,
        thankYouNote: "x".repeat(301),
      }).success,
    ).toBe(false)
    expect(
      readReceiptSettings({
        orderReceiptSettings: {
          ...defaultReceiptSettings,
          thankYouNote: "  Thanks!  ",
        },
      })?.thankYouNote,
    ).toBe("Thanks!")
  })
  test("keeps unpaid, part paid, paid, zero and refund states honest", () => {
    const state = {
      totalMinor: 10000,
      receivedMinor: 0,
      refundedMinor: 0,
      paymentCount: 1,
      sourcePaymentStatus: "PENDING",
    }
    expect(receiptPaymentLabel(state)).toBe("Unpaid")
    expect(receiptPaymentLabel({ ...state, receivedMinor: 4000 })).toBe(
      "Part paid",
    )
    expect(receiptPaymentLabel({ ...state, receivedMinor: 10000 })).toBe("Paid")
    expect(receiptPaymentLabel({ ...state, refundedMinor: 10000 })).toBe(
      "Refunded",
    )
    expect(receiptPaymentLabel({ ...state, totalMinor: 0 })).toBe(
      "No payment due",
    )
    expect(
      receiptPaymentLabel({
        ...state,
        paymentCount: 0,
        sourcePaymentStatus: "PAID",
      }),
    ).toBe("Historical payment details unavailable")
  })
  test("keeps monetary source units and file names safe", () => {
    expect(receiptMoney(3450000, "NGN")).toBe("₦34,500.00")
    expect(receiptFileStem("EO/../weird")).toBe("receipt-EO____weird")
  })
})
