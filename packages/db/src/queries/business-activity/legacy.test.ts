import { expect, test } from "bun:test"
import { presentLegacyBusinessActivity } from "./legacy"

test("legacy Order facts never fabricate original mutable fields or a Walk-in customer", () => {
  const result = presentLegacyBusinessActivity(
    "order.recorded",
    { orderId: "order", orderNumber: "ORD-1" },
    "Unknown person",
  )
  expect(result?.amount).toBeNull()
  expect(result?.statusAtEvent).toBeNull()
  expect(result?.detail).not.toBe("Walk-in")
  expect(result?.target).toEqual({ kind: "order", id: "order" })
  expect(
    presentLegacyBusinessActivity(
      "order.recorded",
      {
        orderId: "order",
        orderNumber: "ORD-1",
        customerEmail: "private@example.test",
      },
      "Unknown person",
    ),
  ).toBeNull()
})
test("legacy payment has original exact money and its own refund identity; private raw fields are rejected", () => {
  const payload = {
    orderId: "order",
    orderNumber: "ORD-1",
    paymentId: "refund",
    method: "CASH",
    amount: { minor: "12500", currencyCode: "NGN" },
  }
  const result = presentLegacyBusinessActivity(
    "payment.refund_recorded",
    payload,
    "Recorded cashier",
  )
  expect(result?.amount).toEqual({ minor: "-12500", currencyCode: "NGN" })
  expect(result?.detail).toBe("Cash")
  expect(result?.summary).toContain("refund")
  expect(result?.statusAtEvent).toBeNull()
  expect(
    presentLegacyBusinessActivity(
      "payment.recorded",
      { ...payload, note: "private" },
      "Recorded cashier",
    ),
  ).toBeNull()
})

test("legacy payment/refund signs are exact, stable on already signed facts and never mutate source", () => {
  for (const minor of ["0", "9007199254740993", "-15000"]) {
    const payload = {
      orderId: "order",
      orderNumber: "ORD-039",
      paymentId: "payment",
      method: "BANK_TRANSFER",
      amount: { minor, currencyCode: "NGN" },
    }
    const refund = presentLegacyBusinessActivity(
      "payment.refund_recorded",
      payload,
      "Cashier",
    )
    expect(refund?.amount?.minor).toBe(
      (BigInt(minor) > 0n ? -BigInt(minor) : BigInt(minor)).toString(),
    )
    expect(refund?.detail).toBe("Bank transfer")
    expect(
      presentLegacyBusinessActivity("payment.recorded", payload, "Cashier")
        ?.amount?.minor,
    ).toBe(minor)
    expect(payload.amount.minor).toBe(minor)
  }
})
