import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import { recordOrdinaryStockValuationInTransaction } from "./valuation-ordinary"

const decimal = (value: string) => ({ toFixed: () => value })
const effectiveAt = new Date("2026-09-15T12:00:00.000Z")
const actorUserId = "stock-manager"

function fixture(
  options: {
    type?: "RECEIPT" | "RETURN" | "ADJUSTMENT" | "COUNT_RECONCILIATION"
    direction?: "increase" | "decrease"
    before?: string
    quantity?: string
    factor?: string
    kind?: "SHARED_POOL" | "PACKAGED_STOCK"
    pool?: Record<string, unknown> | null
    movementCount?: number
    changedAfterPost?: boolean
    book?: Record<string, unknown> | null
    closedThrough?: Date | null
    ownedSource?: boolean
    wrongUnitScope?: boolean
    wrongPoolScope?: boolean
    wrongReplayPoolScope?: boolean
    operationTenantId?: string
    hasCorrection?: boolean
  } = {},
) {
  const direction = options.direction ?? "decrease"
  const before = options.before ?? "4"
  const quantity = options.quantity ?? "2"
  const factor = options.factor ?? "1"
  const kind = options.kind ?? "SHARED_POOL"
  const enteredCanonical = Number(quantity) * Number(factor)
  const balanceDelta =
    kind === "PACKAGED_STOCK" ? Number(quantity) : enteredCanonical
  const store = { id: "store-1", tenantId: "tenant-1", currencyCode: "NGN" }
  const configurationVersion = {
    id: "configuration-1",
    productId: "product-1",
    status: "CURRENT",
  }
  const enteredUnit = {
    id: "unit-1",
    configurationVersionId: configurationVersion.id,
    configurationVersion,
    factor: decimal(factor),
    transactionScale: 3,
    stockBehavior:
      kind === "PACKAGED_STOCK"
        ? "PACKAGED_STOCK"
        : Number(factor) === 1
          ? "CANONICAL_SHARED"
          : "ALTERNATE_TRANSACTION",
  }
  const after =
    direction === "decrease"
      ? String(Number(before) - balanceDelta)
      : String(Number(before) + balanceDelta)
  const balance = {
    id: "balance-1",
    tenantId: "tenant-1",
    storeId: store.id,
    store,
    productId: "product-1",
    variantId: "variant-1",
    inventoryUnitId: "unit-1",
    kind,
    revision: options.changedAfterPost ? 30 : 8,
    onHandQuantity: decimal(options.changedAfterPost ? "77" : after),
    inventoryUnit: {
      id: options.wrongUnitScope ? "other-unit" : "unit-1",
      configurationVersionId: configurationVersion.id,
      transactionScale: 3,
      factor: decimal(factor),
    },
  }
  const signedMagnitude = String(enteredCanonical)
  const movement = {
    id: "movement-1",
    operationId: "operation-1",
    balanceSourceId: balance.id,
    configurationVersionId: configurationVersion.id,
    enteredInventoryUnitId: enteredUnit.id,
    enteredInventoryUnit: enteredUnit,
    enteredQuantity: decimal(quantity),
    transactionScaleSnapshot: enteredUnit.transactionScale,
    unitFactorSnapshot: decimal(factor),
    signedCanonicalEffect: decimal(
      direction === "decrease" ? `-${signedMagnitude}` : signedMagnitude,
    ),
    previousOnHandQuantity: decimal(before),
    resultingOnHandQuantity: decimal(after),
    reversalOfMovementId: null,
    balanceSource: balance,
    purchaseReceipt: null,
    unitCostMinorSnapshot: 987,
    totalCostMinorSnapshot: decimal("1974"),
    currencyCodeSnapshot: "NGN",
    valuationEvent: null as Record<string, unknown> | null,
  }
  const corrections: Array<{ id: string }> = options.hasCorrection
    ? [{ id: "correction-1" }]
    : []
  const operation = {
    id: "operation-1",
    tenantId: options.operationTenantId ?? "tenant-1",
    storeId: store.id,
    type: options.type ?? "ADJUSTMENT",
    source: "user_supplied_source_text",
    linkedOperationId: "ignored-link",
    correctionOfOperationId: null,
    committedReservation: null as { id: string } | null,
    actorUserId,
    effectiveAt,
    createdAt: effectiveAt,
    store,
    movements: [movement],
    purchaseReceipts: [],
    productFulfillments: options.ownedSource ? [{ id: "fulfillment-1" }] : [],
    productReturns: [],
    finalizedCounts: [],
    dispatchedTransfers: [],
    receivedTransfers: [],
    cancelledTransfers: [],
    finalizedCloseouts: [],
    corrections,
  }
  const pool =
    options.pool === undefined
      ? {
          id: "pool-1",
          tenantId: "tenant-1",
          bookId: "book-1",
          balanceSourceId: options.wrongPoolScope
            ? "other-balance"
            : balance.id,
          quantity: decimal(
            String(
              kind === "PACKAGED_STOCK"
                ? Number(before) * Number(factor)
                : Number(before),
            ),
          ),
          valueMinor: BigInt(101),
          unknownReason: null,
          lastMovementCount: BigInt(1),
          lastSequence: BigInt(3),
          lastStockRevision: 7,
          latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
        }
      : options.pool
  const state = {
    pool,
    eventCreateCount: 0,
    movementCountQueries: 0,
    poolReads: 0,
  }
  const tx = {
    stockOperation: { findFirst: async () => operation },
    financeBook: {
      findUnique: async () =>
        options.book === null
          ? null
          : (options.book ?? {
              id: "book-1",
              tenantId: "tenant-1",
              currencyCode: "NGN",
              startsAt: new Date("2026-01-01T00:00:00.000Z"),
              closedThrough: options.closedThrough ?? null,
            }),
    },
    stockMovement: {
      count: async () => {
        state.movementCountQueries += 1
        return options.movementCount ?? 2
      },
    },
    financeInventoryPool: {
      findUnique: async () => {
        state.poolReads += 1
        return state.pool
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.pool = { ...state.pool, ...data }
        return state.pool
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.pool = { id: "pool-1", ...data }
        return state.pool
      },
    },
    financeInventoryValuationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.eventCreateCount += 1
        const created = {
          id: `event-${state.eventCreateCount}`,
          ...data,
          pool: {
            id: data.poolId,
            tenantId: "tenant-1",
            bookId: "book-1",
            balanceSourceId: options.wrongReplayPoolScope
              ? "other-balance"
              : data.balanceSourceId,
          },
          purchaseReceiptId: null,
          productReturnCostId: null,
          canonicalEffect: decimal(String(data.canonicalEffect)),
          quantityBefore: decimal(String(data.quantityBefore)),
          quantityAfter: decimal(String(data.quantityAfter)),
        }
        movement.valuationEvent = created
        return created
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    state,
    operation,
    movement,
    balance,
  }
}

