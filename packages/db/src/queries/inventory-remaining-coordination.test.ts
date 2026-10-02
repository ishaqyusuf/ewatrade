import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  createAndDispatchStockTransfer,
  finalizeInventoryCloseout,
  moveInventoryCustody,
  receiveOrCancelStockTransfer,
} from "./inventory-custody-transfers"
import { lockInventoryFinancialStores } from "./inventory-finance-locks"
import {
  correctStockOperation,
  finalizeStockCount,
  transformPackagedStock,
} from "./inventory-operations"
import { graduateServiceCommerceCatalogOffering } from "./service-commerce-graduation"

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

const actor = { actorUserId: "manager-a", tenantId: "tenant-a" }
const common = {
  ...actor,
  clientOperationId: "command-a",
  reason: "Reviewed stock",
  schemaVersion: 1 as const,
}
const transformInput = {
  ...common,
  storeId: "store-a",
  source: "inventory",
  sourceBalanceSourceId: "balance-z",
  targetBalanceSourceId: "balance-a",
  sourceBalanceRevision: 0,
  targetBalanceRevision: 0,
  sourceQuantity: "1",
  targetQuantity: "2",
  expectedConfigurationVersionId: "configuration-a",
}
const countInput = { ...common, stockCountId: "count-a" }
const correctionInput = {
  ...common,
  source: "inventory",
  targetOperationId: "target-a",
  corrections: [],
}
const custodyInput = {
  ...common,
  source: "inventory",
  sourceBalanceSourceId: "balance-a",
  quantity: "1",
  expectedSourceRevision: 0,
  targetCustodyType: "staff" as const,
  targetCustodyReferenceId: "staff-a",
}
const dispatchInput = {
  ...common,
  source: "inventory",
  sourceBalanceSourceId: "balance-a",
  quantity: "1",
  expectedSourceRevision: 0,
  clientTransferId: "transfer-command-a",
  targetStoreId: "store-z",
}
const transitionInput = {
  ...common,
  source: "inventory",
  transferId: "transfer-a",
  expectedTransitRevision: 0,
  transition: "receive" as const,
}
const closeoutInput = { ...common, closeoutId: "closeout-a" }

