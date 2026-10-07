import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  resolveCommerceInventoryReturnPosting,
  resolveHistoricalCommerceInventoryReturnPosting,
} from "./inventory-return-posting-source"
import { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import type { PriorCostReviewSnapshot } from "./reviewed-cost-prior-sources"
import { readReviewedReturnCostPostingsInTransaction } from "./reviewed-cost-return-postings"
import type { readReviewedCostReturnsInTransaction } from "./reviewed-cost-returns"

const completedAt = new Date("2026-09-30T12:00:00.000Z")
const issueAt = new Date("2026-09-30T11:00:00.000Z")
const returnedAt = new Date("2026-09-30T13:00:00.000Z")
const returnedBeforeEarnedAt = new Date("2026-09-30T11:30:00.000Z")

function decimal(value: string) {
  return { toString: () => value, toFixed: () => value }
}

function fixture(
  options: {
    registered?: boolean
    unknown?: boolean
    unknownPool?: boolean
    packaged?: boolean
    zero?: boolean
    gross?: boolean
    returnAt?: Date
    archivedControls?: boolean
    allocationCount?: number
    movementCount?: number
    journalLineCount?: number
  } = {},
) {
  const packaged = options.packaged ?? false
  const factor = packaged ? "12" : "1"
  const effect = packaged ? "12" : "1"
  const issueEvent = {
    id: "issue-event",
    tenantId: "tenant-1",
    bookId: "book-1",
    balanceSourceId: "balance-1",
    pool: {
      tenantId: "tenant-1",
      bookId: "book-1",
      balanceSourceId: "balance-1",
    },
    stockOperationId: "issue-operation",
    stockMovementId: "issue-movement",
    kind: "ISSUE",
    sourceKind: "PRODUCT_FULFILLMENT",
    sourceId: "fulfillment-1",
    canonicalEffect: decimal(packaged ? "-24" : "-2"),
    effectiveAt: issueAt,
    actorUserId: "fulfiller-1",
    quantityBefore: decimal(packaged ? "120" : "10"),
    quantityAfter: decimal(packaged ? "96" : "8"),
    valueBeforeMinor: options.zero ? BigInt(0) : BigInt(1200),
    valueDeltaMinor: options.zero ? BigInt(0) : BigInt(-800),
    valueAfterMinor: options.zero ? BigInt(0) : BigInt(400),
    sourceCostMinor: options.zero ? BigInt(0) : BigInt(800),
    unknownReason: null,
  }
  const returned = options.returnAt ?? returnedAt
  const movement = {
    id: "return-movement",
    balanceSourceId: "balance-1",
    signedCanonicalEffect: decimal(effect),
    previousOnHandQuantity: decimal("8"),
    resultingOnHandQuantity: decimal("9"),
    enteredQuantity: decimal("1"),
    reversalOfMovementId: null,
    configurationVersionId: "configuration-1",
    enteredInventoryUnitId: "unit-1",
    unitFactorSnapshot: decimal(factor),
    balanceSource: {
      tenantId: "tenant-1",
      storeId: "store-1",
      kind: packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
      variantId: "variant-1",
      inventoryUnitId: "unit-1",
      inventoryUnit: { configurationVersionId: "configuration-1" },
    },
  }
  const event = {
    tenantId: "tenant-1",
    bookId: "book-1",
    balanceSourceId: "balance-1",
    stockOperationId: "return-operation",
    stockMovementId: "return-movement",
    productReturnCostId: "return-cost",
    kind: "CUSTOMER_RETURN",
    sourceKind: "PRODUCT_RETURN",
    sourceId: "return-1",
    canonicalEffect: decimal(effect),
    effectiveAt: returned,
    actorUserId: "return-actor",
    quantityBefore: decimal(packaged ? "96" : "8"),
    quantityAfter: decimal(packaged ? "108" : "9"),
    sourceCostMinor: options.unknown
      ? null
      : options.zero
        ? BigInt(0)
        : BigInt(400),
    valueBeforeMinor: options.unknown || options.unknownPool ? null : BigInt(0),
    valueDeltaMinor:
      options.unknown || options.unknownPool
        ? null
        : options.zero
          ? BigInt(0)
          : BigInt(400),
    valueAfterMinor:
      options.unknown || options.unknownPool
        ? null
        : options.zero
          ? BigInt(0)
          : BigInt(400),
    unknownReason:
      options.unknown || options.unknownPool ? "PRIOR_UNKNOWN_COST" : null,
    pool: {
      tenantId: "tenant-1",
      bookId: "book-1",
      balanceSourceId: "balance-1",
    },
    stockMovement: movement,
  }
  const allocation = {
    tenantId: "tenant-1",
    bookId: "book-1",
    orderLineId: "line-1",
    returnCostId: "return-cost",
    fulfillmentId: "fulfillment-1",
    originalIssueId: "issue-event",
    canonicalQuantity: decimal(effect),
    remainingQuantityBefore: decimal(packaged ? "24" : "2"),
    remainingQuantityAfter: decimal(packaged ? "12" : "1"),
    sourceCostMinor: options.unknown
      ? null
      : options.zero
        ? BigInt(0)
        : BigInt(400),
    remainingCostBeforeMinor: options.unknown
      ? null
      : options.zero
        ? BigInt(0)
        : BigInt(800),
    remainingCostAfterMinor: options.unknown
      ? null
      : options.zero
        ? BigInt(0)
        : BigInt(400),
    unknownReason: options.unknown ? "PRIOR_UNKNOWN_COST" : null,
    fulfillment: {
      id: "fulfillment-1",
      orderLineId: "line-1",
      stockOperationId: "issue-operation",
    },
    originalIssue: issueEvent,
  }
  const financeCost =
    options.registered === false
      ? null
      : {
          id: "return-cost",
          tenantId: "tenant-1",
          bookId: "book-1",
          orderLineId: "line-1",
          productReturnId: "return-1",
          canonicalQuantity: decimal(effect),
          sourceCostMinor: options.unknown
            ? null
            : options.zero
              ? BigInt(0)
              : BigInt(400),
          unknownReason: options.unknown ? "PRIOR_UNKNOWN_COST" : null,
          allocations: [allocation],
          valuationEvent: event,
        }
  const order = {
    id: "order-1",
    tenantId: "tenant-1",
    storeId: "store-1",
    orderNumber: "ORD-1",
    currencyCode: "NGN",
    totalMinor: 100,
    taxMinor: 100,
    status: "COMPLETED",
    completedAt,
    createdByUserId: "order-actor",
    store: { tenantId: "tenant-1", currencyCode: "NGN" },
  }
  const productReturn = {
    id: "return-1",
    tenantId: "tenant-1",
    storeId: "store-1",
    orderId: "order-1",
    orderLineId: "line-1",
    quantity: decimal("1"),
    disposition: "RESTOCK",
    destinationBalanceSourceId: "balance-1",
    stockOperationId: "return-operation",
    actorUserId: "return-actor",
    order,
    orderLine: {
      id: "line-1",
      orderId: "order-1",
      snapshot: {
        balanceSourceId: "balance-1",
        variantId: "variant-1",
        configurationVersionId: "configuration-1",
        inventoryUnitId: "unit-1",
        unitFactor: decimal(factor),
        stockBehavior: packaged ? "PACKAGED_STOCK" : "CANONICAL_SHARED",
      },
    },
    stockOperation: {
      id: "return-operation",
      tenantId: "tenant-1",
      storeId: "store-1",
      type: "RETURN",
      source: "commercial_order_return",
      effectiveAt: returned,
      actorUserId: "return-actor",
      movements: [movement],
    },
    financeCost,
  }
  const originalLines = [
    {
      id: "line-1",
      kind: "PRODUCT_UNIT",
      quantity: decimal("2"),
      snapshot: {
        balanceSourceId: "balance-1",
        configurationVersionId: "configuration-1",
        inventoryUnitId: "unit-1",
        unitFactor: decimal(factor),
        stockBehavior: packaged ? "PACKAGED_STOCK" : "CANONICAL_SHARED",
      },
      productFulfillments: [
        {
          id: "fulfillment-1",
          reservationId: "reservation-1",
          stockOperationId: "issue-operation",
          quantity: decimal("2"),
          createdAt: issueAt,
          reservation: {
            id: "reservation-1",
            tenantId: "tenant-1",
            storeId: "store-1",
            commercialOrderLineId: "line-1",
            balanceSourceId: "balance-1",
            configurationVersionId: "configuration-1",
            enteredInventoryUnitId: "unit-1",
            enteredQuantity: decimal("2"),
            unitFactorSnapshot: decimal(factor),
            canonicalQuantity: decimal(packaged ? "24" : "2"),
            status: "COMMITTED",
          },
          stockOperation: {
            id: "issue-operation",
            tenantId: "tenant-1",
            storeId: "store-1",
            type: "SALE_FULFILLMENT",
            source: "commercial_order",
            actorUserId: "fulfiller-1",
            effectiveAt: issueAt,
            movements: [
              {
                id: "issue-movement",
                balanceSourceId: "balance-1",
                signedCanonicalEffect: decimal(packaged ? "-24" : "-2"),
                previousOnHandQuantity: decimal("10"),
                resultingOnHandQuantity: decimal("8"),
                enteredQuantity: decimal("2"),
                reversalOfMovementId: null,
                configurationVersionId: "configuration-1",
                enteredInventoryUnitId: "unit-1",
                unitFactorSnapshot: decimal(factor),
                balanceSource: {
                  tenantId: "tenant-1",
                  storeId: "store-1",
                  kind: packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
                },
              },
            ],
          },
        },
      ],
    },
  ]
  const accounts = [
    {
      id: "cogs",
      code: "5000",
      kind: "EXPENSE",
      purpose: "COST_OF_SALES",
      archivedAt: options.archivedControls ? returnedAt : null,
    },
    {
      id: "inventory",
      code: "1300",
      kind: "ASSET",
      purpose: "INVENTORY",
      archivedAt: options.archivedControls ? returnedAt : null,
    },
  ]
  const book = {
    id: "book-1",
    tenantId: "tenant-1",
    currencyCode: "NGN",
    lastSequence: 5n,
  }
  const tx = {
    $queryRaw: async () => [{ id: book.id }],
    membership: { findFirst: async () => ({ tenant: { isActive: true } }) },
    productReturn: {
      findFirst: async () => productReturn,
      findMany: async (args: {
        select?: { financeCost?: { select?: { _count?: unknown } } }
      }) =>
        args.select?.financeCost?.select?._count
          ? [
              {
                id: "return-1",
                orderId: "order-1",
                tenantId: "tenant-1",
                disposition: "RESTOCK",
                financeCost: {
                  _count: { allocations: options.allocationCount ?? 1 },
                },
                stockOperation: {
                  _count: { movements: options.movementCount ?? 1 },
                },
              },
            ]
          : [{ id: "return-1", disposition: "RESTOCK", financeCost }],
    },
    financeBook: {
      findUnique: async () => book,
      findUniqueOrThrow: async () => book,
    },
    commercialOrder: {
      findFirst: async () => order,
      findMany: async () => [
        {
          id: "order-1",
          tenantId: "tenant-1",
          currencyCode: "NGN",
          _count: { lines: 1 },
        },
      ],
    },
    commercialOrderLine: {
      findMany: async (args: {
        include?: { productFulfillments?: unknown }
        select?: { _count?: unknown }
      }) =>
        args.select?._count
          ? [
              {
                id: "line-1",
                orderId: "order-1",
                _count: { productFulfillments: 1, serviceJobLines: 0 },
              },
            ]
          : args.include?.productFulfillments
            ? originalLines
            : [
                {
                  id: "line-1",
                  kind: "PRODUCT_UNIT",
                  quantity: decimal("2"),
                  productFulfillments: [
                    { quantity: decimal("2"), createdAt: issueAt },
                  ],
                  serviceJobLines: [],
                },
              ],
    },
    productFulfillment: {
      findMany: async () => [
        {
          id: "fulfillment-1",
          orderLineId: "line-1",
          stockOperation: { _count: { movements: 1 } },
        },
      ],
    },
    financeInventoryValuationEvent: { findUnique: async () => issueEvent },
    financeJournalEntry: {
      findUnique: async (args: {
        where: { bookId_sourceKind_sourceId?: { sourceKind: string } }
      }) =>
        args.where.bookId_sourceKind_sourceId?.sourceKind ===
          "COMMERCIAL_ORDER_COGS" && options.gross !== false
          ? {
              id: "gross-entry",
              reversalOfId: null,
              storeId: "store-1",
              actorUserId: "order-actor",
              effectiveAt: completedAt,
              lines: [
                {
                  account: accounts[0],
                  debitMinor: BigInt(800),
                  creditMinor: BigInt(0),
                },
                {
                  account: accounts[1],
                  debitMinor: BigInt(0),
                  creditMinor: BigInt(800),
                },
              ],
            }
          : null,
      findFirst: async () => null,
      findMany: async (args: {
        where?: { id?: unknown }
        select?: { _count?: unknown }
      }) =>
        args.where?.id
          ? [
              {
                id: "original-return-journal",
                bookId: "book-1",
                sourceKind: "PRODUCT_RETURN_COGS",
                sourceId: "return-1",
              },
            ]
          : args.select?._count
            ? [
                { id: "gross-entry", _count: { lines: 2 } },
                {
                  id: "original-return-journal",
                  _count: { lines: options.journalLineCount ?? 2 },
                },
              ]
            : [],
    },
    financeAccount: {
      findMany: async (args: { where: { archivedAt?: null } }) =>
        accounts.filter(
          (a) => !("archivedAt" in args.where) || a.archivedAt === null,
        ),
    },
  }
  return tx as unknown as Prisma.TransactionClient
}

describe("commerce inventory return source", () => {
  test("posts a partial RESTOCK at original allocated issue cost", async () => {
    const result = await resolveCommerceInventoryReturnPosting(fixture(), {
      tenantId: "tenant-1",
      productReturnId: "return-1",
    })
    expect(result?.input).toMatchObject({
      actorUserId: "return-actor",
      sourceKind: "PRODUCT_RETURN_COGS",
      sourceId: "return-1",
      effectiveAt: returnedAt,
      lines: [
        { accountId: "inventory", side: "DEBIT", amountMinor: "400" },
        { accountId: "cogs", side: "CREDIT", amountMinor: "400" },
      ],
    })
  })

  test("leaves unregistered and UNKNOWN costs out of journal coverage", async () => {
    expect(
      await resolveCommerceInventoryReturnPosting(
        fixture({ registered: false }),
        {
          tenantId: "tenant-1",
          productReturnId: "return-1",
        },
      ),
    ).toBeNull()
    expect(
      await resolveCommerceInventoryReturnPosting(fixture({ unknown: true }), {
        tenantId: "tenant-1",
        productReturnId: "return-1",
      }),
    ).toBeNull()
  })

  test("posts known original cost when the destination pool value is UNKNOWN", async () => {
    const result = await resolveCommerceInventoryReturnPosting(
      fixture({ unknownPool: true }),
      { tenantId: "tenant-1", productReturnId: "return-1" },
    )
    expect(result?.input.lines[0]?.amountMinor).toBe("400")
  })

  test("converts packaged return movements to canonical event quantity", async () => {
    const result = await resolveCommerceInventoryReturnPosting(
      fixture({ packaged: true }),
      { tenantId: "tenant-1", productReturnId: "return-1" },
    )
    expect(result?.input.lines[0]?.amountMinor).toBe("400")
  })

  test("does not emit zero-value journals and waits for original gross COGS", async () => {
    expect(
      await resolveCommerceInventoryReturnPosting(fixture({ zero: true }), {
        tenantId: "tenant-1",
        productReturnId: "return-1",
      }),
    ).toBeNull()
    expect(
      await resolveCommerceInventoryReturnPosting(fixture({ gross: false }), {
        tenantId: "tenant-1",
        productReturnId: "return-1",
      }),
    ).toBeNull()
  })

  test("rejects partial-null registration and issue-before-return chronology", async () => {
    const partial = fixture() as unknown as {
      productReturn: { findFirst: () => Promise<Record<string, unknown>> }
    }
    const record = await partial.productReturn.findFirst()
    const financeCost = record.financeCost as Record<string, unknown>
    financeCost.sourceCostMinor = null
    financeCost.unknownReason = null
    await expect(
      resolveCommerceInventoryReturnPosting(
        partial as unknown as Prisma.TransactionClient,
        {
          tenantId: "tenant-1",
          productReturnId: "return-1",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(
      resolveCommerceInventoryReturnPosting(
        fixture({ returnAt: new Date("2026-09-30T10:00:00.000Z") }),
        {
          tenantId: "tenant-1",
          productReturnId: "return-1",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  test("delays a pre-EARNED return journal to the original COGS posting date", async () => {
    const result = await resolveCommerceInventoryReturnPosting(
      fixture({ returnAt: returnedBeforeEarnedAt }),
      {
        tenantId: "tenant-1",
        productReturnId: "return-1",
      },
    )
    expect(result?.input.effectiveAt).toEqual(completedAt)
  })
})

const heldScope = {
  tenantId: "tenant-1",
  actorUserId: "reviewer",
  bookId: "book-1",
}
function referencedReturn(): PriorCostReviewSnapshot {
  return {
    reviews: [],
    allocations: [],
    poolSnapshots: [],
    evidence: [],
    journals: [
      {
        id: "reference",
        tenantId: heldScope.tenantId,
        bookId: heldScope.bookId,
        reviewId: "review",
        journalEntryId: "original-return-journal",
        groupKey: "restock",
        basis: {},
      },
    ],
  }
}
function originalReturnScope() {
  return {
    snapshot: {
      tenantId: heldScope.tenantId,
      bookId: heldScope.bookId,
      currencyCode: "NGN",
      lines: [{ id: "line-1", orderId: "order-1" }],
      returns: [
        { id: "return-1", orderLineId: "line-1", disposition: "RESTOCK" },
      ],
    },
  } as unknown as Awaited<
    ReturnType<typeof readReviewedCostReturnsInTransaction>
  >
}
describe("historical original restock source", () => {
  test("retains original return actor, cost and delayed date with archived controls", async () => {
    const tx = fixture({
      archivedControls: true,
      returnAt: returnedBeforeEarnedAt,
    })
    await expect(
      resolveCommerceInventoryReturnPosting(tx, {
        tenantId: heldScope.tenantId,
        productReturnId: "return-1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    const context = await ReviewedCostBookContext.acquire(tx, heldScope)
    const result = await resolveHistoricalCommerceInventoryReturnPosting(
      tx,
      { ...heldScope, productReturnId: "return-1" },
      context,
    )
    expect(result?.input).toMatchObject({
      actorUserId: "return-actor",
      effectiveAt: completedAt,
      storeId: "store-1",
      sourceKind: "PRODUCT_RETURN_COGS",
      sourceId: "return-1",
      description: "Returned inventory cost: ORD-1",
      lines: [
        { accountId: "inventory", side: "DEBIT", amountMinor: "400" },
        { accountId: "cogs", side: "CREDIT", amountMinor: "400" },
      ],
    })
    await expect(
      resolveHistoricalCommerceInventoryReturnPosting(
        tx,
        { ...heldScope, actorUserId: "other", productReturnId: "return-1" },
        context,
      ),
    ).rejects.toThrow("cannot cross")
    await expect(
      resolveHistoricalCommerceInventoryReturnPosting(
        fixture(),
        { ...heldScope, productReturnId: "return-1" },
        context,
      ),
    ).rejects.toThrow("cannot cross")
  })

  test("binds an actual referenced return to its original complete Order", async () => {
    const tx = fixture({ archivedControls: true })
    const context = await ReviewedCostBookContext.acquire(tx, heldScope)
    const result = await readReviewedReturnCostPostingsInTransaction(
      tx,
      heldScope,
      context,
      referencedReturn(),
      originalReturnScope(),
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      entryId: "original-return-journal",
      input: {
        actorUserId: "return-actor",
        effectiveAt: returnedAt,
        lines: [
          { accountId: "inventory", side: "DEBIT", amountMinor: "400" },
          { accountId: "cogs", side: "CREDIT", amountMinor: "400" },
        ],
      },
    })
    const empty = referencedReturn()
    empty.journals = []
    expect(
      await readReviewedReturnCostPostingsInTransaction(
        tx,
        heldScope,
        context,
        empty,
        originalReturnScope(),
      ),
    ).toEqual([])
  })

  test("refuses unknown, zero, oversized allocations, movements and journal lines", async () => {
    for (const options of [
      { unknown: true },
      { zero: true },
      { allocationCount: 4097 },
      { allocationCount: -1 },
      { movementCount: 2 },
      { journalLineCount: 3 },
    ]) {
      const tx = fixture(options)
      const context = await ReviewedCostBookContext.acquire(tx, heldScope)
      await expect(
        readReviewedReturnCostPostingsInTransaction(
          tx,
          heldScope,
          context,
          referencedReturn(),
          originalReturnScope(),
        ),
      ).rejects.toThrow("Original restock")
    }
  })

  test("rejects changed Tenant/Book, non-restock, missing original line and duplicate source", async () => {
    const tx = fixture()
    const context = await ReviewedCostBookContext.acquire(tx, heldScope)
    for (const change of [
      "tenant",
      "book",
      "line",
      "disposition",
      "duplicate",
    ]) {
      const source = originalReturnScope()
      const original = source.snapshot.returns[0]
      if (!original) throw new Error("Expected an original return")
      if (change === "tenant") source.snapshot.tenantId = "other"
      if (change === "book") source.snapshot.bookId = "other"
      if (change === "line") source.snapshot.lines = []
      if (change === "disposition") original.disposition = "QUARANTINE"
      if (change === "duplicate") source.snapshot.returns.push(original)
      await expect(
        readReviewedReturnCostPostingsInTransaction(
          tx,
          heldScope,
          context,
          referencedReturn(),
          source,
        ),
      ).rejects.toThrow("Original restock")
    }
  })
})
