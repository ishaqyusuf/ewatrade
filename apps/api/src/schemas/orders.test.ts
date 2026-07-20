import { describe, expect, test } from "bun:test"

import { commercialOrderPaymentSchema } from "./orders"

describe("commercial Order payment schema", () => {
  test("accepts a deposit payment with an external reference", () => {
    const result = commercialOrderPaymentSchema.parse({
      amountMinor: 25_000,
      clientPaymentId: "payment-command-001",
      method: "bank_transfer",
      orderId: "order-1",
      reference: "TRANSFER-2240",
    })

    expect(result.amountMinor).toBe(25_000)
    expect(result.method).toBe("bank_transfer")
  })

  test("rejects a zero-value collection", () => {
    expect(() =>
      commercialOrderPaymentSchema.parse({
        amountMinor: 0,
        clientPaymentId: "payment-command-002",
        method: "cash",
        orderId: "order-1",
      }),
    ).toThrow()
  })
})