function fixture(
  input: unknown,
  options: {
    hasBook?: boolean
    missingStore?: boolean
    replay?: boolean
    foreignMovement?: boolean
    purchaseMovement?: boolean
    costedMovement?: boolean
    ordinaryCosted?: boolean
    wrongOrdinarySource?: boolean
    ownedOrdinary?: boolean
    closeoutOwned?: boolean
    openingOwned?: "catalog_setup" | "service_commerce_catalog_graduation"
  } = {},
) {
  const events: string[] = []
  const queries: string[] = []
  const payloadHash = createHash("sha256")
    .update(stableJson(input))
    .digest("hex")
  const retained = {
    id: "retained-source",
    payloadHash,
    movements: [],
    categories: [],
  }
  const stopped = new Error("stop after financial/source locks")
  let transactionOptions: unknown
  const tx = {
    store: {
      findFirst: async (args: unknown) => {
        expect((args as { where: object }).where).toMatchObject({
          tenantId: actor.tenantId,
        })
        events.push("store-identity")
        return options.missingStore
          ? null
          : { id: "store-a", currencyCode: "NGN" }
      },
      findMany: async (args: unknown) => {
        const scope = args as {
          where: { tenantId: string; id: { in: string[] } }
        }
        expect(scope.where.tenantId).toBe(actor.tenantId)
        events.push("stores-identity")
        if (options.missingStore) return []
        return scope.where.id.in
          .map((id) => ({
            id,
            currencyCode: id === "store-z" ? "ZAR" : "NGN",
          }))
          .reverse()
      },
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join("?")
      queries.push(query)
      if (query.includes('FROM "FinanceBook"')) {
        events.push(`book:${values[1]}`)
        expect(values[0]).toBe(actor.tenantId)
        return options.hasBook === false ? [] : [{ id: `book-${values[1]}` }]
      }
      events.push(
        query.includes('FROM "StockBalanceSource"')
          ? "balances-lock"
          : "source-lock",
      )
      expect(query).toContain("FOR UPDATE")
      if (query.includes('FROM "InventoryCloseout"'))
        return [{ id: "closeout-a" }]
      if (
        query.includes('FROM "StockBalanceSource"') &&
        input === closeoutInput
      )
        return [{ id: "balance-a" }]
      return [{ id: "locked-source" }]
    },
    stockOperation: {
      findUnique: async () => {
        events.push("replay")
        return options.replay === false ? null : retained
      },
      findFirst: async (args: unknown) => {
        const query = args as { select?: object; where: object }
        expect(query.where).toMatchObject({ tenantId: actor.tenantId })
        if (query.select) {
          events.push("operation-identity")
          return { storeId: "store-a" }
        }
        events.push("operation-graph")
        if (
          options.purchaseMovement ||
          options.costedMovement ||
          options.ordinaryCosted ||
          options.closeoutOwned ||
          options.openingOwned
        ) {
          return {
            id: "target-a",
            type: options.openingOwned
              ? "OPENING_STOCK"
              : options.ordinaryCosted
                ? "ADJUSTMENT"
                : undefined,
            storeId: "store-a",
            source: options.openingOwned,
            payloadHash: "a".repeat(64),
            clientOperationId:
              options.openingOwned === "catalog_setup"
                ? "opening-owner:opening-stock:variant:original"
                : "opening-owner:opening-stock",
            correctionOfOperationId: null,
            _count: {
              purchaseReceipts: 0,
              productReturns: options.ownedOrdinary ? 1 : 0,
              finalizedCloseouts: options.closeoutOwned ? 1 : 0,
            },
            categories: [],
            corrections: [],
            movements: [
              {
                id: "movement-a",
                balanceSource: { product: { catalogItemId: "catalog-a" } },
                purchaseReceipt: options.purchaseMovement
                  ? { id: "receipt-a" }
                  : null,
                valuationEvent: options.ordinaryCosted
                  ? {
                      id: "cost-event-a",
                      sourceKind: "ORDINARY_STOCK_OPERATION",
                      sourceId: options.wrongOrdinarySource
                        ? "other-source"
                        : "target-a",
                      stockOperationId: "target-a",
                      stockMovementId: "movement-a",
                      purchaseReceiptId: null,
                      productReturnCostId: null,
                    }
                  : options.costedMovement
                    ? { id: "cost-event-a" }
                    : null,
              },
            ],
          }
        }
        throw stopped
      },
      create: async () => {
        events.push("fresh-correction")
        throw stopped
      },
    },
    catalogCommandReceipt: {
      findMany: async ({ where, take }: { where: unknown; take: number }) => {
        expect(where).toEqual({
          tenantId: actor.tenantId,
          storeId: "store-a",
          catalogItemId: "catalog-a",
          payloadHash: "a".repeat(64),
          commandType:
            options.openingOwned === "catalog_setup"
              ? "CREATE_CATALOG_ITEM"
              : "GRADUATE_CATALOG_OFFERING",
        })
        expect(take).toBe(2)
        events.push("opening-owner")
        return [
          {
            id: "opening-receipt-a",
            ...(where as object),
            clientOperationId: "opening-owner",
          },
        ]
      },
    },
    stockMovement: {
      findMany: async () => {
        events.push("movement-identities")
        return [
          {
            balanceSourceId: "balance-z",
            balanceSource: {
              tenantId: options.foreignMovement
                ? "foreign-tenant"
                : actor.tenantId,
              storeId: "store-z",
            },
          },
        ]
      },
    },
    stockCount: {
      findFirst: async (args: unknown) => {
        const query = args as {
          select?: object
          where: { status?: string; tenantId: string }
        }
        expect(query.where.tenantId).toBe(actor.tenantId)
        if (query.select) {
          expect(query.where.status).toBeUndefined()
          events.push("count-identity")
          return { storeId: "store-a" }
        }
        events.push("count-graph")
        throw stopped
      },
    },
    stockCountLine: {
      findMany: async () => [{ balanceSourceId: "balance-a" }],
    },
    stockBalanceSource: {
      findFirst: async (args: unknown) => {
        const query = args as { select?: object; where: { tenantId: string } }
        expect(query.where.tenantId).toBe(actor.tenantId)
        if (query.select) {
          events.push("balance-identity")
          return { id: "balance-a", storeId: "store-a" }
        }
        events.push("balance-graph")
        throw stopped
      },
    },
    stockTransfer: {
      findUnique: async () => {
        events.push("replay")
        return options.replay === false ? null : retained
      },
      findFirst: async (args: unknown) => {
        const query = args as {
          select?: object
          where: { status?: string; tenantId: string }
        }
        expect(query.where.tenantId).toBe(actor.tenantId)
        if (query.select) {
          expect(query.where.status).toBeUndefined()
          events.push("transfer-identity")
          return {
            id: "transfer-a",
            sourceStoreId: "store-a",
            targetStoreId: "store-z",
          }
        }
        events.push("transfer-graph")
        throw stopped
      },
      findFirstOrThrow: async () => ({ ...retained, status: "RECEIVED" }),
    },
    inventoryCloseout: {
      findFirst: async (args: unknown) => {
        const query = args as {
          select?: object
          where: { status?: string; tenantId: string }
        }
        expect(query.where.tenantId).toBe(actor.tenantId)
        if (query.select) {
          expect(query.where.status).toBeUndefined()
          events.push("closeout-identity")
          return { id: "closeout-a", storeId: "store-a" }
        }
        events.push("closeout-graph")
        throw stopped
      },
    },
    inventoryCloseoutLine: {
      findMany: async () => [{ balanceSourceId: "balance-a" }],
    },
  }
  const db = {
    $transaction: async <T>(
      fn: (tx: Prisma.TransactionClient) => Promise<T>,
      opts: unknown,
    ) => {
      transactionOptions = opts
      return fn(tx as unknown as Prisma.TransactionClient)
    },
  }
  return {
    db: db as unknown as PrismaClient,
    tx: tx as unknown as Prisma.TransactionClient,
    events,
    queries,
    stopped,
    get transactionOptions() {
      return transactionOptions
    },
  }
}

