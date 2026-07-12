import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  closeRetailOpsSession,
  listRetailOpsPaymentReconciliation,
  listRetailOpsSessions,
  openRetailOpsSession,
} from "./retail-ops-sessions"

type SessionCall = {
  data?: unknown
  kind: string
  where?: unknown
}

function createProductVariantRow() {
  return {
    id: "variant_bag",
    name: "Bag",
    sku: "rice-bag",
    product: {
      id: "product_rice",
      name: "Rice",
    },
  }
}

function createMockOpenSessionDb(input?: { existingSession?: boolean }) {
  const calls: SessionCall[] = []
  const openedAt = new Date("2026-07-12T08:00:00.000Z")
  const variant = createProductVariantRow()
  const session = {
    id: "session_open_123",
    openedAt,
    openingFloatMinor: 10_000,
    status: "OPEN",
    storeId: "store_123",
    userId: "user_owner",
  }

  const tx = {
    cashierSession: {
      create: async ({ data }: { data: unknown }) => {
        calls.push({ data, kind: "cashierSession.create" })

        return session
      },
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "cashierSession.findFirst", where })

        return input?.existingSession ? { id: "session_existing" } : null
      },
    },
    inventoryItem: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findMany", where })

        return [
          {
            onHandQuantity: 12,
            productVariantId: variant.id,
          },
        ]
      },
    },
    productVariant: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productVariant.findMany", where })

        return [variant]
      },
    },
    store: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findFirst", where })

        return {
          id: "store_123",
          metadata: {},
        }
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "store.update", where })

        return { id: "store_123" }
      },
    },
  }
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
    openedAt,
  }
}

function createMockCloseSessionDb() {
  const calls: SessionCall[] = []
  const openedAt = new Date("2026-07-12T08:00:00.000Z")
  const closedAt = new Date("2026-07-12T17:00:00.000Z")
  const variant = createProductVariantRow()

  const tx = {
    cashierSession: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "cashierSession.findFirst", where })

        return {
          id: "session_open_123",
          openedAt,
          openingFloatMinor: 10_000,
        }
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "cashierSession.update", where })

        return {
          id: "session_open_123",
          openedAt,
          status: "CLOSED",
        }
      },
    },
    inventoryItem: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "inventoryItem.findMany", where })

        return [
          {
            onHandQuantity: 7,
            productVariantId: variant.id,
          },
        ]
      },
    },
    order: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.findMany", where })

        return [{ totalMinor: 5_000 }]
      },
    },
    productVariant: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "productVariant.findMany", where })

        return [variant]
      },
    },
    receipt: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "receipt.findMany", where })

        return [
          {
            paymentMethod: "cash",
            totalMinor: 30_000,
          },
          {
            paymentMethod: "bank_transfer",
            totalMinor: 20_000,
          },
          {
            paymentMethod: "card",
            totalMinor: 15_000,
          },
        ]
      },
    },
    retailOpsCloseout: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "retailOpsCloseout.upsert",
          where,
        })

        return { id: "closeout_123" }
      },
    },
    retailOpsPaymentDeclaration: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "retailOpsPaymentDeclaration.upsert",
          where,
        })

        return { id: "payment_declaration_123" }
      },
    },
    retailOpsStockDeclaration: {
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "retailOpsStockDeclaration.upsert",
          where,
        })

        return { id: "stock_declaration_123" }
      },
    },
    store: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findFirst", where })

        return {
          id: "store_123",
          metadata: {},
        }
      },
      update: async ({ data, where }: { data: unknown; where: unknown }) => {
        calls.push({ data, kind: "store.update", where })

        return { id: "store_123" }
      },
    },
  }
  const db = {
    $transaction: async <T>(
      callback: (transactionClient: typeof tx) => Promise<T>,
    ) => callback(tx),
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
    closedAt,
  }
}

