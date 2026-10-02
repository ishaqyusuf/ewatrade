import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  fulfillCommercialOrderProductLine,
  fulfillCommercialOrderProducts,
} from "./commercial-orders"

const tenantId = "tenant-a"
const orderId = "order-a"
const lineId = "line-a"
const reservationId = "reservation-a"
const actorUserId = "user-a"
const completedAt = new Date("2026-09-01T10:00:00.000Z")

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function stockOperationHash(clientOperationId: string) {
  return createHash("sha256")
    .update(
      stableJson({
        actorUserId,
        clientOperationId,
        operationType: "sale_fulfillment",
        reason: "Packing",
        reservationId,
        schemaVersion: 1,
        source: "commercial_order",
        tenantId,
      }),
    )
    .digest("hex")
}

type FixtureOptions = {
  hasFinanceBook?: boolean
  existingFulfillment?: boolean
}

function fulfillmentFixture(options: FixtureOptions = {}) {
  const events: string[] = []
  const rawCalls: Array<{ query: string; values: unknown[] }> = []
  const orderUpdates: Array<Record<string, unknown>> = []
  const commandRows = new Map<string, Record<string, unknown>>()
  let fulfillmentUpsertCount = 0
  let batchCommandCreateCount = 0

  const line = {
    id: lineId,
    orderId,
    order: {
      deliveryDueAt: null,
    },
    quantity: { toString: () => "2" },
    stockReservation: { id: reservationId, status: "ACTIVE" },
  }
  const order = {
    id: orderId,
    tenantId,
    customerId: "customer-a",
    currencyCode: "NGN",
    deliveryDueAt: null,
    status: "COMPLETED",
    completedAt,
    lines: [{ id: lineId }],
  }

  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("?")
      rawCalls.push({ query, values })
      if (query.includes('FROM "FinanceBook"')) {
        events.push("lock:finance-book")
        return options.hasFinanceBook === false ? [] : [{ id: "book-a" }]
      }
      if (query.includes('FROM "CustomerLedgerAccount"')) {
        events.push("lock:customer-account")
        return [{ id: "account-a" }]
      }
      if (query.includes('FROM "CommercialOrder"')) {
        events.push("lock:order")
        return [{ id: orderId }]
      }
      throw new Error(`Unexpected raw query: ${query}`)
    },
    commercialOrder: {
      findFirst: async (args: unknown) => {
        const query = args as { select?: Record<string, unknown> }
        events.push("read:order")
        if (query.select?.customerId && query.select?.currencyCode) {
          return { customerId: "customer-a", currencyCode: "NGN" }
        }
        if (query.select?.deliveryDueAt) {
          return {
            deliveryDueAt: null,
            id: orderId,
            lines: [{ id: lineId }],
            status: "COMPLETED",
          }
        }
        return order
      },
      findUniqueOrThrow: async () => {
        events.push("read:order-completion-time")
        return { completedAt, storeId: "store-a", tenantId }
      },
      update: async (args: unknown) => {
        const update = args as { data: Record<string, unknown> }
        events.push("write:order-status")
        orderUpdates.push(update.data)
        return order
      },
    },
    commercialOrderLine: {
      findFirst: async (args: unknown) => {
        const query = args as { select?: Record<string, unknown> }
        events.push("read:order-line")
        return query.select?.orderId ? { orderId } : line
      },
      findMany: async (args: unknown) => {
        const query = args as { include?: Record<string, unknown> }
        events.push("read:product-lines")
        if (query.include?.productFulfillments) {
          return [
            {
              ...line,
              productFulfillments: [],
            },
          ]
        }
        return [
          {
            kind: "PRODUCT_UNIT",
            quantity: { toString: () => "2" },
            productFulfillments: [{ quantity: { toString: () => "2" } }],
            serviceJobLines: [],
          },
        ]
      },
    },
    stockOperation: {
      findUnique: async (args: unknown) => {
        const query = args as {
          where: { tenantId_clientOperationId: { clientOperationId: string } }
        }
        const id = query.where.tenantId_clientOperationId.clientOperationId
        events.push(`read:stock-operation:${id}`)
        return {
          id: `operation:${id}`,
          payloadHash: stockOperationHash(id),
          movements: [],
        }
      },
    },
    productFulfillment: {
      findUnique: async () =>
        options.existingFulfillment === false ? null : { id: "fulfillment-a" },
      findFirst: async (args: unknown) => {
        expect(args).toMatchObject({
          where: {
            id: "fulfillment-a",
            orderLine: { order: { tenantId } },
          },
        })
        events.push("read:issue-source")
        return {
          id: "fulfillment-a",
          orderLine: {
            order: {
              tenantId,
              currencyCode: "NGN",
              store: { tenantId, currencyCode: "NGN" },
            },
            snapshot: null,
          },
        }
      },
      upsert: async () => {
        events.push("write:product-fulfillment")
        fulfillmentUpsertCount += 1
        return {
          id: "fulfillment-a",
          quantity: { toString: () => "2" },
          stockOperationId: "operation:fulfill-a",
        }
      },
    },
    financeBook: { findUnique: async () => null },
    commercialOrderFulfillmentCommand: {
      findUnique: async (args: unknown) => {
        const query = args as {
          where: { tenantId_clientOperationId: { clientOperationId: string } }
        }
        const id = query.where.tenantId_clientOperationId.clientOperationId
        events.push("read:fulfillment-command")
        return commandRows.get(id) ?? null
      },
      create: async (args: unknown) => {
        const data = (args as { data: Record<string, unknown> }).data
        events.push("write:fulfillment-command")
        batchCommandCreateCount += 1
        const row = { ...data }
        commandRows.set(String(data.clientOperationId), row)
        return row
      },
    },
  }

  const db = {
    ...tx,
    $transaction: async <T>(
      callback: (transaction: Prisma.TransactionClient) => Promise<T>,
    ) => callback(tx as unknown as Prisma.TransactionClient),
  }

  // Only this structural transaction/client fixture boundary is cast to Prisma.
  return {
    db: db as unknown as PrismaClient,
    events,
    rawCalls,
    orderUpdates,
    get fulfillmentUpsertCount() {
      return fulfillmentUpsertCount
    },
    get batchCommandCreateCount() {
      return batchCommandCreateCount
    },
  }
}