test("multi-Store coordination deduplicates currencies and orders reversed inputs consistently", async () => {
  for (const storeIds of [
    ["store-z", "store-a", "store-b", "store-a"],
    ["store-b", "store-a", "store-z"],
  ]) {
    const f = fixture({})
    const contexts = await lockInventoryFinancialStores(f.tx, {
      tenantId: actor.tenantId,
      storeIds,
    })
    expect(f.events).toEqual(["stores-identity", "book:NGN", "book:ZAR"])
    expect(contexts).toHaveLength(2)
  }
})

test("missing Store fails before any book lock; no-book Stores keep operation", async () => {
  const denied = fixture({}, { missingStore: true })
  await expect(
    lockInventoryFinancialStores(denied.tx, {
      tenantId: actor.tenantId,
      storeIds: ["foreign"],
    }),
  ).rejects.toMatchObject({ code: "STORE_NOT_FOUND" })
  expect(denied.events).toEqual(["stores-identity"])
  const absent = fixture({}, { hasBook: false })
  expect(
    await lockInventoryFinancialStores(absent.tx, {
      tenantId: actor.tenantId,
      storeIds: ["store-a"],
    }),
  ).toEqual([null])
})

test("completed stock-source replay retains its result after coordination", async () => {
  const cases = [
    {
      input: transformInput,
      run: (f: ReturnType<typeof fixture>) =>
        transformPackagedStock(f.db, transformInput),
    },
    {
      input: countInput,
      run: (f: ReturnType<typeof fixture>) =>
        finalizeStockCount(f.db, countInput),
    },
    {
      input: correctionInput,
      run: (f: ReturnType<typeof fixture>) =>
        correctStockOperation(f.db, correctionInput),
    },
    {
      input: custodyInput,
      run: (f: ReturnType<typeof fixture>) =>
        moveInventoryCustody(f.db, custodyInput),
    },
    {
      input: dispatchInput,
      run: (f: ReturnType<typeof fixture>) =>
        createAndDispatchStockTransfer(f.db, dispatchInput),
    },
    {
      input: transitionInput,
      run: (f: ReturnType<typeof fixture>) =>
        receiveOrCancelStockTransfer(f.db, transitionInput),
    },
    {
      input: closeoutInput,
      run: (f: ReturnType<typeof fixture>) =>
        finalizeInventoryCloseout(f.db, closeoutInput),
    },
  ]
  for (const c of cases) {
    const f = fixture(c.input)
    expect((await c.run(f)).id).toBe("retained-source")
    expect(f.events.indexOf("replay")).toBeGreaterThan(
      f.events.indexOf("book:NGN"),
    )
    if (f.events.includes("book:ZAR")) {
      expect(f.events.indexOf("replay")).toBeGreaterThan(
        f.events.indexOf("book:ZAR"),
      )
    }
    expect(f.transactionOptions).toEqual({ maxWait: 10_000, timeout: 30_000 })
  }
})

