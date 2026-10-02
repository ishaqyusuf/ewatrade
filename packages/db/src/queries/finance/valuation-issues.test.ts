import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import { recordProductFulfillmentValuationInTransaction } from "./valuation-issues"

const decimal = (value: string) => ({ toFixed: () => value })
const effectiveAt = new Date("2026-09-15T12:00:00.000Z")
const actorUserId = "user-1"

function fixture(
  options: {
    before?: string
    after?: string
    issued?: string
    pool?: Record<string, unknown> | null
    movementCount?: number
    effectiveAt?: Date
    existingEvent?: Record<string, unknown> | null
    stockKind?: "SHARED_POOL" | "PACKAGED_STOCK"
    factor?: string
    book?: Record<string, unknown> | null
    missingSnapshot?: boolean
    missingFulfillment?: boolean
  } = {},
) {
  const before = options.before ?? "3"
  const after = options.after ?? "1"
  const issued = options.issued ?? "2"
  const factor = options.factor ?? "1"
  const stockKind = options.stockKind ?? "SHARED_POOL"
  const balance = {
    id: "balance-1",
    tenantId: "tenant-1",
    storeId: "store-1",
    store: { tenantId: "tenant-1", currencyCode: "NGN" },
    variantId: "variant-1",
    inventoryUnitId: "unit-1",
    kind: stockKind,
    revision: 7,
    onHandQuantity: decimal(stockKind === "PACKAGED_STOCK" ? "1" : after),
  }
  const movement = {
    id: "movement-1",
    balanceSourceId: balance.id,
    configurationVersionId: "configuration-1",
    enteredInventoryUnitId: "unit-1",
    unitFactorSnapshot: decimal(factor),
    enteredQuantity: decimal(issued === "12" ? "1" : issued),
    signedCanonicalEffect: decimal(`-${issued}`),
    previousOnHandQuantity: decimal(
      stockKind === "PACKAGED_STOCK" ? "2" : before,
    ),
    resultingOnHandQuantity: decimal(
      stockKind === "PACKAGED_STOCK" ? "1" : after,
    ),
    balanceSource: balance,
    valuationEvent: options.existingEvent ?? null,
  }
  const fulfillment = {
    id: "fulfillment-1",
    quantity: decimal(issued === "12" ? "1" : issued),
    stockOperationId: "operation-1",
    orderLine: {
      id: "line-1",
      kind: "PRODUCT_UNIT",
      quantity: decimal(issued === "12" ? "1" : issued),
      snapshot: options.missingSnapshot
        ? null
        : {
            currencyCode: "NGN",
            offeringId: "offering-1",
            balanceSourceId: balance.id,
            configurationVersionId: "configuration-1",
            inventoryUnitId: "unit-1",
            unitFactor: decimal(factor),
            variantId: "variant-1",
            stockBehavior:
              stockKind === "PACKAGED_STOCK"
                ? "PACKAGED_STOCK"
                : "CANONICAL_SHARED",
          },
      offeringId: "offering-1",
      order: {
        id: "order-1",
        tenantId: "tenant-1",
        storeId: "store-1",
        currencyCode: "NGN",
        store: { tenantId: "tenant-1", currencyCode: "NGN" },
      },
    },
    reservation: {
      tenantId: "tenant-1",
      storeId: "store-1",
      offeringId: "offering-1",
      commercialOrderLineId: "line-1",
      status: "COMMITTED",
      balanceSourceId: balance.id,
      configurationVersionId: "configuration-1",
      enteredInventoryUnitId: "unit-1",
      enteredQuantity: decimal(issued === "12" ? "1" : issued),
      unitFactorSnapshot: decimal(factor),
      canonicalQuantity: decimal(issued),
    },
    stockOperation: {
      id: "operation-1",
      tenantId: "tenant-1",
      storeId: "store-1",
      type: "SALE_FULFILLMENT",
      source: "commercial_order",
      actorUserId,
      effectiveAt: options.effectiveAt ?? effectiveAt,
      movements: [movement],
    },
  }
  const book =
    options.book === null
      ? null
      : (options.book ?? {
          id: "book-1",
          tenantId: "tenant-1",
          currencyCode: "NGN",
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          closedThrough: null,
        })
  const state: {
    pool: Record<string, unknown> | null
    event: Record<string, unknown> | null
  } = {
    pool: options.pool
      ? {
          id: "pool-1",
          quantity: decimal(before),
          valueMinor: BigInt(101),
          unknownReason: null,
          lastMovementCount: BigInt(2),
          lastSequence: BigInt(4),
          latestEffectiveAt: new Date("2026-09-01T00:00:00.000Z"),
          ...options.pool,
        }
      : options.pool === null
        ? null
        : {
            id: "pool-1",
            quantity: decimal(before),
            valueMinor: BigInt(101),
            unknownReason: null,
            lastMovementCount: BigInt(2),
            lastSequence: BigInt(4),
            latestEffectiveAt: new Date("2026-09-01T00:00:00.000Z"),
          },
    event: null,
  }
  const tx = {
    productFulfillment: {
      findFirst: async () => (options.missingFulfillment ? null : fulfillment),
    },
    financeBook: { findUnique: async () => book },
    financeInventoryPool: {
      findUnique: async () => state.pool,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.pool = { ...state.pool, ...data }
        return state.pool
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.pool = { id: "pool-1", ...data }
        return state.pool
      },
    },
    stockMovement: {
      count: async () => options.movementCount ?? 3,
    },
    financeInventoryValuationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.event = data
        return data
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    state,
    fulfillment,
    movement,
  }
}

