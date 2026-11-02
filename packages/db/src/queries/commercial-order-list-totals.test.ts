import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { getCommercialOrderListTotals } from "./commercial-order-list-totals"

type GroupRow = {
  currencyCode: string
  status: string
  paymentStatus: string
  _count: { _all: number }
  _sum: { totalMinor: number | null; amountPaidMinor?: number | null }
}

function fixture(all: GroupRow[], owing: GroupRow[]) {
  const queries: Array<{ where: Record<string, unknown> }> = []
  const db = {
    commercialOrder: {
      fields: { totalMinor: "field:totalMinor" },
      groupBy: async (query: { where: Record<string, unknown> }) => {
        queries.push(query)
        return queries.length === 1 ? all : owing
      },
    },
  }
  return { db: db as unknown as PrismaClient, queries }
}

const row = (
  currencyCode: string,
  status: string,
  paymentStatus: string,
  count: number,
  total: number,
  paid?: number,
): GroupRow => ({
  currencyCode,
  status,
  paymentStatus,
  _count: { _all: count },
  _sum: { totalMinor: total, amountPaidMinor: paid ?? null },
})

test("totals keep currencies apart and derive paid from what is still owed", async () => {
  const state = fixture(
    [
      row("NGN", "COMPLETED", "PAID", 3, 90_000),
      row("NGN", "CONFIRMED", "PARTIALLY_PAID", 2, 40_000),
      row("USD", "CONFIRMED", "PENDING", 1, 2_500),
    ],
    [
      row("NGN", "CONFIRMED", "PARTIALLY_PAID", 2, 40_000, 15_000),
      row("USD", "CONFIRMED", "PENDING", 1, 2_500, 0),
    ],
  )
  const totals = await getCommercialOrderListTotals(state.db, {
    tenantId: "tenant",
  })
  expect(totals.orderCount).toBe(6)
  expect(totals.groups).toEqual([
    {
      currencyCode: "NGN",
      status: "COMPLETED",
      paymentStatus: "PAID",
      orderCount: 3,
      orderValueMinor: 90_000,
      outstandingCount: 0,
      outstandingMinor: 0,
      paidMinor: 90_000,
    },
    {
      currencyCode: "NGN",
      status: "CONFIRMED",
      paymentStatus: "PARTIALLY_PAID",
      orderCount: 2,
      orderValueMinor: 40_000,
      outstandingCount: 2,
      outstandingMinor: 25_000,
      paidMinor: 15_000,
    },
    {
      currencyCode: "USD",
      status: "CONFIRMED",
      paymentStatus: "PENDING",
      orderCount: 1,
      orderValueMinor: 2_500,
      outstandingCount: 1,
      outstandingMinor: 2_500,
      paidMinor: 0,
    },
  ])
})

test("totals use the list's scope, dates, search and payment filters", async () => {
  const state = fixture([], [])
  const createdAfter = new Date("2026-10-01T00:00:00.000Z")
  await getCommercialOrderListTotals(state.db, {
    createdAfter,
    createdByUserId: "rep",
    paymentStatuses: ["PENDING"],
    query: "ada",
    storeId: "store",
    tenantId: "tenant",
  })
  const scope = {
    createdAt: { gte: createdAfter },
    createdByUserId: "rep",
    paymentStatus: { in: ["PENDING"] },
    storeId: "store",
    tenantId: "tenant",
  }
  expect(state.queries[0]?.where).toMatchObject(scope)
  expect(state.queries[0]?.where.OR).toBeArray()
  // The owed query narrows the same filter: paid below total, not legacy-paid.
  expect(state.queries[1]?.where).toEqual({
    AND: [
      state.queries[0]?.where,
      { amountPaidMinor: { lt: "field:totalMinor" } },
      {
        NOT: {
          amountPaidMinor: 0,
          paymentStatus: "PAID",
          payments: { none: {} },
        },
      },
    ],
  })
})
