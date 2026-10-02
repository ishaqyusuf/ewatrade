import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { commitCatalogStockReservation } from "./catalog-inventory"
import { returnCommercialOrderProductLine } from "./commercial-orders"
import { postSingleBalanceStockOperation } from "./inventory-operations"

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

function hash(input: unknown) {
  return createHash("sha256").update(stableJson(input)).digest("hex")
}

const actor = { tenantId: "tenant-a", actorUserId: "inventory-manager-a" }
const commitInput = {
  ...actor,
  clientOperationId: "commit-a",
  reservationId: "reservation-a",
  schemaVersion: 1,
  source: "pos",
}
const receiptInput = {
  ...actor,
  balanceSourceId: "balance-a",
  clientOperationId: "receipt-a",
  direction: "increase" as const,
  effectiveAt: new Date("2026-09-15T12:00:00.000Z"),
  enteredInventoryUnitId: "unit-a",
  enteredQuantity: "1",
  expectedBalanceRevision: 0,
  expectedConfigurationVersionId: "configuration-a",
  reason: "Delivery",
  schemaVersion: 1,
  source: "inventory",
  storeId: "store-a",
  type: "receipt" as const,
}

function stockReplayFixture(
  options: {
    hasBook?: boolean
    hasReservation?: boolean
    hasStore?: boolean
  } = {},
) {
  const events: string[] = []
  const tx = {
    store: {
      findFirst: async (args: unknown) => {
        expect(args).toEqual({
          where: { id: "store-a", tenantId: actor.tenantId },
          select: { currencyCode: true },
        })
        events.push("store-identity")
        return options.hasStore === false ? null : { currencyCode: "NGN" }
      },
    },
    stockReservation: {
      findFirst: async (args: unknown) => {
        expect(args).toEqual({
          where: { id: commitInput.reservationId, tenantId: actor.tenantId },
          select: { storeId: true },
        })
        events.push("reservation-identity")
        return options.hasReservation === false ? null : { storeId: "store-a" }
      },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      expect(strings.join("?")).toContain('FROM "FinanceBook"')
      expect(values).toEqual([actor.tenantId, "NGN"])
      events.push("book-lock")
      return options.hasBook === false ? [] : [{ id: "book-a" }]
    },
    stockOperation: {
      findUnique: async (args: unknown) => {
        events.push("stock-replay")
        const input = args as {
          where: { tenantId_clientOperationId: { clientOperationId: string } }
        }
        const receipt =
          input.where.tenantId_clientOperationId.clientOperationId ===
          receiptInput.clientOperationId
        return {
          id: "original-operation",
          payloadHash: hash(receipt ? receiptInput : commitInput),
          categories: [],
          movements: [],
          effectiveAt: receiptInput.effectiveAt,
        }
      },
    },
  }
  const db = {
    $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
      fn(tx as unknown as Prisma.TransactionClient),
  }
  return { db: db as unknown as PrismaClient, events }
}

test("ordinary receipt replay coordinates with its book before stock reads", async () => {
  const fixture = stockReplayFixture()
  const result = await postSingleBalanceStockOperation(fixture.db, receiptInput)
  expect(result.id).toBe("original-operation")
  expect(fixture.events).toEqual([
    "store-identity",
    "book-lock",
    "stock-replay",
  ])
})

test("direct reservation commit uses its scoped Store before replay", async () => {
  const fixture = stockReplayFixture()
  const result = await commitCatalogStockReservation(fixture.db, commitInput)
  expect(result.id).toBe("original-operation")
  expect(fixture.events).toEqual([
    "reservation-identity",
    "store-identity",
    "book-lock",
    "stock-replay",
  ])
})

test("ordinary receipt and direct commit keep no-book operation", async () => {
  const fixture = stockReplayFixture({ hasBook: false })
  expect(
    (await postSingleBalanceStockOperation(fixture.db, receiptInput)).id,
  ).toBe("original-operation")
  expect(
    (await commitCatalogStockReservation(fixture.db, commitInput)).id,
  ).toBe("original-operation")
  expect(
    fixture.events.filter((event) => event === "stock-replay"),
  ).toHaveLength(2)
})

