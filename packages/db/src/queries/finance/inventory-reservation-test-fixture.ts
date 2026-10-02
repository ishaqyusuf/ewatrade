import { Prisma } from "../../../generated/prisma/client"

const decimal = (value: string) => new Prisma.Decimal(value)
export const effectiveAt = new Date("2026-09-15T12:00:00Z")
export const reservationCommitTestInput = {
  tenantId: "tenant",
  stockOperationId: "operation",
  expectedStockRevision: 8,
}

export function reservationCommitFixture(
  options: {
    quantity?: string
    factor?: string
    packaged?: boolean
    noBook?: boolean
    noPool?: boolean
  } = {},
) {
  const quantity = options.quantity ?? "2"
  const factor = options.factor ?? "1"
  const canonical = decimal(quantity).mul(factor)
  const before = options.packaged ? "4" : factor === "1" ? "4" : "48"
  const after = decimal(before).minus(options.packaged ? quantity : canonical)
  const configurationVersion = { id: "configuration", productId: "product" }
  const unit = {
    id: "entered-unit",
    configurationVersionId: "configuration",
    configurationVersion,
    factor: decimal(factor),
    transactionScale: 3,
    stockBehavior: options.packaged
      ? "PACKAGED_STOCK"
      : factor === "1"
        ? "CANONICAL_SHARED"
        : "ALTERNATE_TRANSACTION",
  }
  const baseUnit =
    options.packaged || factor === "1"
      ? unit
      : {
          ...unit,
          id: "base-unit",
          stockBehavior: "CANONICAL_SHARED",
          factor: decimal("1"),
        }
  const store = { id: "store", tenantId: "tenant", currencyCode: "NGN" }
  const balance = {
    id: "balance",
    tenantId: "tenant",
    storeId: "store",
    store,
    productId: "product",
    variantId: "variant",
    inventoryUnitId: baseUnit.id,
    inventoryUnit: baseUnit,
    kind: options.packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
    custodyType: "STORE",
    custodyReferenceId: "",
    parentBalanceSourceId: null,
    revision: 8,
    onHandQuantity: after,
    product: {
      id: "product",
      catalogItemId: "catalog",
      catalogItem: { id: "catalog", tenantId: "tenant" },
    },
    variant: { id: "variant", catalogItemId: "catalog" },
  }
  const reservation = {
    id: "reservation",
    tenantId: "tenant",
    storeId: "store",
    balanceSourceId: "balance",
    configurationVersionId: "configuration",
    enteredInventoryUnitId: unit.id,
    enteredQuantity: decimal(quantity),
    unitFactorSnapshot: decimal(factor),
    canonicalQuantity: canonical,
    committedOperationId: "operation",
    committedAt: effectiveAt,
    status: "COMMITTED",
    commercialOrderLineId: null as string | null,
    offeringId: "offering",
    offering: {
      id: "offering",
      tenantId: "tenant",
      variantId: "variant",
      productUnitOffering: { inventoryUnitId: unit.id },
    },
    _count: { productFulfillments: 0 },
  }
  const movement = {
    id: "movement",
    operationId: "operation",
    balanceSourceId: "balance",
    balanceSource: balance,
    enteredInventoryUnitId: unit.id,
    enteredInventoryUnit: unit,
    configurationVersionId: "configuration",
    enteredQuantity: decimal(quantity),
    unitFactorSnapshot: decimal(factor),
    transactionScaleSnapshot: 3,
    signedCanonicalEffect: canonical.neg(),
    previousOnHandQuantity: decimal(before),
    resultingOnHandQuantity: after,
    reversalOfMovementId: null,
    purchaseReceipt: null,
    valuationEvent: null as Record<string, unknown> | null,
  }
  const operation = {
    id: "operation",
    tenantId: "tenant",
    storeId: "store",
    store,
    type: "RESERVATION_COMMIT",
    actorUserId: "operator",
    effectiveAt,
    correctionOfOperationId: null,
    committedReservation: reservation,
    movements: [movement],
    _count: {
      purchaseReceipts: 0,
      productFulfillments: 0,
      productReturns: 0,
      finalizedCounts: 0,
      finalizedCloseouts: 0,
      dispatchedTransfers: 0,
      receivedTransfers: 0,
      cancelledTransfers: 0,
      corrections: 0,
    },
  }
  const book = {
    id: "book",
    tenantId: "tenant",
    currencyCode: "NGN",
    startsAt: new Date("2026-01-01T00:00:00Z"),
    closedThrough: null as Date | null,
  }
  const initialPool = {
    id: "pool",
    tenantId: "tenant",
    bookId: "book",
    balanceSourceId: "balance",
    quantity: decimal(
      options.packaged ? decimal(before).mul(factor).toFixed() : before,
    ),
    valueMinor: BigInt(factor === "1" ? 101 : 2003) as bigint | null,
    unknownReason: null as string | null,
    lastMovementCount: BigInt(1),
    lastStockRevision: 6,
    lastSequence: BigInt(1),
    latestEffectiveAt: new Date("2026-09-10T12:00:00Z"),
  }
  let pool: typeof initialPool | null = options.noPool ? null : initialPool
  let writes = 0
  let counts = 0
  const tx = {
    stockOperation: { findFirst: async () => operation },
    financeBook: { findUnique: async () => (options.noBook ? null : book) },
    stockMovement: {
      count: async () => {
        counts++
        return 2
      },
    },
    financeInventoryPool: {
      findUnique: async () => pool,
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
        movement.valuationEvent = event
        return event
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    operation,
    reservation,
    movement,
    balance,
    unit,
    book,
    initialPool,
    getPool: () => pool,
    writes: () => writes,
    counts: () => counts,
  }
}
