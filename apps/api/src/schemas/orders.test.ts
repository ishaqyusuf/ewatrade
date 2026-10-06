import { describe, expect, test } from "bun:test"

import {
  commercialOrderAuthorizeChargeOnlyServiceLineSchema,
  commercialOrderCreateSchema,
  commercialOrderFulfillChargeOnlyServiceLineSchema,
  commercialOrderFulfillProductsSchema,
  commercialOrderListPageSchema,
  commercialOrderPaymentSchema,
  commercialOrderPaymentsListPageSchema,
  commercialOrderReminderSettingsUpdateSchema,
  commercialOrderReportSummarySchema,
} from "./orders"

test("order-time totals and notes reject forged prices/authority and invalid money", () => {
  const base = {
    clientOrderId: "manual-order-001",
    schemaVersion: 1,
    customerMode: "create",
    customerName: "QA Bird",
    lines: [
      {
        offeringId: "grown",
        quantity: "3",
        enteredTotalMinor: 10001,
        note: " Live birds ",
      },
    ],
  }
  expect(commercialOrderCreateSchema.parse(base).lines[0]).toMatchObject({
    enteredTotalMinor: 10001,
    note: "Live birds",
  })
  for (const amount of [
    0,
    -1,
    1.01,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    100000001,
  ])
    expect(
      commercialOrderCreateSchema.safeParse({
        ...base,
        lines: [{ ...base.lines[0], enteredTotalMinor: amount }],
      }).success,
    ).toBe(false)
  for (const fields of [
    { unitPriceMinor: 1 },
    { trustedUnitPriceMinor: 1 },
    { tenantId: "forged" },
    { note: "x".repeat(2001) },
  ])
    expect(
      commercialOrderCreateSchema.safeParse({
        ...base,
        lines: [{ ...base.lines[0], ...fields }],
      }).success,
    ).toBe(false)
})

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

describe("commercial Order report summary schema", () => {
  test("accepts a Store filter while retaining tenant-wide calls", () => {
    expect(commercialOrderReportSummarySchema.parse({})).toEqual({})
    expect(
      commercialOrderReportSummarySchema.parse({ storeId: " store_123 " }),
    ).toEqual({ storeId: "store_123" })
    expect(
      commercialOrderReportSummarySchema.safeParse({ storeId: " " }).success,
    ).toBe(false)
    expect(
      commercialOrderReportSummarySchema.safeParse({ tenantId: "forged" })
        .success,
    ).toBe(false)
  })
})

describe("commercial Order payment schema", () => {
  test("accepts the infinite-query pagination direction", () => {
    expect(
      commercialOrderPaymentsListPageSchema.parse({
        direction: "forward",
        limit: 20,
      }),
    ).toMatchObject({ direction: "forward", limit: 20 })
  })

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

describe("charge-only Service-line fulfillment schema", () => {
  const command = {
    clientOperationId: "fulfill-service-001",
    orderLineId: "order-line-1",
    reason: "Service completed and authorized",
    schemaVersion: 1,
  } as const

  test("accepts and trims the exact command contract", () => {
    expect(
      commercialOrderFulfillChargeOnlyServiceLineSchema.parse({
        ...command,
        clientOperationId: "  fulfill-service-001  ",
        orderLineId: " order-line-1 ",
        reason: " Service completed and authorized ",
      }),
    ).toEqual(command)
  })

  test("enforces field bounds and excludes forged authority or fulfillment facts", () => {
    expect(
      commercialOrderFulfillChargeOnlyServiceLineSchema.safeParse(command)
        .success,
    ).toBe(true)

    for (const invalid of [
      { ...command, schemaVersion: 2 },
      { ...command, orderLineId: " " },
      { ...command, orderLineId: "x".repeat(129) },
      { ...command, clientOperationId: "short" },
      { ...command, clientOperationId: "x".repeat(161) },
      { ...command, reason: "   " },
      { ...command, reason: "x".repeat(501) },
      { ...command, tenantId: "caller-tenant" },
      { ...command, actorUserId: "caller-actor" },
      { ...command, quantity: "1" },
      { ...command, performedAt: "2026-10-01T10:00:00.000Z" },
    ]) {
      expect(
        commercialOrderFulfillChargeOnlyServiceLineSchema.safeParse(invalid)
          .success,
      ).toBe(false)
    }
  })
})

describe("charge-only Service-line authorization schema", () => {
  const command = {
    clientOperationId: "authorize-service-001",
    orderLineId: "order-line-1",
    reason: "Customer requested release",
    schemaVersion: 1,
  } as const

  test("accepts and trims the exact command contract", () => {
    expect(
      commercialOrderAuthorizeChargeOnlyServiceLineSchema.parse({
        ...command,
        clientOperationId: "  authorize-service-001  ",
        orderLineId: " order-line-1 ",
        reason: " Customer requested release ",
      }),
    ).toEqual(command)
  })

  test("enforces bounds and rejects forged authority, quantity, date, or policy", () => {
    for (const invalid of [
      { ...command, schemaVersion: 2 },
      { ...command, orderLineId: " " },
      { ...command, orderLineId: "x".repeat(129) },
      { ...command, clientOperationId: "short" },
      { ...command, clientOperationId: "x".repeat(161) },
      { ...command, reason: " " },
      { ...command, reason: "x".repeat(501) },
      { ...command, tenantId: "caller-tenant" },
      { ...command, actorUserId: "caller-actor" },
      { ...command, quantity: "1" },
      { ...command, authorizedAt: "2026-10-01T10:00:00.000Z" },
      { ...command, serviceAuthorizationPolicy: "MANUAL_RELEASE" },
    ]) {
      expect(
        commercialOrderAuthorizeChargeOnlyServiceLineSchema.safeParse(invalid)
          .success,
      ).toBe(false)
    }
  })
})
