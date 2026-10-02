import type { Prisma } from "../../../generated/prisma/client"
export const decimal = (value: string) => ({ toFixed: () => value })
export const originalAt = new Date("2026-09-10T00:00:00.000Z")
export const correctionAt = new Date("2026-09-20T00:00:00.000Z")
export const book = {
  id: "book-1",
  tenantId: "tenant-1",
  currencyCode: "NGN",
  startsAt: new Date("2026-01-01T00:00:00.000Z"),
  closedThrough: null,
}

export function ordinaryCorrectionFixture(
  options: {
    packaged?: boolean
    legacy?: boolean
    unknownPool?: boolean
    historyGap?: boolean
  } = {},
) {
  const packaged = options.packaged ?? false
  const fixtureBook: {
    id: string
    tenantId: string
    currencyCode: string
    startsAt: Date
    closedThrough: Date | null
  } = { ...book }
  const factor = packaged ? "12" : "1"
  const before = packaged ? "60" : "5"
  const after = packaged ? "36" : "3"
  const start = packaged ? "48" : "4"
  const middle = packaged ? "72" : "6"
  const final = packaged ? "60" : "5"
  const unit = {
    id: "unit-1",
    configurationVersionId: "configuration-1",
    configurationVersion: { productId: "product-1" },
    transactionScale: 3,
    factor: decimal(factor),
    stockBehavior: packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
  }
  const store = { id: "store-1", tenantId: "tenant-1", currencyCode: "NGN" }
  const balance = {
    id: "balance-1",
    tenantId: "tenant-1",
    storeId: store.id,
    productId: "product-1",
    kind: packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
    inventoryUnitId: unit.id,
    revision: 3,
    onHandQuantity: decimal(packaged ? "5" : final),
    store,
    inventoryUnit: unit,
  }
  const originalMovement = {
    id: "original-movement",
    operationId: "original-operation",
    balanceSourceId: balance.id,
    configurationVersionId: unit.configurationVersionId,
    enteredInventoryUnitId: unit.id,
    enteredInventoryUnit: unit,
    enteredQuantity: decimal("2"),
    transactionScaleSnapshot: 3,
    unitFactorSnapshot: decimal(factor),
    signedCanonicalEffect: decimal(packaged ? "-24" : "-2"),
    previousOnHandQuantity: decimal(packaged ? "5" : "5"),
    resultingOnHandQuantity: decimal(packaged ? "3" : "3"),
    reversalOfMovementId: null,
    balanceSource: balance,
    purchaseReceipt: null,
    valuationEvent: options.legacy
      ? null
      : {
          id: "original-event",
          tenantId: "tenant-1",
          bookId: book.id,
          poolId: "pool-1",
          pool: {
            id: "pool-1",
            tenantId: "tenant-1",
            bookId: book.id,
            balanceSourceId: balance.id,
          },
          balanceSourceId: balance.id,
          sequence: BigInt(1),
          kind: "ADJUSTMENT",
          sourceKind: "ORDINARY_STOCK_OPERATION",
          sourceId: "original-operation",
          stockOperationId: "original-operation",
          stockMovementId: "original-movement",
          canonicalEffect: decimal(packaged ? "-24" : "-2"),
          quantityBefore: decimal(before),
          quantityAfter: decimal(after),
          sourceCostMinor: BigInt(packaged ? 240 : 200),
          valueBeforeMinor: BigInt(packaged ? 600 : 500),
          valueDeltaMinor: BigInt(packaged ? -240 : -200),
          valueAfterMinor: BigInt(packaged ? 360 : 300),
          unknownReason: null,
          purchaseReceiptId: null,
          productReturnCostId: null,
          effectiveAt: originalAt,
          actorUserId: "original-actor",
        },
  }
  const makeMovement = (
    id: string,
    effect: string,
    entered: string,
    from: string,
    to: string,
    reversed: string | null,
  ) => ({
    id,
    operationId: "correction-operation",
    balanceSourceId: balance.id,
    configurationVersionId: unit.configurationVersionId,
    enteredInventoryUnitId: unit.id,
    enteredInventoryUnit: unit,
    enteredQuantity: decimal(entered),
    transactionScaleSnapshot: 3,
    unitFactorSnapshot: decimal(factor),
    signedCanonicalEffect: decimal(effect),
    previousOnHandQuantity: decimal(from),
    resultingOnHandQuantity: decimal(to),
    reversalOfMovementId: reversed,
    balanceSource: balance,
    purchaseReceipt: null,
    valuationEvent: null as Record<string, unknown> | null,
  })
  const inverse = makeMovement(
    "inverse-movement",
    packaged ? "24" : "2",
    "2",
    "4",
    "6",
    originalMovement.id,
  )
  const replacement = makeMovement(
    "replacement-movement",
    packaged ? "-12" : "-1",
    "1",
    "6",
    "5",
    null,
  )
  const counts = {
    purchaseReceipts: 0,
    productFulfillments: 0,
    productReturns: 0,
    finalizedCounts: 0,
    dispatchedTransfers: 0,
    receivedTransfers: 0,
    cancelledTransfers: 0,
    finalizedCloseouts: 0,
    corrections: 1,
  }
  const original = {
    committedReservation: null as { id: string } | null,
    id: "original-operation",
    tenantId: "tenant-1",
    storeId: store.id,
    type: "ADJUSTMENT",
    correctionOfOperationId: null,
    actorUserId: "original-actor",
    effectiveAt: originalAt,
    store,
    _count: counts,
    movements: [originalMovement],
  }
  const correction = {
    committedReservation: null as { id: string } | null,
    id: "correction-operation",
    tenantId: "tenant-1",
    storeId: store.id,
    type: "CORRECTION",
    correctionOfOperationId: original.id,
    actorUserId: "correction-actor",
    effectiveAt: correctionAt,
    store,
    _count: { ...counts, corrections: undefined },
    correctionOf: original,
    movements: [inverse, replacement],
  }
  const savedEvents: Array<Record<string, unknown>> = []
  let updatedPool: Record<string, unknown> | null = null
  let pool: Record<string, unknown> | null = options.legacy
    ? null
    : {
        id: "pool-1",
        tenantId: "tenant-1",
        bookId: book.id,
        balanceSourceId: balance.id,
        quantity: decimal(start),
        valueMinor: options.unknownPool ? null : BigInt(packaged ? 480 : 400),
        unknownReason: options.unknownPool ? "UNCAPTURED_MOVEMENTS" : null,
        lastMovementCount: BigInt(options.historyGap ? 1 : 2),
        lastSequence: BigInt(2),
        lastStockRevision: 2,
        latestEffectiveAt: new Date("2026-09-18T00:00:00.000Z"),
      }
  const tx = {
    stockOperation: { findFirst: async () => correction },
    financeBook: { findUnique: async () => fixtureBook },
    stockMovement: { count: async () => 4 },
    financeInventoryPool: {
      findUnique: async () => pool,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updatedPool = { ...pool, ...data }
        pool = updatedPool
        return updatedPool
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        updatedPool = { id: "new-pool", ...data }
        pool = updatedPool
        return updatedPool
      },
    },
    financeInventoryValuationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const event = { id: `event-${savedEvents.length + 1}`, ...data }
        savedEvents.push(event)
        return {
          ...event,
          canonicalEffect: decimal(String(data.canonicalEffect)),
          quantityBefore: decimal(String(data.quantityBefore)),
          quantityAfter: decimal(String(data.quantityAfter)),
        }
      },
    },
  } as unknown as Prisma.TransactionClient
  return {
    tx,
    savedEvents,
    correction,
    originalMovement,
    replacementMovement: replacement,
    getPool: () => updatedPool,
    changeCurrentState: () => {
      balance.onHandQuantity = decimal("99")
      balance.revision = 99
      if (pool) {
        pool.quantity = decimal("99")
        pool.valueMinor = BigInt(9999)
      }
      fixtureBook.closedThrough = new Date("2026-09-30T00:00:00.000Z")
    },
  }
}

export function persistedPair(
  events: Array<Record<string, unknown>>,
  poolId = "pool-1",
): Array<Record<string, unknown>> {
  const pool = {
    id: poolId,
    tenantId: "tenant-1",
    bookId: book.id,
    balanceSourceId: "balance-1",
  }
  return events.map((event) => ({
    ...event,
    pool,
    canonicalEffect: decimal(String(event.canonicalEffect)),
    quantityBefore: decimal(String(event.quantityBefore)),
    quantityAfter: decimal(String(event.quantityAfter)),
    purchaseReceiptId: null,
    productReturnCostId: null,
  }))
}

export function requirePair(events: Array<Record<string, unknown>>) {
  const inverse = events[0]
  const replacement = events[1]
  if (!inverse || !replacement) throw new Error("Expected saved valuation pair")
  return [inverse, replacement] as const
}