test("foreign or missing Store cannot inspect a financial book or stock replay", async () => {
  const fixture = stockReplayFixture({ hasStore: false })
  await expect(
    postSingleBalanceStockOperation(fixture.db, receiptInput),
  ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" })
  expect(fixture.events).toEqual(["store-identity"])
})

test("foreign or missing reservation fails before Store or book reads", async () => {
  const fixture = stockReplayFixture({ hasReservation: false })
  await expect(
    commitCatalogStockReservation(fixture.db, commitInput),
  ).rejects.toMatchObject({ code: "RESERVATION_NOT_FOUND" })
  expect(fixture.events).toEqual(["reservation-identity"])
})

const returnInput = {
  ...actor,
  clientReturnId: "return-a",
  disposition: "no_restock" as const,
  orderLineId: "line-a",
  quantity: "1",
  reason: "Returned without stock intake",
  schemaVersion: 1,
}

function productReturnFixture(
  options: {
    hasBook?: boolean
    hasLine?: boolean
    reboundLine?: boolean
    replay?: boolean
  } = {},
) {
  const events: string[] = []
  let retained: Record<string, unknown> | null = options.replay
    ? { id: "retained-return", payloadHash: hash(returnInput) }
    : null
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const query = strings.join("?")
      if (query.includes('FROM "FinanceBook"')) {
        events.push("book-lock")
        return options.hasBook === false ? [] : [{ id: "book-a" }]
      }
      if (query.includes('FROM "CommercialOrder"')) {
        events.push("order-lock")
        return [{ id: "order-a" }]
      }
      throw new Error(`Unexpected lock: ${query}`)
    },
    commercialOrder: {
      findFirst: async () => ({
        id: "order-a",
        tenantId: actor.tenantId,
        storeId: "store-a",
        currencyCode: "NGN",
        customerId: null,
      }),
    },
    commercialOrderLine: {
      findFirst: async (args: unknown) => {
        const input = args as { select?: { orderId?: boolean }; where: unknown }
        if (input.select?.orderId) {
          events.push("line-identity")
          expect(input.where).toEqual({
            id: returnInput.orderLineId,
            kind: "PRODUCT_UNIT",
            order: { tenantId: actor.tenantId },
          })
          return options.hasLine === false ? null : { orderId: "order-a" }
        }
        events.push("return-history")
        expect(input.where).toEqual({
          id: returnInput.orderLineId,
          orderId: "order-a",
          kind: "PRODUCT_UNIT",
          order: { tenantId: actor.tenantId },
        })
        if (options.reboundLine) return null
        return {
          id: returnInput.orderLineId,
          orderId: "order-a",
          order: { storeId: "store-a" },
          snapshot: {},
          productFulfillments: [{ quantity: "1" }],
          productReturns: [],
        }
      },
    },
    productReturn: {
      findUnique: async () => {
        events.push("return-replay")
        return retained
      },
      create: async (args: unknown) => {
        events.push("return-write")
        retained = { id: "retained-return", ...(args as { data: object }).data }
        return retained
      },
    },
  }
  const db = {
    $transaction: async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
      fn(tx as unknown as Prisma.TransactionClient),
  }
  return { db: db as unknown as PrismaClient, events }
}

test("product return replay locks book and Order without recosting history", async () => {
  const fixture = productReturnFixture({ replay: true })
  const first = await returnCommercialOrderProductLine(fixture.db, returnInput)
  const second = await returnCommercialOrderProductLine(fixture.db, returnInput)
  expect(second).toEqual(first)
  expect(fixture.events).toEqual([
    "line-identity",
    "book-lock",
    "order-lock",
    "return-replay",
    "line-identity",
    "book-lock",
    "order-lock",
    "return-replay",
  ])
})

test("product returns without a FinanceBook still serialize the Order", async () => {
  const fixture = productReturnFixture({ hasBook: false })
  const result = await returnCommercialOrderProductLine(fixture.db, returnInput)
  expect(result.id).toBe("retained-return")
  expect(fixture.events.indexOf("return-write")).toBeGreaterThan(
    fixture.events.indexOf("order-lock"),
  )
})

test("foreign product line is refused before finance/source reads", async () => {
  const fixture = productReturnFixture({ hasLine: false })
  await expect(
    returnCommercialOrderProductLine(fixture.db, returnInput),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" })
  expect(fixture.events).toEqual(["line-identity"])
})

test("a product line rebound after identity lookup cannot create a return", async () => {
  const fixture = productReturnFixture({ reboundLine: true })
  await expect(
    returnCommercialOrderProductLine(fixture.db, returnInput),
  ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" })
  expect(fixture.events).not.toContain("return-write")
})

test("return quantity cannot exceed performed quantity after the Order lock", async () => {
  const fixture = productReturnFixture()
  await expect(
    returnCommercialOrderProductLine(fixture.db, {
      ...returnInput,
      quantity: "2",
    }),
  ).rejects.toMatchObject({ code: "INVALID_ORDER" })
  expect(fixture.events).not.toContain("return-write")
  expect(fixture.events.indexOf("return-history")).toBeGreaterThan(
    fixture.events.indexOf("order-lock"),
  )
})
