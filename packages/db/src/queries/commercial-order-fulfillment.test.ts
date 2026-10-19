import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  fulfillCommercialOrderProductLine,
  fulfillCommercialOrderProductLineInTransaction,
  fulfillCommercialOrderProducts,
  fulfillCommercialOrderProductsInTransaction,
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
  forbidCompletionRead?: boolean
  initialCompletedAt?: Date | null
  outstandingService?: boolean
}

function fulfillmentFixture(options: FixtureOptions = {}) {
  const events: string[] = []
  const rawCalls: Array<{ query: string; values: unknown[] }> = []
  const orderUpdates: Array<Record<string, unknown>> = []
  const commandRows = new Map<string, Record<string, unknown>>()
  let fulfillmentCreateCount = 0
  const savedFulfillment = {
    id: "fulfillment-a",
    quantity: new Prisma.Decimal("2"),
    stockOperationId: "operation:fulfill-a",
  }
  let priorFulfillment = options.existingFulfillment ? savedFulfillment : null
  let batchCommandCreateCount = 0
  let serviceComplete = false

  const line = {
    id: lineId,
    orderId,
    order: {
      deliveryDueAt: null,
    },
    quantity: new Prisma.Decimal("2"),
    stockReservation: { id: reservationId, status: "ACTIVE" },
  }
  const order = {
    storeId: "store-a",
    id: orderId,
    tenantId,
    customerId: "customer-a",
    currencyCode: "NGN",
    deliveryDueAt: null,
    status: options.initialCompletedAt === null ? "CONFIRMED" : "COMPLETED",
    completedAt:
      options.initialCompletedAt === undefined
        ? completedAt
        : options.initialCompletedAt,
    lines: [{ id: lineId }],
  }

  const book = {
    id: "book-a",
    tenantId,
    currencyCode: "NGN",
    startsAt: new Date("2026-01-01T00:00:00Z"),
    closedThrough: null,
  }
  const initialPool = {
    id: "pool-a",
    tenantId,
    bookId: book.id,
    balanceSourceId: "balance-a",
    quantity: new Prisma.Decimal("4"),
    valueMinor: 400n,
    unknownReason: null,
    lastMovementCount: 1n,
    lastStockRevision: 1,
    lastSequence: 1n,
    latestEffectiveAt: new Date("2026-08-31T10:00:00Z"),
  }
  let pool = initialPool
  let valuationEvent: Record<string, unknown> | null = null

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
        return values[0] === orderId && values[1] === tenantId
          ? [{ ...order }]
          : []
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
            status: order.status,
          }
        }
        return order
      },
      findUniqueOrThrow: async () => {
        events.push("read:order-completion-time")
        if (options.forbidCompletionRead)
          throw Error("Redundant Order completion reread")
        return { completedAt: order.completedAt, storeId: "store-a", tenantId }
      },
      update: async (args: unknown) => {
        const update = args as { data: Record<string, unknown> }
        events.push("write:order-status")
        orderUpdates.push(update.data)
        if (typeof update.data.status === "string")
          order.status = update.data.status
        if (update.data.completedAt instanceof Date)
          order.completedAt = update.data.completedAt
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
        const query = args as {
          include?: Record<string, unknown>
          where?: { kind?: string }
        }
        if (query.where?.kind === "SERVICE") return []
        events.push("read:product-lines")
        if (query.include?.productFulfillments) {
          return [
            {
              ...line,
              productFulfillments: [],
            },
          ]
        }
        events.push("read:completion-lines")
        if (options.forbidCompletionRead || options.outstandingService)
          expect(args).toMatchObject({
            where: { orderId, order: { storeId: "store-a", tenantId } },
          })
        return [
          {
            kind: "PRODUCT_UNIT",
            quantity: new Prisma.Decimal("2"),
            productFulfillments: [{ quantity: { toString: () => "2" } }],
            serviceJobLines: [],
          },
          ...(options.outstandingService
            ? [
                {
                  id: "service-line-a",
                  kind: "SERVICE",
                  quantity: { toString: () => "1" },
                  productFulfillments: [],
                  snapshot: {
                    serviceWorkPolicy: "TRACKED",
                    serviceAuthorizationPolicy: "ON_ORDER_CONFIRMATION",
                  },
                  serviceJobLines: [
                    {
                      allocatedQuantity: { toString: () => "1" },
                      authorizationStatus: "AUTHORIZED",
                      completedAt: serviceComplete
                        ? new Date("2026-10-17T10:00:00Z")
                        : null,
                      reworkOfLineId: null,
                      status: serviceComplete ? "COMPLETED" : "IN_PROGRESS",
                      serviceJob: {
                        commercialOrderId: orderId,
                        storeId: "store-a",
                        tenantId,
                      },
                    },
                  ],
                },
              ]
            : []),
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
      findUnique: async () => priorFulfillment,
      findFirst: async (args: unknown) => {
        expect(args).toMatchObject({
          where: {
            id: "fulfillment-a",
            orderLine: { order: { tenantId } },
          },
        })
        events.push("read:issue-source")
        const joined = args as {
          include: {
            stockOperation: {
              include: {
                movements: {
                  include: {
                    balanceSource: {
                      include: {
                        financeInventoryPools: unknown
                        _count: unknown
                      }
                    }
                  }
                }
              }
            }
          }
        }
        const balanceInclude =
          joined.include.stockOperation.include.movements.include.balanceSource
            .include
        const balance = {
          id: "balance-a",
          tenantId,
          storeId: "store-a",
          store: { tenantId, currencyCode: "NGN" },
          variantId: "variant-a",
          inventoryUnitId: "unit-a",
          kind: "SHARED_POOL",
          revision: 2,
          onHandQuantity: new Prisma.Decimal("2"),
          ...(balanceInclude.financeInventoryPools
            ? { financeInventoryPools: [pool] }
            : {}),
          ...(balanceInclude._count ? { _count: { movements: 2 } } : {}),
        }
        return {
          ...savedFulfillment,
          orderLine: {
            id: lineId,
            kind: "PRODUCT_UNIT",
            offeringId: "offering-a",
            quantity: new Prisma.Decimal("2"),
            order: {
              ...order,
              store: { tenantId, currencyCode: "NGN" },
            },
            snapshot: {
              currencyCode: "NGN",
              offeringId: "offering-a",
              balanceSourceId: balance.id,
              configurationVersionId: "configuration-a",
              inventoryUnitId: "unit-a",
              unitFactor: new Prisma.Decimal("1"),
              variantId: "variant-a",
              stockBehavior: "CANONICAL_SHARED",
            },
          },
          reservation: {
            tenantId,
            storeId: "store-a",
            offeringId: "offering-a",
            commercialOrderLineId: lineId,
            status: "COMMITTED",
            balanceSourceId: balance.id,
            configurationVersionId: "configuration-a",
            enteredInventoryUnitId: "unit-a",
            enteredQuantity: new Prisma.Decimal("2"),
            unitFactorSnapshot: new Prisma.Decimal("1"),
            canonicalQuantity: new Prisma.Decimal("2"),
          },
          stockOperation: {
            id: savedFulfillment.stockOperationId,
            tenantId,
            storeId: "store-a",
            type: "SALE_FULFILLMENT",
            source: "commercial_order",
            actorUserId,
            effectiveAt: completedAt,
            movements: [
              {
                id: "movement-a",
                balanceSourceId: balance.id,
                configurationVersionId: "configuration-a",
                enteredInventoryUnitId: "unit-a",
                enteredQuantity: new Prisma.Decimal("2"),
                unitFactorSnapshot: new Prisma.Decimal("1"),
                signedCanonicalEffect: new Prisma.Decimal("-2"),
                previousOnHandQuantity: new Prisma.Decimal("4"),
                resultingOnHandQuantity: new Prisma.Decimal("2"),
                balanceSource: balance,
                valuationEvent,
              },
            ],
          },
        }
      },
      create: async ({ data }: { data: { stockOperationId: string } }) => {
        events.push("write:product-fulfillment")
        savedFulfillment.stockOperationId = data.stockOperationId
        fulfillmentCreateCount += 1
        priorFulfillment = savedFulfillment
        return savedFulfillment
      },
    },
    financeBook: {
      findUnique: async () => (options.hasFinanceBook === false ? null : book),
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        if (options.hasFinanceBook === false || where.id !== book.id)
          throw Error("Finance Book is unavailable")
        return book
      },
    },
    financeInventoryPool: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        events.push("write:valuation-pool")
        pool = {
          ...initialPool,
          ...data,
          quantity: new Prisma.Decimal(String(data.quantity)),
        }
        return pool
      },
    },
    financeInventoryValuationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push("write:valuation-event")
        valuationEvent = {
          id: "valuation-a",
          ...data,
          canonicalEffect: new Prisma.Decimal(String(data.canonicalEffect)),
          quantityBefore: new Prisma.Decimal(String(data.quantityBefore)),
          quantityAfter: new Prisma.Decimal(String(data.quantityAfter)),
        }
        return valuationEvent
      },
    },
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
    tx: tx as unknown as Prisma.TransactionClient,
    db: db as unknown as PrismaClient,
    events,
    rawCalls,
    orderUpdates,
    completeService: () => {
      serviceComplete = true
    },
    get fulfillmentCreateCount() {
      return fulfillmentCreateCount
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
  expect(fixture.fulfillmentCreateCount).toBe(1)
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
  for (const [index, events] of [
    fixture.events.slice(0, firstCallEnd),
    fixture.events.slice(firstCallEnd),
  ].entries()) {
    const lock = events.indexOf("lock:order")
    const stock = events.indexOf("read:stock-operation:fulfill-a")
    const source = events.indexOf("write:product-fulfillment")
    expect(lock).toBeGreaterThan(-1)
    expect(stock).toBeGreaterThan(lock)
    if (index === 0) expect(source).toBeGreaterThan(stock)
    else expect(source).toBe(-1)
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
  const writesAfterFirst = fixture.fulfillmentCreateCount
  const second = await fulfillCommercialOrderProducts(fixture.db, input)

  expect(second).toEqual(first)
  expect(first).toEqual({ fulfilledLineCount: 1, status: "COMPLETED" })
  expect(writesAfterFirst).toBe(1)
  expect(fixture.fulfillmentCreateCount).toBe(writesAfterFirst)
  expect(fixture.batchCommandCreateCount).toBe(1)
  // One financial/Order lock acquisition per command, including replay.
  expect(fixture.events.filter((event) => event.startsWith("lock:"))).toEqual([
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

test("fresh no-book fulfillment records stock without reading a valuation graph", async () => {
  const fixture = fulfillmentFixture({
    hasFinanceBook: false,
    existingFulfillment: false,
  })
  await fulfillCommercialOrderProductLine(fixture.db, fulfillmentInput)
  expect(fixture.events).not.toContain("read:issue-source")
  expect(fixture.fulfillmentCreateCount).toBe(1)
  expect(fixture.events.indexOf("write:order-status")).toBeGreaterThan(
    fixture.events.indexOf("write:product-fulfillment"),
  )
})

test("a present Finance Book retains issue capture after its source write", async () => {
  const fixture = fulfillmentFixture({
    hasFinanceBook: true,
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

test("product line composes in caller transaction and rejects a different Store", async () => {
  const f = fulfillmentFixture()
  const first = await fulfillCommercialOrderProductLineInTransaction(f.tx, {
    ...fulfillmentInput,
    storeId: "store-a",
  })
  expect(
    await fulfillCommercialOrderProductLineInTransaction(f.tx, {
      ...fulfillmentInput,
      storeId: "store-a",
    }),
  ).toEqual(first)
  const wrong = fulfillmentFixture()
  await expect(
    fulfillCommercialOrderProductLineInTransaction(wrong.tx, {
      ...fulfillmentInput,
      storeId: "other-store",
    }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  expect(wrong.fulfillmentCreateCount).toBe(0)
  expect(wrong.orderUpdates).toHaveLength(0)
})

test("batch composes without a nested transaction and fences Store before replay", async () => {
  const f = fulfillmentFixture()
  const input = {
    actorUserId,
    clientOperationId: "batch-caller",
    orderId,
    reason: "Packing",
    schemaVersion: 1,
    tenantId,
    storeId: "store-a",
  }
  const first = await fulfillCommercialOrderProductsInTransaction(f.tx, input)
  expect(first).toEqual({ fulfilledLineCount: 1, status: "COMPLETED" })
  expect(
    f.events.filter((event) => event === "lock:finance-book"),
  ).toHaveLength(1)
  expect(f.events.filter((event) => event === "lock:order")).toHaveLength(1)
  expect(f.events.indexOf("lock:order")).toBeLessThan(
    f.events.indexOf("write:product-fulfillment"),
  )
  expect(
    await fulfillCommercialOrderProductsInTransaction(f.tx, input),
  ).toEqual(first)
  await expect(
    fulfillCommercialOrderProductsInTransaction(f.tx, {
      ...input,
      storeId: "other-store",
    }),
  ).rejects.toMatchObject({ code: "REVISION_CONFLICT" })
  await expect(
    fulfillCommercialOrderProductsInTransaction(f.tx, {
      ...input,
      reason: "Changed intention",
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  expect(f.fulfillmentCreateCount).toBe(1)
  expect(f.batchCommandCreateCount).toBe(1)
})

for (const mode of ["single-line", "batch"] as const) {
  test(`${mode} completion uses its authentic held Order without a redundant completion-row read`, async () => {
    const f = fulfillmentFixture({
      hasFinanceBook: false,
      forbidCompletionRead: true,
    })
    if (mode === "single-line")
      await fulfillCommercialOrderProductLine(f.db, fulfillmentInput)
    else
      expect(
        await fulfillCommercialOrderProducts(f.db, {
          actorUserId,
          clientOperationId: "batch-no-completion-read",
          orderId,
          reason: "Packing",
          schemaVersion: 1,
          tenantId,
        }),
      ).toEqual({ fulfilledLineCount: 1, status: "COMPLETED" })
    expect(f.orderUpdates).toEqual([{ completedAt, status: "COMPLETED" }])
    expect(f.events).not.toContain("read:order-completion-time")
    expect(
      f.events.filter((event) => event === "read:completion-lines"),
    ).toHaveLength(1)
    expect(f.events.indexOf("read:completion-lines")).toBeGreaterThan(
      f.events.indexOf("write:product-fulfillment"),
    )
    expect(f.events.indexOf("write:order-status")).toBeGreaterThan(
      f.events.indexOf("read:completion-lines"),
    )
    expect(f.events.filter((event) => event === "lock:order")).toHaveLength(1)
  })
}

test("fresh mixed-Service obligations keep fulfillment open and later completion preserves its first timestamp", async () => {
  const f = fulfillmentFixture({
    hasFinanceBook: false,
    outstandingService: true,
    initialCompletedAt: null,
  })
  await fulfillCommercialOrderProductLine(f.db, fulfillmentInput)
  expect(f.orderUpdates[0]).toEqual({
    status: "FULFILLING",
    completedAt: undefined,
  })
  // The next real completion calculation receives a newly completed Service
  // obligation. This port change is not a claim of a Service command/DB write.
  f.completeService()
  await fulfillCommercialOrderProductLine(f.db, fulfillmentInput)
  const firstCompletedAt = f.orderUpdates[1]?.completedAt
  expect(firstCompletedAt).toBeInstanceOf(Date)
  expect(f.orderUpdates[1]?.status).toBe("COMPLETED")
  await fulfillCommercialOrderProductLine(f.db, fulfillmentInput)
  expect(f.orderUpdates[2]).toEqual({
    status: "COMPLETED",
    completedAt: firstCompletedAt,
  })
  expect(f.fulfillmentCreateCount).toBe(1)
  expect(
    f.events.filter((event) => event === "read:completion-lines"),
  ).toHaveLength(3)
})