async function record(
  value: ReturnType<typeof fixture>,
  expectedStockRevision = 8,
) {
  return recordOrdinaryStockValuationInTransaction(value.tx, {
    tenantId: "tenant-1",
    stockOperationId: "operation-1",
    expectedStockRevision,
  })
}

describe("ordinary stock valuation", () => {
  test("a reservation owner cannot be reclassified as an ordinary stock source", async () => {
    const f = fixture()
    f.operation.committedReservation = { id: "reservation" }
    await expect(record(f)).rejects.toBeInstanceOf(FinanceError)
    expect(f.state.eventCreateCount).toBe(0)
    expect(f.state.poolReads).toBe(0)
  })
  test("allocates known withdrawal cost with half-even residual conservation", async () => {
    const f = fixture()
    const event = await record(f)
    expect(event?.sourceCostMinor).toBe(BigInt(50))
    expect(event?.valueDeltaMinor).toBe(BigInt(-50))
    expect(event?.valueAfterMinor).toBe(BigInt(51))
    expect(event?.kind).toBe("ADJUSTMENT")
    expect(event?.sourceKind).toBe("ORDINARY_STOCK_OPERATION")
  })

  test("full depletion takes the remaining carrying value", async () => {
    const f = fixture({ before: "2", quantity: "2" })
    f.state.pool = {
      id: "pool-1",
      tenantId: "tenant-1",
      bookId: "book-1",
      balanceSourceId: "balance-1",
      quantity: decimal("2"),
      valueMinor: BigInt(37),
      unknownReason: null,
      lastMovementCount: BigInt(1),
      lastSequence: BigInt(3),
      lastStockRevision: 7,
      latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
    }
    const event = await record(f)
    expect(event?.sourceCostMinor).toBe(BigInt(37))
    expect(event?.valueAfterMinor).toBe(BigInt(0))
  })

  test("generic increases ignore optional cost snapshots and remain UNKNOWN", async () => {
    const f = fixture({ direction: "increase" })
    const event = await record(f)
    expect(event?.valueBeforeMinor).toBe(BigInt(101))
    expect(event?.sourceCostMinor).toBeNull()
    expect(event?.valueDeltaMinor).toBeNull()
    expect(event?.valueAfterMinor).toBeNull()
    expect(event?.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
    expect(f.state.pool?.valueMinor).toBeNull()
  })

  test("replays saved valuation before current revision and pool projection checks", async () => {
    const f = fixture()
    const saved = await record(f)
    f.balance.onHandQuantity = decimal("77")
    f.balance.revision = 30
    f.state.pool = null
    const replay = await record(f, 1)
    expect(replay?.id).toBe(saved?.id)
    expect(f.state.poolReads).toBe(1)
    expect(f.state.movementCountQueries).toBe(1)
  })

  test("replays an immutable source event after a later correction, but rejects fresh registration", async () => {
    const f = fixture()
    const saved = await record(f)
    f.operation.corrections.push({ id: "correction-1" })
    expect((await record(f))?.id).toBe(saved?.id)
    await expect(
      record(fixture({ hasCorrection: true })),
    ).rejects.toBeInstanceOf(FinanceError)
  })

  test("keeps an empty first increase known-zero-before but UNKNOWN-after", async () => {
    const f = fixture({
      direction: "increase",
      before: "0",
      quantity: "2",
      pool: null,
      movementCount: 1,
    })
    const event = await record(f)
    expect(event?.valueBeforeMinor).toBe(BigInt(0))
    expect(event?.sourceCostMinor).toBeNull()
    expect(event?.valueAfterMinor).toBeNull()
    expect(event?.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
  })

  test("retains explicit UNKNOWN for uncosted openings and movement gaps", async () => {
    const opening = fixture({
      pool: null,
      before: "5",
      quantity: "1",
      movementCount: 2,
    })
    const openingEvent = await record(opening)
    expect(openingEvent?.unknownReason).toBe("MISSING_OPENING_COST")
    expect(openingEvent?.valueBeforeMinor).toBeNull()

    const gap = fixture({
      pool: null,
      before: "0",
      quantity: "1",
      movementCount: 2,
      direction: "increase",
    })
    const gapEvent = await record(gap)
    expect(gapEvent?.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
  })

  test("supports canonical packaged quantity and preserves no-Book behavior", async () => {
    const packaged = fixture({
      kind: "PACKAGED_STOCK",
      factor: "12",
      before: "2",
      quantity: "1",
    })
    packaged.state.pool = {
      id: "pool-1",
      tenantId: "tenant-1",
      bookId: "book-1",
      balanceSourceId: "balance-1",
      quantity: decimal("24"),
      valueMinor: BigInt(48),
      unknownReason: null,
      lastMovementCount: BigInt(1),
      lastSequence: BigInt(3),
      lastStockRevision: 7,
      latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
    }
    expect((await record(packaged))?.canonicalEffect.toFixed()).toBe("-12")

    const noBook = fixture({ book: null })
    expect(await record(noBook)).toBeNull()
    expect(noBook.state.eventCreateCount).toBe(0)
  })

  test("converts alternate shared-unit entries into canonical quantity", async () => {
    const shared = fixture({
      kind: "SHARED_POOL",
      factor: "12",
      before: "48",
      quantity: "2",
    })
    shared.state.pool = {
      id: "pool-1",
      tenantId: "tenant-1",
      bookId: "book-1",
      balanceSourceId: "balance-1",
      quantity: decimal("48"),
      valueMinor: BigInt(101),
      unknownReason: null,
      lastMovementCount: BigInt(1),
      lastSequence: BigInt(3),
      lastStockRevision: 7,
      latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
    }
    const event = await record(shared)
    expect(event?.canonicalEffect.toFixed()).toBe("-24")
    expect(event?.sourceCostMinor).toBe(BigInt(50))
    expect(event?.quantityAfter.toFixed()).toBe("24")
  })

  test("rejects dedicated-source overlap, bad pool/unit scope, and closed dates", async () => {
    await expect(record(fixture({ ownedSource: true }))).rejects.toBeInstanceOf(
      FinanceError,
    )
    await expect(
      record(fixture({ wrongUnitScope: true })),
    ).rejects.toBeInstanceOf(FinanceError)
    await expect(
      record(fixture({ wrongPoolScope: true })),
    ).rejects.toBeInstanceOf(FinanceError)
    await expect(
      record(fixture({ closedThrough: new Date("2026-09-15T12:00:00.000Z") })),
    ).rejects.toBeInstanceOf(FinanceError)
  })

  test("rejects bad replay pool scope and stale fresh revision", async () => {
    const replayScope = fixture({ wrongReplayPoolScope: true })
    await record(replayScope)
    await expect(record(replayScope)).rejects.toBeInstanceOf(FinanceError)
    await expect(record(fixture(), 7)).rejects.toBeInstanceOf(FinanceError)
  })
})