const fulfillmentInput = {
  actorUserId,
  clientOperationId: "fulfill-a",
  orderLineId: lineId,
  reason: "Packing",
  schemaVersion: 1,
  tenantId,
}

test("single-line fulfillment locks finance and Order before replay and preserves completedAt", async () => {
  const fixture = fulfillmentFixture()

  const first = await fulfillCommercialOrderProductLine(
    fixture.db,
    fulfillmentInput,
  )
  const firstCallEnd = fixture.events.length
  const second = await fulfillCommercialOrderProductLine(
    fixture.db,
    fulfillmentInput,
  )

  expect(first).toEqual(second)
  expect(fixture.orderUpdates).toHaveLength(2)
  expect(fixture.orderUpdates.map((update) => update.completedAt)).toEqual([
    completedAt,
    completedAt,
  ])
  expect(fixture.events.filter((event) => event.startsWith("lock:"))).toEqual([
    "lock:finance-book",
    "lock:customer-account",
    "lock:order",
    "lock:finance-book",
    "lock:customer-account",
    "lock:order",
  ])
  for (const events of [
    fixture.events.slice(0, firstCallEnd),
    fixture.events.slice(firstCallEnd),
  ]) {
    const lock = events.indexOf("lock:order")
    const stock = events.indexOf("read:stock-operation:fulfill-a")
    const source = events.indexOf("write:product-fulfillment")
    expect(lock).toBeGreaterThan(-1)
    expect(stock).toBeGreaterThan(lock)
    expect(source).toBeGreaterThan(stock)
  }
  expect(fixture.rawCalls.map((call) => call.values.slice(-2))).toContainEqual([
    orderId,
    tenantId,
  ])
})

test("batch replay returns the stored result without repeating fulfillment writes", async () => {
  const fixture = fulfillmentFixture()
  const input = {
    actorUserId,
    clientOperationId: "batch-a",
    orderId,
    reason: "Packing",
    schemaVersion: 1,
    tenantId,
  }

  const first = await fulfillCommercialOrderProducts(fixture.db, input)
  const writesAfterFirst = fixture.fulfillmentUpsertCount
  const second = await fulfillCommercialOrderProducts(fixture.db, input)

  expect(second).toEqual(first)
  expect(first).toEqual({ fulfilledLineCount: 1, status: "COMPLETED" })
  expect(writesAfterFirst).toBe(1)
  expect(fixture.fulfillmentUpsertCount).toBe(writesAfterFirst)
  expect(fixture.batchCommandCreateCount).toBe(1)
  expect(fixture.events.filter((event) => event.startsWith("lock:"))).toEqual([
    "lock:finance-book",
    "lock:customer-account",
    "lock:order",
    "lock:finance-book",
    "lock:customer-account",
    "lock:order",
    "lock:finance-book",
    "lock:customer-account",
    "lock:order",
  ])
  const commandReadIndices = fixture.events
    .map((event, index) => (event === "read:fulfillment-command" ? index : -1))
    .filter((index) => index >= 0)
  expect(commandReadIndices).toHaveLength(2)
  expect(
    fixture.events.slice(0, commandReadIndices[0]).lastIndexOf("lock:order"),
  ).toBeGreaterThan(-1)
  expect(
    fixture.events.slice(0, commandReadIndices[1]).lastIndexOf("lock:order"),
  ).toBeGreaterThan(-1)
})

test("absent finance book still locks the Order before product fulfillment", async () => {
  const fixture = fulfillmentFixture({ hasFinanceBook: false })

  await fulfillCommercialOrderProductLine(fixture.db, fulfillmentInput)

  const orderLockIndex = fixture.events.indexOf("lock:order")
  const sourceWriteIndex = fixture.events.indexOf("write:product-fulfillment")
  expect(orderLockIndex).toBeGreaterThan(-1)
  expect(sourceWriteIndex).toBeGreaterThan(orderLockIndex)
  expect(fixture.events).not.toContain("lock:customer-account")
  expect(fixture.events.filter((event) => event.startsWith("lock:"))).toEqual([
    "lock:finance-book",
    "lock:order",
  ])
  expect(fixture.rawCalls.map((call) => call.query)).toEqual([
    expect.stringContaining('FROM "FinanceBook"'),
    expect.stringContaining('FROM "CommercialOrder"'),
  ])
})

test("fresh no-book fulfillment reaches issue capture after its source write", async () => {
  const fixture = fulfillmentFixture({
    hasFinanceBook: false,
    existingFulfillment: false,
  })
  await fulfillCommercialOrderProductLine(fixture.db, fulfillmentInput)
  expect(fixture.events.indexOf("read:issue-source")).toBeGreaterThan(
    fixture.events.indexOf("write:product-fulfillment"),
  )
  expect(fixture.events.indexOf("write:order-status")).toBeGreaterThan(
    fixture.events.indexOf("read:issue-source"),
  )
})