describe("Product fulfillment inventory valuation", () => {
  test("allocates known partial issue cost and the remaining value on depletion", async () => {
    const partial = fixture()
    const first = await recordProductFulfillmentValuationInTransaction(
      partial.tx,
      { tenantId: "tenant-1", fulfillmentId: "fulfillment-1" },
    )
    expect(first).toMatchObject({
      kind: "ISSUE",
      sourceKind: "PRODUCT_FULFILLMENT",
      quantityBefore: "3",
      quantityAfter: "1",
      valueBeforeMinor: BigInt(101),
      valueDeltaMinor: BigInt(-67),
      valueAfterMinor: BigInt(34),
      sourceCostMinor: BigInt(67),
    })

    const depletion = fixture({
      before: "1",
      after: "0",
      issued: "1",
      pool: {
        quantity: decimal("1"),
        valueMinor: BigInt(34),
        lastMovementCount: BigInt(3),
      },
      movementCount: 4,
    })
    const final = await recordProductFulfillmentValuationInTransaction(
      depletion.tx,
      { tenantId: "tenant-1", fulfillmentId: "fulfillment-1" },
    )
    expect(final).toMatchObject({
      quantityAfter: "0",
      valueDeltaMinor: BigInt(-34),
      valueAfterMinor: BigInt(0),
      sourceCostMinor: BigInt(34),
    })
  })

  test("keeps packaged count conversion exact and marks movement gaps unknown", async () => {
    const setup = fixture({
      before: "24",
      after: "12",
      issued: "12",
      stockKind: "PACKAGED_STOCK",
      factor: "12",
      movementCount: 5,
      pool: {
        quantity: decimal("24"),
        lastMovementCount: BigInt(2),
      },
    })
    const result = await recordProductFulfillmentValuationInTransaction(
      setup.tx,
      { tenantId: "tenant-1", fulfillmentId: "fulfillment-1" },
    )
    expect(result).toMatchObject({
      quantityBefore: "24",
      quantityAfter: "12",
      valueBeforeMinor: null,
      valueDeltaMinor: null,
      valueAfterMinor: null,
      sourceCostMinor: null,
      unknownReason: "UNCAPTURED_MOVEMENTS",
    })
    expect(setup.state.pool?.quantity).toBe("12")
  })

  test("retains known zero and prior unknown cost states", async () => {
    const zero = fixture({
      pool: { valueMinor: BigInt(0), lastMovementCount: BigInt(2) },
    })
    const zeroResult = await recordProductFulfillmentValuationInTransaction(
      zero.tx,
      { tenantId: "tenant-1", fulfillmentId: "fulfillment-1" },
    )
    expect(zeroResult).toMatchObject({
      valueBeforeMinor: BigInt(0),
      valueDeltaMinor: BigInt(0),
      valueAfterMinor: BigInt(0),
      sourceCostMinor: BigInt(0),
      unknownReason: null,
    })

    const unknown = fixture({
      pool: {
        valueMinor: null,
        unknownReason: "MISSING_OPENING_COST",
        lastMovementCount: BigInt(2),
      },
    })
    const unknownResult = await recordProductFulfillmentValuationInTransaction(
      unknown.tx,
      { tenantId: "tenant-1", fulfillmentId: "fulfillment-1" },
    )
    expect(unknownResult).toMatchObject({
      valueBeforeMinor: null,
      valueDeltaMinor: null,
      valueAfterMinor: null,
      sourceCostMinor: null,
      unknownReason: "MISSING_OPENING_COST",
    })
  })

  test("values an alternate transaction unit against its different canonical balance unit", async () => {
    const source = fixture({
      before: "24",
      after: "12",
      issued: "12",
      factor: "12",
      pool: { valueMinor: BigInt(1200) },
    })
    const snapshot = source.fulfillment.orderLine.snapshot
    if (!snapshot) throw new Error("Missing test snapshot")
    snapshot.stockBehavior = "ALTERNATE_TRANSACTION"
    source.movement.balanceSource.inventoryUnitId = "canonical-unit"
    const issue = await recordProductFulfillmentValuationInTransaction(
      source.tx,
      {
        tenantId: "tenant-1",
        fulfillmentId: "fulfillment-1",
      },
    )
    expect(issue).toMatchObject({
      sourceCostMinor: BigInt(600),
      quantityAfter: "12",
    })
  })

  test("replays an immutable issue after later stock without current-balance checks", async () => {
    const existing = {
      tenantId: "tenant-1",
      bookId: "book-1",
      balanceSourceId: "balance-1",
      kind: "ISSUE",
      sourceKind: "PRODUCT_FULFILLMENT",
      sourceId: "fulfillment-1",
      stockOperationId: "operation-1",
      stockMovementId: "movement-1",
      canonicalEffect: decimal("-2"),
      quantityBefore: decimal("3"),
      quantityAfter: decimal("1"),
      effectiveAt,
      actorUserId,
    }
    const setup = fixture({ existingEvent: existing })
    setup.movement.balanceSource.onHandQuantity = decimal("99")
    const replay = await recordProductFulfillmentValuationInTransaction(
      setup.tx,
      { tenantId: "tenant-1", fulfillmentId: "fulfillment-1" },
    )
    expect(Object.is(replay, existing)).toBe(true)
    expect(setup.state.event).toBeNull()
  })

  test("rejects tenant/source mismatch and closed or chronologically stale dates", async () => {
    const wrongTenant = fixture()
    await expect(
      recordProductFulfillmentValuationInTransaction(wrongTenant.tx, {
        tenantId: "tenant-2",
        fulfillmentId: "fulfillment-1",
      }),
    ).rejects.toBeInstanceOf(FinanceError)

    const beforeBook = fixture({
      effectiveAt: new Date("2025-12-31T23:59:59Z"),
    })
    await expect(
      recordProductFulfillmentValuationInTransaction(beforeBook.tx, {
        tenantId: "tenant-1",
        fulfillmentId: "fulfillment-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })

    const future = fixture({ effectiveAt: new Date("2099-12-31T23:59:59Z") })
    await expect(
      recordProductFulfillmentValuationInTransaction(future.tx, {
        tenantId: "tenant-1",
        fulfillmentId: "fulfillment-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })

    const stale = fixture({
      pool: { latestEffectiveAt: new Date("2026-09-16T00:00:00Z") },
    })
    await expect(
      recordProductFulfillmentValuationInTransaction(stale.tx, {
        tenantId: "tenant-1",
        fulfillmentId: "fulfillment-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  })

  test("preserves no-book operations and rejects missing scoped source or snapshot", async () => {
    const noBook = fixture({ book: null, missingSnapshot: true })
    expect(
      await recordProductFulfillmentValuationInTransaction(noBook.tx, {
        tenantId: "tenant-1",
        fulfillmentId: "fulfillment-1",
      }),
    ).toBeNull()

    const missingSource = fixture({ missingFulfillment: true })
    await expect(
      recordProductFulfillmentValuationInTransaction(missingSource.tx, {
        tenantId: "tenant-1",
        fulfillmentId: "missing",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })

    const missingSnapshot = fixture({ missingSnapshot: true })
    await expect(
      recordProductFulfillmentValuationInTransaction(missingSnapshot.tx, {
        tenantId: "tenant-1",
        fulfillmentId: "fulfillment-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})
