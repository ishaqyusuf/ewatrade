import { Prisma } from "../../../generated/prisma/client"

const decimal = (value: string) => new Prisma.Decimal(value)
export const effectiveAt = new Date("2026-10-01T10:00:00Z")
export const closeoutInput = { tenantId: "tenant", closeoutId: "closeout" }

export function closeoutFixture(
  options: {
    packaged?: boolean
    zero?: boolean
    gain?: boolean
    noBook?: boolean
  } = {},
) {
  const store = { id: "store", tenantId: "tenant", currencyCode: "NGN" }
  const unit = {
    id: "unit",
    configurationVersionId: "configuration",
    configurationVersion: { id: "configuration", productId: "product" },
    factor: decimal(options.packaged ? "12" : "1"),
    transactionScale: 3,
    stockBehavior: options.packaged ? "PACKAGED_STOCK" : "CANONICAL_SHARED",
  }
  const parent = {
    id: "root",
    tenantId: "tenant",
    storeId: "store",
    custodyType: "STORE",
    custodyReferenceId: "",
    parentBalanceSourceId: null,
    productId: "product",
    variantId: "variant",
    inventoryUnitId: "unit",
    kind: options.packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
  }
  const balance = {
    ...parent,
    id: "balance",
    custodyType: "STAFF",
    custodyReferenceId: "staff",
    parentBalanceSourceId: "root",
    parentBalanceSource: parent,
    revision: 5,
    onHandQuantity: decimal(options.zero ? "4" : options.gain ? "5" : "3"),
    store,
    inventoryUnit: unit,
    product: {
      id: "product",
      catalogItemId: "catalog",
      catalogItem: { id: "catalog", tenantId: "tenant" },
    },
    variant: { id: "variant", catalogItemId: "catalog" },
  }
  const after = options.zero ? "4" : options.gain ? "5" : "3"
  const variance = options.zero ? "0" : options.gain ? "1" : "-1"
  const line = {
    id: "line",
    closeoutId: "closeout",
    balanceSourceId: "balance",
    balanceSource: balance,
    expectedRevision: 4,
    expectedQuantity: decimal("4"),
    declaredQuantity: decimal(after),
    varianceQuantity: decimal(variance),
  }
  const movement = {
    id: "movement",
    operationId: "operation",
    balanceSourceId: "balance",
    configurationVersionId: "configuration",
    enteredInventoryUnitId: "unit",
    enteredInventoryUnit: unit,
    unitFactorSnapshot: unit.factor,
    transactionScaleSnapshot: 3,
    enteredQuantity: decimal("1"),
    previousOnHandQuantity: decimal("4"),
    resultingOnHandQuantity: decimal(after),
    signedCanonicalEffect: decimal(
      options.packaged ? (options.gain ? "12" : "-12") : variance,
    ),
    reversalOfMovementId: null as string | null,
    purchaseReceipt: null as { id: string } | null,
    valuationEvent: null as Record<string, unknown> | null,
  }
  const operation = {
    id: "operation",
    tenantId: "tenant",
    storeId: "store",
    store,
    effectiveAt,
    actorUserId: "finalizer",
    type: "ADJUSTMENT",
    source: "inventory_closeout",
    correctionOfOperationId: null as string | null,
    committedReservation: null as { id: string } | null,
    movements: options.zero ? [] : [movement],
    _count: {
      corrections: 0,
      finalizedCloseouts: 1,
      purchaseReceipts: 0,
      productFulfillments: 0,
      productReturns: 0,
      finalizedCounts: 0,
      dispatchedTransfers: 0,
      receivedTransfers: 0,
      cancelledTransfers: 0,
    },
  }
  const closeout = {
    id: "closeout",
    tenantId: "tenant",
    storeId: "store",
    store,
    custodyType: "STAFF",
    custodyReferenceId: "staff",
    status: "FINALIZED",
    // The creator may differ from the authorized finalizer.
    actorUserId: "creator",
    createdAt: new Date("2026-09-30T10:00:00Z"),
    finalizedAt: effectiveAt,
    finalizedOperationId: "operation",
    finalizedOperation: operation,
    lines: [line],
  }
  const book = {
    id: "book",
    tenantId: "tenant",
    currencyCode: "NGN",
    closedThrough: null as Date | null,
    startsAt: new Date("2026-01-01T00:00:00Z"),
  }
  let bookReads = 0
  const tx = {
    inventoryCloseout: { findFirst: async () => closeout },
    financeBook: {
      findUnique: async () => {
        bookReads++
        return options.noBook ? null : book
      },
    },
  } as unknown as Prisma.TransactionClient
  return {
    tx,
    closeout,
    line,
    balance,
    parent,
    unit,
    operation,
    movement,
    book,
    bookReads: () => bookReads,
  }
}

export function closeoutValuationFixture(
  options: {
    packaged?: boolean
    gain?: boolean
    zero?: boolean
    noBook?: boolean
    noPool?: boolean
  } = {},
) {
  const source = closeoutFixture(options)
  const initialPool = {
    id: "pool",
    tenantId: "tenant",
    bookId: "book",
    balanceSourceId: "balance",
    quantity: decimal(options.packaged ? "48" : "4"),
    valueMinor: BigInt(101) as bigint | null,
    unknownReason: null as string | null,
    lastMovementCount: BigInt(1),
    lastStockRevision: 4,
    lastSequence: BigInt(1),
    latestEffectiveAt: new Date("2026-09-30T10:00:00Z"),
  }
  let pool: typeof initialPool | null = options.noPool ? null : initialPool
  let writes = 0
  let reads = 0
  const events: Array<Record<string, unknown>> = []
  Object.assign(source.tx, {
    stockMovement: {
      count: async () => {
        reads++
        return options.noPool ? 1 : 2
      },
    },
    financeInventoryPool: {
      findUnique: async () => {
        reads++
        return pool
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes++
        pool = {
          ...initialPool,
          ...data,
          quantity: decimal(String(data.quantity)),
        }
        return pool
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes++
        pool = {
          ...initialPool,
          ...data,
          quantity: decimal(String(data.quantity)),
        }
        return pool
      },
    },
    financeInventoryValuationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes++
        const event = {
          id: "event",
          purchaseReceiptId: null,
          productReturnCostId: null,
          ...data,
          canonicalEffect: decimal(String(data.canonicalEffect)),
          quantityBefore: decimal(String(data.quantityBefore)),
          quantityAfter: decimal(String(data.quantityAfter)),
          pool,
        }
        source.movement.valuationEvent = event
        events.push(event)
        return event
      },
    },
  })
  return {
    ...source,
    initialPool,
    pool: () => pool,
    events,
    writes: () => writes,
    reads: () => reads,
  }
}
