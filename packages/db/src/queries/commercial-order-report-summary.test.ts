import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"

import { getCommercialOrderReportSummary } from "./commercial-orders"

describe("Commercial Order report summary", () => {
  test("counts and totals every tenant Order in one aggregate read", async () => {
    const calls: unknown[] = []
    const db = {
      commercialOrder: {
        aggregate: async (input: unknown) => {
          calls.push(input)
          return {
            _count: { _all: 147 },
            _sum: { totalMinor: 9_875_000 },
          }
        },
      },
    } as unknown as PrismaClient

    await expect(
      getCommercialOrderReportSummary(db, { tenantId: "tenant_123" }),
    ).resolves.toEqual({ orderCount: 147, orderValueMinor: 9_875_000 })
    expect(calls).toEqual([
      {
        _count: { _all: true },
        _sum: { totalMinor: true },
        where: { tenantId: "tenant_123" },
      },
    ])
  })

  test("returns zero values when the tenant has no Orders", async () => {
    const db = {
      commercialOrder: {
        aggregate: async () => ({
          _count: { _all: 0 },
          _sum: { totalMinor: null },
        }),
      },
    } as unknown as PrismaClient

    await expect(
      getCommercialOrderReportSummary(db, { tenantId: "tenant_empty" }),
    ).resolves.toEqual({ orderCount: 0, orderValueMinor: 0 })
  })

  test("keeps a Store report scoped to its tenant without a list limit", async () => {
    const calls: unknown[] = []
    const db = {
      commercialOrder: {
        aggregate: async (input: unknown) => {
          calls.push(input)
          return { _count: { _all: 147 }, _sum: { totalMinor: 9_875_000 } }
        },
      },
    } as unknown as PrismaClient

    await expect(
      getCommercialOrderReportSummary(db, {
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).resolves.toEqual({ orderCount: 147, orderValueMinor: 9_875_000 })
    expect(calls).toEqual([
      {
        _count: { _all: true },
        _sum: { totalMinor: true },
        where: { storeId: "store_123", tenantId: "tenant_123" },
      },
    ])
  })
})

describe("Commercial Order report summary for a date window", () => {
  test("totals paid, outstanding and items with the serialized paid rule", async () => {
    const calls: Array<{ where: Record<string, unknown> }> = []
    const after = new Date("2026-10-08T00:00:00Z")
    const before = new Date("2026-10-09T00:00:00Z")
    const db = {
      commercialOrder: {
        findMany: async (input: { where: Record<string, unknown> }) => {
          calls.push(input)
          return [
            // Fully paid through payments.
            {
              _count: { payments: 1 },
              amountPaidMinor: 650_000,
              lines: [{ quantity: "10" }],
              paymentStatus: "PAID",
              payments: [
                { amountMinor: 650_000, method: "CASH", type: "PAYMENT" },
              ],
              totalMinor: 650_000,
            },
            // Part paid.
            {
              _count: { payments: 1 },
              amountPaidMinor: 200_000,
              lines: [{ quantity: "50" }],
              paymentStatus: "PARTIAL",
              payments: [
                {
                  amountMinor: 250_000,
                  method: "BANK_TRANSFER",
                  type: "PAYMENT",
                },
                {
                  amountMinor: 50_000,
                  method: "BANK_TRANSFER",
                  type: "REFUND",
                },
              ],
              totalMinor: 425_000,
            },
            // Legacy PAID with no payment rows counts as paid.
            {
              _count: { payments: 0 },
              amountPaidMinor: 0,
              lines: [{ quantity: "2" }, { quantity: "0.5" }],
              paymentStatus: "PAID",
              totalMinor: 280_000,
            },
          ]
        },
      },
    } as unknown as PrismaClient

    await expect(
      getCommercialOrderReportSummary(db, {
        createdAfter: after,
        createdBefore: before,
        statuses: ["COMPLETED"],
        tenantId: "tenant_123",
      }),
    ).resolves.toEqual({
      itemsSold: 62.5,
      orderCount: 3,
      orderValueMinor: 1_355_000,
      outstandingCount: 1,
      outstandingMinor: 225_000,
      paidByMethod: { BANK_TRANSFER: 200_000, CASH: 650_000, OTHER: 280_000 },
      paidMinor: 1_130_000,
      partial: false,
    })
    expect(calls[0]?.where).toEqual({
      createdAt: { gte: after, lt: before },
      createdByUserId: undefined,
      status: { in: ["COMPLETED"] },
      tenantId: "tenant_123",
    })
  })
})

test("date-window overflow is explicitly partial, never a complete total", async () => {
  const { REPORT_SUMMARY_WINDOW_LIMIT } = await import("./commercial-orders")
  let requested = 0
  const db = {
    commercialOrder: {
      findMany: async ({ take }: { take: number }) => {
        requested = take
        return Array.from({ length: REPORT_SUMMARY_WINDOW_LIMIT + 1 }, () => ({
          _count: { payments: 0 },
          amountPaidMinor: 0,
          lines: [],
          paymentStatus: "UNPAID",
          payments: [],
          totalMinor: 100,
        }))
      },
    },
  } as unknown as PrismaClient
  const summary = await getCommercialOrderReportSummary(db, {
    tenantId: "tenant",
    storeId: "store",
    createdAfter: new Date("2026-10-01T00:00:00Z"),
  })
  expect(requested).toBe(REPORT_SUMMARY_WINDOW_LIMIT + 1)
  expect(summary).toMatchObject({
    partial: true,
    orderCount: REPORT_SUMMARY_WINDOW_LIMIT,
  })
})
