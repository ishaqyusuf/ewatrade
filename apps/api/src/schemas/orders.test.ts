import { describe, expect, test } from "bun:test"

import {
  commercialOrderCreateSchema,
  commercialOrderFulfillProductsSchema,
  commercialOrderListPageSchema,
  commercialOrderPaymentSchema,
  commercialOrderReminderSettingsUpdateSchema,
} from "./orders"

describe("commercial Order list schema", () => {
  test("accepts cursor pagination and server-side list filters", () => {
    const result = commercialOrderListPageSchema.parse({
      createdAfter: "2026-07-01T00:00:00.000Z",
      cursor: "order-cursor-1",
      direction: "forward",
      limit: 20,
      query: "ada",
      statuses: ["PENDING", "COMPLETED"],
    })

    expect(result.cursor).toBe("order-cursor-1")
    expect(result.direction).toBe("forward")
    expect(result.limit).toBe(20)
    expect(result.statuses).toEqual(["PENDING", "COMPLETED"])
  })
})

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

describe("commercial Order scheduling schema", () => {
  test("accepts delivery scheduling, checkout payment, and immediate fulfillment intent", () => {
    const result = commercialOrderCreateSchema.parse({
      clientOrderId: "order-command-001",
      deliveryDueAt: "2026-07-26T14:30:00.000Z",
      fulfillNow: false,
      initialPayment: {
        amountMinor: 25_000,
        clientPaymentId: "payment-command-003",
        method: "cash",
      },
      lines: [{ offeringId: "offering-1", quantity: "2" }],
      schemaVersion: 1,
    })

    expect(result.deliveryDueAt).toEqual(new Date("2026-07-26T14:30:00.000Z"))
    expect(result.initialPayment?.amountMinor).toBe(25_000)
    expect(result.fulfillNow).toBe(false)
  })

  test("accepts configurable same-day and day-before reminders", () => {
    expect(
      commercialOrderReminderSettingsUpdateSchema.parse({
        dayBeforeEnabled: true,
        enabled: true,
        sameDayEnabled: false,
      }),
    ).toEqual({
      dayBeforeEnabled: true,
      enabled: true,
      sameDayEnabled: false,
    })
  })
})

describe("commercial Order bulk fulfillment schema", () => {
  test("accepts one idempotent command for all Product lines", () => {
    expect(
      commercialOrderFulfillProductsSchema.parse({
        clientOperationId: "fulfillment-all-001",
        orderId: "order-001",
        schemaVersion: 1,
      }),
    ).toEqual({
      clientOperationId: "fulfillment-all-001",
      orderId: "order-001",
      schemaVersion: 1,
    })
  })
})
