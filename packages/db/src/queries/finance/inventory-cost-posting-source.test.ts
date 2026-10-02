import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  resolveCommerceInventoryCostPosting,
  resolveHistoricalCommerceInventoryCostPosting,
} from "./inventory-cost-posting-source"
import { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import {
  assertReviewedCommerceCostReadBounds,
  readReviewedCommerceCostPostingsInTransaction,
} from "./reviewed-cost-commerce-postings"
import type { PriorCostReviewSnapshot } from "./reviewed-cost-prior-sources"
import type { readReviewedCostReturnsInTransaction } from "./reviewed-cost-returns"

const completedAt = new Date("2026-09-30T12:00:00.000Z")
const issuedAt = new Date("2026-09-30T11:00:00.000Z")

function decimal(value: string) {
  return { toString: () => value, toFixed: () => value }
}

function fixture(
  overrides: {
    order?: Record<string, unknown>
    line?: Record<string, unknown>
    completionLines?: Array<Record<string, unknown>>
    event?: Record<string, unknown> | null
    earned?: boolean
    returns?: boolean
    accounts?: Array<Record<string, unknown>>
    operationEffectiveAt?: Date
    packaged?: boolean
  } = {},
) {
  const packaged = overrides.packaged ?? false
  const factor = packaged ? "12" : "1"
  const canonicalDepletion = packaged ? "-24" : "-2"
  const canonicalBefore = packaged ? "120" : "10"
  const canonicalAfter = packaged ? "96" : "8"
  const book = {
    id: "book-1",
    tenantId: "tenant-1",
    currencyCode: "NGN",
    lastSequence: 5n,
  }
  const movement = {
    id: "movement-1",
    balanceSourceId: "balance-1",
    signedCanonicalEffect: decimal(canonicalDepletion),
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
  }
  const operation = {
    id: "operation-1",
    tenantId: "tenant-1",
    storeId: "store-1",
    type: "SALE_FULFILLMENT",
    source: "commercial_order",
    productFulfillments: [],
    actorUserId: "fulfiller-1",
    effectiveAt: overrides.operationEffectiveAt ?? issuedAt,
    movements: [movement],
  }
  const fulfillment = {
    id: "fulfillment-1",
    reservationId: "reservation-1",
    stockOperationId: "operation-1",
    quantity: decimal("2"),
    createdAt: issuedAt,
    reservation: {
      id: "reservation-1",
      tenantId: "tenant-1",
      storeId: "store-1",
      offeringId: "offering-1",
      commercialOrderLineId: "line-1",
      balanceSourceId: "balance-1",
      configurationVersionId: "configuration-1",
      enteredInventoryUnitId: "unit-1",
      enteredQuantity: decimal("2"),
      unitFactorSnapshot: decimal(factor),
      canonicalQuantity: decimal(packaged ? "24" : "2"),
      status: "COMMITTED",
    },
    stockOperation: operation,
  }
  const line = {
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
    productFulfillments: [fulfillment],
    ...overrides.line,
  }
  const order = {
    id: "order-1",
    tenantId: "tenant-1",
    storeId: "store-1",
    orderNumber: "ORD-1",
    currencyCode: "NGN",
    totalMinor: 5000,
    taxMinor: 0,
    status: "COMPLETED",
    completedAt,
    createdByUserId: "order-actor-1",
    store: { tenantId: "tenant-1", currencyCode: "NGN" },
    ...overrides.order,
  }
  const completionLines = overrides.completionLines ?? [
    {
      id: "line-1",
      kind: "PRODUCT_UNIT",
      quantity: decimal("2"),
      productFulfillments: [{ quantity: decimal("2"), createdAt: issuedAt }],
      serviceJobLines: [],
    },
  ]
  const event =
    overrides.event === undefined
      ? {
          tenantId: "tenant-1",
          bookId: "book-1",
          balanceSourceId: "balance-1",
          pool: {
            tenantId: "tenant-1",
            bookId: "book-1",
            balanceSourceId: "balance-1",
          },
          stockOperationId: "operation-1",
          stockMovementId: "movement-1",
          kind: "ISSUE",
          sourceKind: "PRODUCT_FULFILLMENT",
          sourceId: "fulfillment-1",
          canonicalEffect: decimal(canonicalDepletion),
          effectiveAt: overrides.operationEffectiveAt ?? issuedAt,
          actorUserId: "fulfiller-1",
          quantityBefore: decimal(canonicalBefore),
          quantityAfter: decimal(canonicalAfter),
          valueBeforeMinor: BigInt(4000),
          valueDeltaMinor: BigInt(-800),
          valueAfterMinor: BigInt(3200),
          sourceCostMinor: BigInt(800),
          unknownReason: null,
        }
      : overrides.event

  const accountReads: unknown[] = []
  const tx = {
    $queryRaw: async () => [{ id: book.id }],
    membership: { findFirst: async () => ({ tenant: { isActive: true } }) },
    commercialOrder: {
      findFirst: async () => order,
      findMany: async () => [
        {
          id: order.id,
          tenantId: order.tenantId,
          currencyCode: order.currencyCode,
          _count: { lines: 1 },
        },
      ],
    },
    financeBook: {
      findUnique: async () => book,
      findUniqueOrThrow: async () => book,
    },
    financeJournalEntry: {
      findMany: async () => [
        {
          id: "original-cogs",
          bookId: book.id,
          sourceKind: "COMMERCIAL_ORDER_COGS",
          sourceId: order.id,
        },
      ],
      findUnique: async () =>
        overrides.earned === false ? null : { id: "earned-1" },
    },
    productReturn: {
      findFirst: async () => (overrides.returns ? { id: "return-1" } : null),
    },
    commercialOrderLine: {
      findMany: async (args: {
        include?: { productFulfillments?: unknown }
        select?: { _count?: unknown }
      }) =>
        args.select?._count
          ? [
              {
                id: line.id,
                orderId: order.id,
                _count: { productFulfillments: 1, serviceJobLines: 0 },
              },
            ]
          : args.include?.productFulfillments
            ? [line]
            : completionLines,
    },
    productFulfillment: {
      findMany: async () => [
        {
          id: fulfillment.id,
          orderLineId: line.id,
          stockOperation: { _count: { movements: 1 } },
        },
      ],
    },
    financeInventoryValuationEvent: {
      findUnique: async () => event,
    },
    financeAccount: {
      findMany: async (args: { where: { archivedAt?: null } }) => {
        accountReads.push(args.where)
        const accounts: Array<Record<string, unknown>> = overrides.accounts ?? [
          {
            id: "cogs",
            code: "5000",
            kind: "EXPENSE",
            purpose: "COST_OF_SALES",
          },
          {
            id: "inventory",
            code: "1300",
            kind: "ASSET",
            purpose: "INVENTORY",
          },
        ]
        return accounts.filter(
          (a) => !("archivedAt" in args.where) || a.archivedAt == null,
        )
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    order,
    event,
    operation,
    accountReads,
  }
}

describe("commerce inventory cost source", () => {
  test("derives balanced COGS from the linked immutable issue cost", async () => {
    const result = await resolveCommerceInventoryCostPosting(fixture().tx, {
      tenantId: "tenant-1",
      orderId: "order-1",
    })
    expect(result?.input).toMatchObject({
      actorUserId: "order-actor-1",
      sourceKind: "COMMERCIAL_ORDER_COGS",
      sourceId: "order-1",
      effectiveAt: completedAt,
      lines: [
        { accountId: "cogs", side: "DEBIT", amountMinor: "800" },
        { accountId: "inventory", side: "CREDIT", amountMinor: "800" },
      ],
    })
  })

  test("converts packaged movement quantities to canonical valuation quantities", async () => {
    const result = await resolveCommerceInventoryCostPosting(
      fixture({ packaged: true }).tx,
      {
        tenantId: "tenant-1",
        orderId: "order-1",
      },
    )
    expect(result?.input.lines[0]?.amountMinor).toBe("800")
  })

  test("leaves missing or unknown issue costs unposted", async () => {
    const missing = fixture({ event: null })
    const unknown = fixture({
      event: {
        ...fixture().event,
        sourceCostMinor: null,
        valueBeforeMinor: null,
        valueDeltaMinor: null,
        valueAfterMinor: null,
        unknownReason: "PRIOR_UNKNOWN_COST",
      },
    })
    expect(
      await resolveCommerceInventoryCostPosting(missing.tx, {
        tenantId: "tenant-1",
        orderId: "order-1",
      }),
    ).toBeNull()
    expect(
      await resolveCommerceInventoryCostPosting(unknown.tx, {
        tenantId: "tenant-1",
        orderId: "order-1",
      }),
    ).toBeNull()
  })

  test("rejects valuation linked to a different Book", async () => {
    const source = fixture({
      event: { ...fixture().event, bookId: "other-book" },
    })
    await expect(
      resolveCommerceInventoryCostPosting(source.tx, {
        tenantId: "tenant-1",
        orderId: "order-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  test("does not create a zero-value journal", async () => {
    const source = fixture({
      event: {
        ...fixture().event,
        valueBeforeMinor: BigInt(0),
        valueDeltaMinor: BigInt(0),
        valueAfterMinor: BigInt(0),
        sourceCostMinor: BigInt(0),
      },
    })
    expect(
      await resolveCommerceInventoryCostPosting(source.tx, {
        tenantId: "tenant-1",
        orderId: "order-1",
      }),
    ).toBeNull()
  })

  test("requires full completion and earned revenue when positive", async () => {
    const incomplete = fixture({
      completionLines: [
        {
          id: "line-1",
          kind: "PRODUCT_UNIT",
          quantity: decimal("2"),
          productFulfillments: [
            { quantity: decimal("1"), createdAt: issuedAt },
          ],
          serviceJobLines: [],
        },
      ],
    })
    const noEarned = fixture({ earned: false })
    const returned = fixture({ returns: true })
    expect(
      await resolveCommerceInventoryCostPosting(incomplete.tx, {
        tenantId: "tenant-1",
        orderId: "order-1",
      }),
    ).toBeNull()
    await expect(
      resolveCommerceInventoryCostPosting(noEarned.tx, {
        tenantId: "tenant-1",
        orderId: "order-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(
      (
        await resolveCommerceInventoryCostPosting(returned.tx, {
          tenantId: "tenant-1",
          orderId: "order-1",
        })
      )?.input.lines[0]?.amountMinor,
    ).toBe("800")
  })

  test("rejects completion dated before an immutable issue and requires reserved accounts", async () => {
    const lateIssue = fixture({
      operationEffectiveAt: new Date("2026-09-30T13:00:00.000Z"),
    })
    const missingAccount = fixture({ accounts: [] })
    await expect(
      resolveCommerceInventoryCostPosting(lateIssue.tx, {
        tenantId: "tenant-1",
        orderId: "order-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(
      resolveCommerceInventoryCostPosting(missingAccount.tx, {
        tenantId: "tenant-1",
        orderId: "order-1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  test("permits fully completed zero-net Product Orders without an EARNED journal", async () => {
    const source = fixture({
      order: { totalMinor: 100, taxMinor: 100 },
      earned: false,
    })
    const result = await resolveCommerceInventoryCostPosting(source.tx, {
      tenantId: "tenant-1",
      orderId: "order-1",
    })
    expect(result?.input.lines[0]?.amountMinor).toBe("800")
  })
})

const heldScope = {
  tenantId: "tenant-1",
  actorUserId: "reviewer-1",
  bookId: "book-1",
}
function priorReferences(): PriorCostReviewSnapshot {
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
        journalEntryId: "original-cogs",
        groupKey: "original",
        basis: {},
      },
    ],
  }
}
function originalSourceScope() {
  // Only ownership headers are needed for this focused repository read fixture.
  return {
    snapshot: {
      tenantId: heldScope.tenantId,
      bookId: heldScope.bookId,
      currencyCode: "NGN",
      lines: [{ orderId: "order-1" }],
    },
  } as unknown as Awaited<
    ReturnType<typeof readReviewedCostReturnsInTransaction>
  >
}

describe("historical Commerce COGS source", () => {
  test("retains archived original controls only for the held historical read", async () => {
    const source = fixture({
      accounts: [
        {
          id: "original-cogs-account",
          code: "5000",
          kind: "EXPENSE",
          purpose: "COST_OF_SALES",
          archivedAt: issuedAt,
        },
        {
          id: "original-inventory-account",
          code: "1300",
          kind: "ASSET",
          purpose: "INVENTORY",
          archivedAt: issuedAt,
        },
      ],
    })
    await expect(
      resolveCommerceInventoryCostPosting(source.tx, {
        tenantId: heldScope.tenantId,
        orderId: "order-1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    const context = await ReviewedCostBookContext.acquire(source.tx, heldScope)
    const result = await resolveHistoricalCommerceInventoryCostPosting(
      source.tx,
      { ...heldScope, orderId: "order-1" },
      context,
    )
    expect(source.accountReads).toEqual([
      { bookId: "book-1", archivedAt: null, code: { in: ["5000", "1300"] } },
      { bookId: "book-1", code: { in: ["5000", "1300"] } },
    ])
    expect(result?.input).toMatchObject({
      actorUserId: "order-actor-1",
      effectiveAt: completedAt,
      storeId: "store-1",
      sourceId: "order-1",
      lines: [
        {
          accountId: "original-cogs-account",
          side: "DEBIT",
          amountMinor: "800",
        },
        {
          accountId: "original-inventory-account",
          side: "CREDIT",
          amountMinor: "800",
        },
      ],
    })
    await expect(
      resolveHistoricalCommerceInventoryCostPosting(
        source.tx,
        { ...heldScope, actorUserId: "other-reviewer", orderId: "order-1" },
        context,
      ),
    ).rejects.toThrow("cannot cross")
    await expect(
      resolveHistoricalCommerceInventoryCostPosting(
        fixture().tx,
        { ...heldScope, orderId: "order-1" },
        context,
      ),
    ).rejects.toThrow("cannot cross")
  })

  test("loads referenced original COGS through actual source and complete preflight", async () => {
    const source = fixture()
    const context = await ReviewedCostBookContext.acquire(source.tx, heldScope)
    const result = await readReviewedCommerceCostPostingsInTransaction(
      source.tx,
      heldScope,
      context,
      priorReferences(),
      originalSourceScope(),
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      entryId: "original-cogs",
      input: {
        tenantId: "tenant-1",
        bookId: "book-1",
        actorUserId: "order-actor-1",
        sourceKind: "COMMERCIAL_ORDER_COGS",
        effectiveAt: completedAt,
        description: "Cost of goods sold: ORD-1",
        lines: [
          { accountId: "cogs", side: "DEBIT", amountMinor: "800" },
          { accountId: "inventory", side: "CREDIT", amountMinor: "800" },
        ],
      },
    })
    const prior = priorReferences()
    prior.journals[0].bookId = "other-book"
    await expect(
      readReviewedCommerceCostPostingsInTransaction(
        source.tx,
        heldScope,
        context,
        prior,
        originalSourceScope(),
      ),
    ).rejects.toThrow("held scope")
  })

  test("never invents a posted cost from unknown or zero original issue costs", async () => {
    for (const sourceCostMinor of [null, 0n]) {
      const source = fixture({
        event: {
          ...fixture().event,
          sourceCostMinor,
          valueBeforeMinor: sourceCostMinor === null ? null : 4000n,
          valueDeltaMinor: sourceCostMinor === null ? null : 0n,
          valueAfterMinor: sourceCostMinor === null ? null : 4000n,
          unknownReason:
            sourceCostMinor === null ? "MISSING_OPENING_COST" : null,
        },
      })
      const context = await ReviewedCostBookContext.acquire(
        source.tx,
        heldScope,
      )
      await expect(
        readReviewedCommerceCostPostingsInTransaction(
          source.tx,
          heldScope,
          context,
          priorReferences(),
          originalSourceScope(),
        ),
      ).rejects.toThrow("Original Commerce COGS")
      expect(source.accountReads).toHaveLength(0)
      const empty = priorReferences()
      empty.journals = []
      expect(
        await readReviewedCommerceCostPostingsInTransaction(
          source.tx,
          heldScope,
          context,
          empty,
          originalSourceScope(),
        ),
      ).toEqual([])
    }
  })

  test("refuses omitted original obligations, oversized relations and duplicate controls", async () => {
    const input = {
      tenantId: "tenant-1",
      currencyCode: "NGN",
      orderIds: ["order-1"],
      orders: [
        {
          id: "order-1",
          tenantId: "tenant-1",
          currencyCode: "NGN",
          _count: { lines: 1 },
        },
      ],
      lines: [
        {
          id: "line-1",
          orderId: "order-1",
          _count: { productFulfillments: 1, serviceJobLines: 0 },
        },
      ],
    }
    expect(() => assertReviewedCommerceCostReadBounds(input)).not.toThrow()
    for (const changed of [
      { ...input, lines: [] },
      { ...input, currencyCode: "USD" },
      { ...input, lines: [input.lines[0], input.lines[0]] },
      {
        ...input,
        lines: [
          {
            ...input.lines[0],
            _count: { productFulfillments: 4096, serviceJobLines: 1 },
          },
        ],
      },
      { ...input, orders: [{ ...input.orders[0], _count: { lines: 129 } }] },
    ])
      expect(() => assertReviewedCommerceCostReadBounds(changed)).toThrow(
        "complete bounds",
      )
    const source = fixture({
      accounts: [
        {
          id: "first",
          code: "5000",
          kind: "EXPENSE",
          purpose: "COST_OF_SALES",
        },
        {
          id: "second",
          code: "5000",
          kind: "EXPENSE",
          purpose: "COST_OF_SALES",
        },
        { id: "inventory", code: "1300", kind: "ASSET", purpose: "INVENTORY" },
      ],
    })
    const context = await ReviewedCostBookContext.acquire(source.tx, heldScope)
    await expect(
      resolveHistoricalCommerceInventoryCostPosting(
        source.tx,
        { ...heldScope, orderId: "order-1" },
        context,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