function createMockSessionReportsDb() {
  const calls: SessionCall[] = []
  const openedAt = new Date("2026-07-12T08:00:00.000Z")
  const closedAt = new Date("2026-07-12T17:00:00.000Z")
  const storeMetadata = {
    retailOps: {
      closeoutDeclarations: [
        {
          cashierSessionId: "session_closed_123",
          declaredAt: "2026-07-12T17:00:00.000Z",
          declaredByUserId: "user_owner",
          declarations: {
            cardMinor: 14_000,
            cashMinor: 42_000,
            creditMinor: 5_000,
            transferMinor: 20_500,
          },
        },
      ],
      closeoutInventoryDeclarations: [
        {
          cashierSessionId: "session_closed_123",
          declaredAt: "2026-07-12T17:00:00.000Z",
          declaredByUserId: "user_owner",
          lines: [
            {
              countedQuantity: 6,
              expectedQuantity: 7,
              note: "One bag damaged",
              product: {
                id: "product_rice",
                name: "Rice",
              },
              productVariantId: "variant_bag",
              stockSource: "store",
              unit: {
                id: "variant_bag",
                name: "Bag",
                sku: "rice-bag",
              },
              varianceQuantity: -1,
            },
          ],
        },
      ],
      closeoutReviews: [
        {
          cashierSessionId: "session_closed_123",
          note: "Cash variance accepted",
          reviewedAt: "2026-07-12T18:00:00.000Z",
          reviewedByUserId: "user_manager",
          status: "approved",
        },
      ],
      openingInventoryDeclarations: [
        {
          cashierSessionId: "session_closed_123",
          declaredAt: "2026-07-12T08:00:00.000Z",
          declaredByUserId: "user_owner",
          lines: [
            {
              countedQuantity: 15,
              expectedQuantity: 12,
              note: "Opening physical count",
              product: {
                id: "product_rice",
                name: "Rice",
              },
              productVariantId: "variant_bag",
              stockSource: "store",
              unit: {
                id: "variant_bag",
                name: "Bag",
                sku: "rice-bag",
              },
              varianceQuantity: 3,
            },
          ],
        },
      ],
    },
  }
  const sessions = [
    {
      id: "session_closed_123",
      status: "CLOSED",
      openedAt,
      closedAt,
      openingFloatMinor: 10_000,
      closingFloatMinor: 42_000,
      user: {
        id: "user_owner",
        displayName: "Owner Ada",
        name: "Ada",
        email: "ada@example.com",
      },
      receipts: [
        {
          paymentMethod: "cash",
          totalMinor: 30_000,
        },
        {
          paymentMethod: "bank_transfer",
          totalMinor: 20_000,
        },
        {
          paymentMethod: "card",
          totalMinor: 15_000,
        },
      ],
    },
  ]
  const creditOrders = [
    {
      metadata: {
        retailOps: {
          cashierSessionId: "session_closed_123",
          paymentMethod: "credit",
          source: "retail_ops_sale",
        },
      },
      totalMinor: 5_000,
    },
    {
      metadata: {
        retailOps: {
          cashierSessionId: "session_other",
          paymentMethod: "credit",
          source: "retail_ops_sale",
        },
      },
      totalMinor: 99_000,
    },
    {
      metadata: {
        retailOps: {
          cashierSessionId: "session_closed_123",
          paymentMethod: "cash",
          source: "retail_ops_sale",
        },
      },
      totalMinor: 88_000,
    },
  ]
  const db = {
    cashierSession: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "cashierSession.findMany", where })

        return sessions
      },
    },
    order: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "order.findMany", where })

        return creditOrders
      },
    },
    store: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.findFirst", where })

        return {
          metadata: storeMetadata,
        }
      },
    },
  }

  return {
    calls,
    client: db as unknown as PrismaClient,
    closedAt,
    openedAt,
  }
}

function getCalls(calls: SessionCall[], kind: string) {
  return calls.filter((entry) => entry.kind === kind)
}

function getCall(calls: SessionCall[], kind: string) {
  const call = calls.find((entry) => entry.kind === kind)
  if (!call) {
    throw new Error(`Expected ${kind} call`)
  }

  return call
}

