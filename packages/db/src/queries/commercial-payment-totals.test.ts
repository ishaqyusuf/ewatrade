import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  commercialPaymentListWhere,
  getCommercialPaymentTotals,
} from "./commercial-payment-totals"

type Where = Record<string, unknown> & {
  AND?: Array<Record<string, unknown>>
}

function fixture(byCurrency: Record<string, Array<[string, number, number]>>) {
  const orderGroups: Where[] = []
  const paymentGroups: Where[] = []
  const db = {
    commercialOrder: {
      groupBy: async ({ where }: { where: Where }) => {
        orderGroups.push(where)
        return Object.keys(byCurrency).map((currencyCode) => ({
          currencyCode,
        }))
      },
    },
    commercialOrderPayment: {
      groupBy: async ({ where }: { where: Where }) => {
        paymentGroups.push(where)
        const currency = (
          where.AND?.[1] as { order: { is: { currencyCode: string } } }
        ).order.is.currencyCode
        return (byCurrency[currency] ?? []).map(([method, amount, count]) => ({
          method,
          _count: { _all: count },
          _sum: { amountMinor: amount },
        }))
      },
    },
    user: {
      findMany: async () => [{ id: "cashier-ada" }],
    },
  }
  return { db: db as unknown as PrismaClient, orderGroups, paymentGroups }
}

test("totals split by currency and method and skip currencies with no payments", async () => {
  const state = fixture({
    GHS: [],
    NGN: [
      ["BANK_TRANSFER", 70_000, 2],
      ["CASH", 30_000, 3],
    ],
    USD: [["CARD", 2_500, 1]],
  })
  expect(
    await getCommercialPaymentTotals(state.db, { tenantId: "tenant" }),
  ).toEqual({
    currencyTotals: [
      {
        byMethod: [
          { amountMinor: 70_000, count: 2, method: "BANK_TRANSFER" },
          { amountMinor: 30_000, count: 3, method: "CASH" },
        ],
        currencyCode: "NGN",
        totalAmountMinor: 100_000,
        totalCount: 5,
      },
      {
        byMethod: [{ amountMinor: 2_500, count: 1, method: "CARD" }],
        currencyCode: "USD",
        totalAmountMinor: 2_500,
        totalCount: 1,
      },
    ],
    totalCount: 6,
  })
})

test("dates, methods, search and Order scope reach every totals read", async () => {
  const state = fixture({ NGN: [] })
  const recordedAfter = new Date("2026-11-02T00:00:00.000Z")
  const recordedBefore = new Date("2026-11-03T00:00:00.000Z")
  await getCommercialPaymentTotals(state.db, {
    createdByUserId: "rep",
    methods: ["cash", "pos", "cash"],
    query: "ada",
    recordedAfter,
    recordedBefore,
    storeId: "store",
    tenantId: "tenant",
  })
  expect(state.orderGroups[0]).toEqual({
    tenantId: "tenant",
    storeId: "store",
    createdByUserId: "rep",
  })
  const filter = state.paymentGroups[0]?.AND?.[0]
  expect(filter).toMatchObject({
    tenantId: "tenant",
    order: {
      is: { tenantId: "tenant", storeId: "store", createdByUserId: "rep" },
    },
    type: "PAYMENT",
    method: { in: ["CASH", "POS"] },
    recordedAt: { gte: recordedAfter, lt: recordedBefore },
  })
  expect(filter?.OR).toContainEqual({
    recordedByUserId: { in: ["cashier-ada"] },
  })
})

test("without a method filter, customer-credit settlements stay out", async () => {
  const where = await commercialPaymentListWhere(fixture({}).db, {
    tenantId: "tenant",
  })
  expect(where).toMatchObject({
    method: { not: "CUSTOMER_CREDIT" },
    type: "PAYMENT",
  })
  expect(where).not.toHaveProperty("recordedAt")
  expect(where).not.toHaveProperty("OR")
})