test("correction coordinates both Store books before retaining replay", async () => {
  const f = fixture(correctionInput)
  await correctStockOperation(f.db, correctionInput)
  expect(f.events).toEqual([
    "operation-identity",
    "movement-identities",
    "stores-identity",
    "book:NGN",
    "book:ZAR",
    "replay",
  ])
})

test("foreign correction movement is refused before book or stock locks", async () => {
  const f = fixture(correctionInput, { foreignMovement: true })
  await expect(
    correctStockOperation(f.db, correctionInput),
  ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
  expect(f.events).toEqual(["operation-identity", "movement-identities"])
})

test("purchase-linked receipts remain protected from generic stock correction", async () => {
  const f = fixture(correctionInput, { replay: false, purchaseMovement: true })
  await expect(
    correctStockOperation(f.db, correctionInput),
  ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
  expect(f.events.indexOf("operation-graph")).toBeGreaterThan(
    f.events.indexOf("source-lock"),
  )
  expect(f.events.indexOf("balances-lock")).toBeGreaterThan(
    f.events.indexOf("book:ZAR"),
  )
})

test("costed Product issues and returns cannot bypass their financial source correction", async () => {
  const f = fixture(correctionInput, { replay: false, costedMovement: true })
  await expect(
    correctStockOperation(f.db, correctionInput),
  ).rejects.toMatchObject({
    code: "INVALID_STOCK_OPERATION",
  })
  expect(f.events.indexOf("operation-graph")).toBeGreaterThan(
    f.events.indexOf("balances-lock"),
  )
})

test("registered ordinary correction requires exact source provenance without trusted ownership", async () => {
  const input = {
    ...correctionInput,
    corrections: [
      {
        correctedEnteredQuantity: "1",
        expectedBalanceRevision: 0,
        movementId: "movement-a",
      },
    ],
  }
  const accepted = fixture(input, { replay: false, ordinaryCosted: true })
  await expect(correctStockOperation(accepted.db, input)).rejects.toBe(
    accepted.stopped,
  )
  expect(accepted.events).toContain("fresh-correction")
  for (const option of [
    { wrongOrdinarySource: true },
    { ownedOrdinary: true },
  ]) {
    const rejected = fixture(input, {
      replay: false,
      ordinaryCosted: true,
      ...option,
    })
    await expect(
      correctStockOperation(rejected.db, input),
    ).rejects.toMatchObject({
      code: "INVALID_STOCK_OPERATION",
    })
    expect(rejected.events).not.toContain("fresh-correction")
  }
})

test("fresh transformation/count/closeout locks before loading mutable balance graphs", async () => {
  for (const c of [
    {
      input: transformInput,
      graph: "balance-graph",
      run: (f: ReturnType<typeof fixture>) =>
        transformPackagedStock(f.db, transformInput),
    },
    {
      input: countInput,
      graph: "count-graph",
      run: (f: ReturnType<typeof fixture>) =>
        finalizeStockCount(f.db, countInput),
    },
    {
      input: closeoutInput,
      graph: "closeout-graph",
      run: (f: ReturnType<typeof fixture>) =>
        finalizeInventoryCloseout(f.db, closeoutInput),
    },
  ]) {
    const f = fixture(c.input, { replay: false })
    await expect(c.run(f)).rejects.toBe(f.stopped)
    expect(f.events.indexOf("balances-lock")).toBeGreaterThan(
      f.events.indexOf("book:NGN"),
    )
    expect(f.events.indexOf(c.graph)).toBeGreaterThan(
      f.events.indexOf("balances-lock"),
    )
    expect(
      f.queries.find((q) => q.includes('FROM "StockBalanceSource"')),
    ).toContain('ORDER BY "id"')
  }
})

test("uncosted closeout ownership blocks generic correction even without a Book", async () => {
  const f = fixture(correctionInput, {
    hasBook: false,
    replay: false,
    closeoutOwned: true,
  })
  await expect(
    correctStockOperation(f.db, correctionInput),
  ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
  expect(f.events).not.toContain("fresh-correction")
})

test("uncosted Catalog and graduation openings cannot bypass the owning receipt without a Book", async () => {
  for (const openingOwned of [
    "catalog_setup",
    "service_commerce_catalog_graduation",
  ] as const) {
    const f = fixture(correctionInput, {
      hasBook: false,
      replay: false,
      openingOwned,
    })
    await expect(
      correctStockOperation(f.db, correctionInput),
    ).rejects.toMatchObject({ code: "INVALID_STOCK_OPERATION" })
    expect(f.events).toContain("opening-owner")
    expect(f.events).not.toContain("fresh-correction")
  }
})

test("transfer transition obtains both books and source lock before mutable transit state", async () => {
  const f = fixture(transitionInput, { replay: false })
  await expect(
    receiveOrCancelStockTransfer(f.db, transitionInput),
  ).rejects.toBe(f.stopped)
  expect(f.events.indexOf("source-lock")).toBeGreaterThan(
    f.events.indexOf("book:ZAR"),
  )
  expect(f.events.indexOf("transfer-graph")).toBeGreaterThan(
    f.events.indexOf("source-lock"),
  )
})

test("graduation retains management authority and locks before source context reads", async () => {
  const input = {
    ...common,
    confirmed: true as const,
    currencyCode: "NGN",
    expectedOfferingRevision: 0,
    fixedPriceMinor: 100,
    offeringId: "offering-a",
    storeId: "store-a",
    draftKind: "product" as const,
    canonicalUnitName: "unit",
    category: "Goods",
    openingStockQuantity: "1",
    sku: "SKU-a",
    transactionScale: 0,
    variantName: "Default",
  }
  for (const options of [
    { manager: true, store: true, book: true },
    { manager: true, store: true, book: false },
    { manager: false, store: true, book: true },
    { manager: true, store: false, book: true },
  ]) {
    const events: string[] = []
    const stopped = new Error("stop at graduated source graph")
    const tx = {
      membership: {
        findFirst: async (args: unknown) => {
          expect((args as { where: object }).where).toMatchObject({
            tenantId: actor.tenantId,
            userId: actor.actorUserId,
            role: { in: ["OWNER", "ADMIN"] },
            status: "ACTIVE",
          })
          events.push("authority")
          return options.manager ? { id: "membership-a" } : null
        },
      },
      catalogCommandReceipt: { findUnique: async () => null },
      store: {
        findFirst: async (args: unknown) => {
          expect((args as { where: object }).where).toEqual({
            id: input.storeId,
            tenantId: actor.tenantId,
          })
          events.push("store")
          return options.store
            ? { id: input.storeId, currencyCode: "NGN" }
            : null
        },
      },
      $queryRaw: async (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        expect(strings.join("?")).toContain('FROM "FinanceBook"')
        expect(values).toEqual([actor.tenantId, "NGN"])
        events.push("book")
        return options.book ? [{ id: "book-a" }] : []
      },
      $executeRaw: async (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        expect(strings.join("?")).toContain("pg_advisory_xact_lock")
        expect(values).toEqual([
          JSON.stringify([
            "catalog-command",
            actor.tenantId,
            input.clientOperationId,
          ]),
        ])
        events.push("command-lock")
        return 1
      },
      sellableOffering: {
        findFirst: async () => {
          events.push("source")
          throw stopped
        },
      },
      serviceCommerceStoreProfile: { findFirst: async () => null },
    }
    const db = {
      $transaction: async <T>(
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
      ) => fn(tx as unknown as Prisma.TransactionClient),
    } as unknown as PrismaClient
    if (!options.manager) {
      await expect(
        graduateServiceCommerceCatalogOffering(db, input),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(events).toEqual(["authority"])
    } else if (!options.store) {
      await expect(
        graduateServiceCommerceCatalogOffering(db, input),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      expect(events).toEqual(["authority", "store"])
    } else {
      await expect(
        graduateServiceCommerceCatalogOffering(db, input),
      ).rejects.toBe(stopped)
      expect(events.indexOf("source")).toBeGreaterThan(
        events.indexOf("command-lock"),
      )
      expect(events.indexOf("command-lock")).toBeGreaterThan(
        events.indexOf("book"),
      )
    }
  }
})