describe("retail ops session queries", () => {
  test("opens a session with idempotent opening inventory declaration metadata", async () => {
    const db = createMockOpenSessionDb()

    const result = await openRetailOpsSession(db.client, {
      actorUserId: "user_owner",
      externalId: " local_session_open_123 ",
      inventoryLines: [
        {
          countedQuantity: 15,
          note: "Opening physical count",
          productVariantId: "variant_bag",
        },
      ],
      notes: "Morning shift",
      openedAt: db.openedAt,
      openingFloatMinor: 10_000,
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      externalId: "local_session_open_123",
      id: "session_open_123",
      openingFloatMinor: 10_000,
      status: "OPEN",
      storeId: "store_123",
      userId: "user_owner",
    })
    expect(result.inventory?.lines).toEqual([
      {
        countedQuantity: 15,
        expectedQuantity: 12,
        note: "Opening physical count",
        product: {
          id: "product_rice",
          name: "Rice",
        },
        productVariantId: "variant_bag",
        stockSource: "store",
        unit: {
          id: "variant_bag",
          name: "Bag",
          sku: "rice-bag",
        },
        varianceQuantity: 3,
      },
    ])

    const createCall = getCall(db.calls, "cashierSession.create")
    expect(createCall.data).toMatchObject({
      notes: "Morning shift",
      openedAt: db.openedAt,
      openingFloatMinor: 10_000,
      storeId: "store_123",
      tenantId: "tenant_123",
      userId: "user_owner",
    })

    const storeUpdate = getCall(db.calls, "store.update")
    expect(storeUpdate.data).toMatchObject({
      metadata: {
        retailOps: {
          openingInventoryDeclarations: [
            {
              cashierSessionId: "session_open_123",
              declaredAt: "2026-07-12T08:00:00.000Z",
              declaredByUserId: "user_owner",
            },
          ],
          sessionOperations: [
            {
              externalId: "local_session_open_123",
              type: "session_open",
            },
          ],
        },
      },
    })
  })

  test("prevents an actor from opening a second live session in the same store", async () => {
    const db = createMockOpenSessionDb({ existingSession: true })

    await expect(
      openRetailOpsSession(db.client, {
        actorUserId: "user_owner",
        openedAt: db.openedAt,
        openingFloatMinor: 10_000,
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).rejects.toThrow("Close the current session before opening a new one.")

    expect(getCalls(db.calls, "cashierSession.create")).toHaveLength(0)
    expect(getCalls(db.calls, "store.update")).toHaveLength(0)
  })

  test("closes a session with payment variance and durable stock declarations", async () => {
    const db = createMockCloseSessionDb()

    const result = await closeRetailOpsSession(db.client, {
      actorUserId: "user_owner",
      cashierSessionId: "session_open_123",
      closedAt: db.closedAt,
      closingFloatMinor: 42_000,
      declaredCardMinor: 14_000,
      declaredCreditMinor: 5_000,
      declaredTransferMinor: 20_500,
      externalId: " local_session_close_123 ",
      inventoryLines: [
        {
          countedQuantity: 6,
          note: "One bag damaged",
          productVariantId: "variant_bag",
        },
      ],
      notes: "End of day",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(result).toMatchObject({
      closingFloatMinor: 42_000,
      expectedCashMinor: 40_000,
      externalId: "local_session_close_123",
      id: "session_open_123",
      openingFloatMinor: 10_000,
      payments: {
        cardMinor: 15_000,
        cashMinor: 30_000,
        creditMinor: 5_000,
        grossMinor: 70_000,
        receiptCount: 3,
        transferMinor: 20_000,
      },
      status: "CLOSED",
      variance: {
        cardMinor: -1000,
        cashMinor: 2000,
        creditMinor: 0,
        transferMinor: 500,
      },
    })
    expect(result.inventory?.lines).toEqual([
      {
        countedQuantity: 6,
        expectedQuantity: 7,
        note: "One bag damaged",
        product: {
          id: "product_rice",
          name: "Rice",
        },
        productVariantId: "variant_bag",
        stockSource: "store",
        unit: {
          id: "variant_bag",
          name: "Bag",
          sku: "rice-bag",
        },
        varianceQuantity: -1,
      },
    ])

    const closeoutCall = getCall(db.calls, "retailOpsCloseout.upsert")
    expect(closeoutCall.data).toMatchObject({
      create: {
        cashierSessionId: "session_open_123",
        declaredTotalMinor: 81_500,
        expectedTotalMinor: 80_000,
        externalId: "local_session_close_123",
        paymentVarianceCount: 3,
        status: "PENDING_REVIEW",
        stockVarianceLineCount: 1,
        varianceTotalMinor: 1500,
      },
    })

    const paymentDeclarations = getCalls(
      db.calls,
      "retailOpsPaymentDeclaration.upsert",
    )
    expect(paymentDeclarations).toHaveLength(4)
    expect(paymentDeclarations.map((call) => call.data)).toContainEqual(
      expect.objectContaining({
        create: expect.objectContaining({
          declaredMinor: 42_000,
          expectedMinor: 40_000,
          method: "CASH",
          varianceMinor: 2000,
        }),
      }),
    )

    const stockDeclaration = getCall(
      db.calls,
      "retailOpsStockDeclaration.upsert",
    )
    expect(stockDeclaration.data).toMatchObject({
      create: {
        cashierSessionId: "session_open_123",
        closeoutId: "closeout_123",
        countedQuantity: 6,
        expectedQuantity: 7,
        productId: "product_rice",
        productVariantId: "variant_bag",
        stockSource: "CENTRAL_STOCK",
        type: "CLOSING",
        unitNameSnapshot: "Bag",
        unitSkuSnapshot: "rice-bag",
        varianceQuantity: -1,
      },
    })

    const storeUpdate = getCall(db.calls, "store.update")
    expect(storeUpdate.data).toMatchObject({
      metadata: {
        retailOps: {
          closeoutDeclarations: [
            {
              cashierSessionId: "session_open_123",
              declaredAt: "2026-07-12T17:00:00.000Z",
              declaredByUserId: "user_owner",
              declarations: {
                cardMinor: 14_000,
                cashMinor: 42_000,
                creditMinor: 5_000,
                transferMinor: 20_500,
              },
            },
          ],
          closeoutInventoryDeclarations: [
            {
              cashierSessionId: "session_open_123",
              declaredAt: "2026-07-12T17:00:00.000Z",
              declaredByUserId: "user_owner",
            },
          ],
          sessionOperations: [
            {
              externalId: "local_session_close_123",
              type: "session_close",
            },
          ],
        },
      },
    })
  })

  test("lists closed sessions with declarations, credit totals, inventory, and review metadata", async () => {
    const db = createMockSessionReportsDb()

    const result = await listRetailOpsSessions(db.client, {
      from: new Date("2026-07-12T00:00:00.000Z"),
      status: "closed",
      storeId: "store_123",
      tenantId: "tenant_123",
      to: new Date("2026-07-12T23:59:59.999Z"),
      userId: "user_owner",
    })

    expect(result).toEqual([
      expect.objectContaining({
        closedAt: db.closedAt,
        closingFloatMinor: 42_000,
        declarations: {
          cardMinor: 14_000,
          cashMinor: 42_000,
          creditMinor: 5_000,
          transferMinor: 20_500,
        },
        expectedCashMinor: 40_000,
        id: "session_closed_123",
        inventory: expect.objectContaining({
          cashierSessionId: "session_closed_123",
          declaredAt: db.closedAt,
          declaredByUserId: "user_owner",
          lines: [
            {
              countedQuantity: 6,
              expectedQuantity: 7,
              note: "One bag damaged",
              product: {
                id: "product_rice",
                name: "Rice",
              },
              productVariantId: "variant_bag",
              stockSource: "store",
              unit: {
                id: "variant_bag",
                name: "Bag",
                sku: "rice-bag",
              },
              varianceQuantity: -1,
            },
          ],
        }),
        openedAt: db.openedAt,
        openingFloatMinor: 10_000,
        openingInventory: expect.objectContaining({
          cashierSessionId: "session_closed_123",
          declaredAt: db.openedAt,
        }),
        payments: {
          cardMinor: 15_000,
          cashMinor: 30_000,
          creditMinor: 5_000,
          grossMinor: 70_000,
          receiptCount: 3,
          transferMinor: 20_000,
        },
        review: {
          cashierSessionId: "session_closed_123",
          note: "Cash variance accepted",
          reviewedAt: new Date("2026-07-12T18:00:00.000Z"),
          reviewedByUserId: "user_manager",
          status: "approved",
        },
        status: "CLOSED",
        user: {
          displayName: "Owner Ada",
          email: "ada@example.com",
          id: "user_owner",
        },
        variance: {
          cardMinor: -1000,
          cashMinor: 2000,
          creditMinor: 0,
          transferMinor: 500,
        },
      }),
    ])
    expect(getCall(db.calls, "cashierSession.findMany")).toMatchObject({
      where: {
        closedAt: {
          gte: new Date("2026-07-12T00:00:00.000Z"),
          lte: new Date("2026-07-12T23:59:59.999Z"),
        },
        status: "CLOSED",
        storeId: "store_123",
        tenantId: "tenant_123",
        userId: "user_owner",
      },
    })
    expect(getCall(db.calls, "order.findMany")).toMatchObject({
      where: {
        createdAt: {
          gte: db.openedAt,
          lte: new Date("2026-07-12T23:59:59.999Z"),
        },
        paymentStatus: "PENDING",
        status: {
          not: "CANCELLED",
        },
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
  })

  test("lists payment reconciliation rows with declared-versus-expected variance", async () => {
    const db = createMockSessionReportsDb()

    const result = await listRetailOpsPaymentReconciliation(db.client, {
      from: new Date("2026-07-12T00:00:00.000Z"),
      storeId: "store_123",
      tenantId: "tenant_123",
      to: new Date("2026-07-12T23:59:59.999Z"),
      userId: "user_owner",
    })

    expect(result).toEqual([
      expect.objectContaining({
        closedAt: db.closedAt,
        closingFloatMinor: 42_000,
        declarations: {
          cardMinor: 14_000,
          cashMinor: 42_000,
          creditMinor: 5_000,
          transferMinor: 20_500,
        },
        expectedCashMinor: 40_000,
        id: "session_closed_123",
        inventory: expect.objectContaining({
          cashierSessionId: "session_closed_123",
          lines: [
            expect.objectContaining({
              countedQuantity: 6,
              expectedQuantity: 7,
              productVariantId: "variant_bag",
              varianceQuantity: -1,
            }),
          ],
        }),
        openedAt: db.openedAt,
        openingFloatMinor: 10_000,
        openingInventory: expect.objectContaining({
          cashierSessionId: "session_closed_123",
        }),
        payments: {
          cardMinor: 15_000,
          cashMinor: 30_000,
          creditMinor: 5_000,
          grossMinor: 70_000,
          receiptCount: 3,
          transferMinor: 20_000,
        },
        review: {
          cashierSessionId: "session_closed_123",
          note: "Cash variance accepted",
          reviewedAt: new Date("2026-07-12T18:00:00.000Z"),
          reviewedByUserId: "user_manager",
          status: "approved",
        },
        status: "CLOSED",
        user: {
          displayName: "Owner Ada",
          email: "ada@example.com",
          id: "user_owner",
        },
        variance: {
          cardMinor: -1000,
          cashMinor: 2000,
          creditMinor: 0,
          transferMinor: 500,
        },
      }),
    ])
    expect(getCall(db.calls, "cashierSession.findMany")).toMatchObject({
      where: {
        closedAt: {
          gte: new Date("2026-07-12T00:00:00.000Z"),
          lte: new Date("2026-07-12T23:59:59.999Z"),
        },
        storeId: "store_123",
        tenantId: "tenant_123",
        userId: "user_owner",
      },
    })
  })
})
