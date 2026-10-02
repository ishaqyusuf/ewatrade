import type { Prisma } from "../../../generated/prisma/client"
export const decimal = (value: string) => ({ toFixed: () => value })
export const effectiveAt = new Date("2026-09-15T12:00:00.000Z")
const actorUserId = "actor-1"

export function transformationFixture(
  options: {
    sourcePool?: Record<string, unknown> | null
    targetPool?: Record<string, unknown> | null
    existing?: boolean | "source" | "target"
    currentBalanceChanged?: boolean
    count?: number | { source: number; target: number }
    book?: Record<string, unknown> | null
    otherVariant?: boolean
    targetEmpty?: boolean
  } = {},
) {
  const targetBefore = options.targetEmpty ? "0" : "3"
  const targetAfter = options.targetEmpty ? "2" : "5"
  const store = { id: "store-1", tenantId: "tenant-1", currencyCode: "NGN" }
  const source = {
    id: "source-balance",
    tenantId: "tenant-1",
    storeId: store.id,
    store,
    productId: "product-1",
    variantId: "variant-1",
    inventoryUnitId: "source-unit",
    kind: "PACKAGED_STOCK",
    revision: 4,
    onHandQuantity: decimal(options.currentBalanceChanged ? "7" : "2"),
    inventoryUnit: {
      configurationVersionId: "configuration-1",
      transactionScale: 0,
      factor: decimal("1"),
    },
  }
  const target = {
    id: "target-balance",
    tenantId: "tenant-1",
    storeId: store.id,
    store,
    productId: "product-1",
    variantId: options.otherVariant ? "variant-other" : "variant-1",
    inventoryUnitId: "target-unit",
    kind: "PACKAGED_STOCK",
    revision: 8,
    onHandQuantity: decimal(options.currentBalanceChanged ? "9" : targetAfter),
    inventoryUnit: {
      configurationVersionId: "configuration-1",
      transactionScale: 0,
      factor: decimal("1"),
    },
  }
  const sourceMovement = {
    id: "source-movement",
    operationId: "operation-1",
    balanceSourceId: source.id,
    configurationVersionId: "configuration-1",
    enteredInventoryUnitId: source.inventoryUnitId,
    transactionScaleSnapshot: 0,
    enteredQuantity: decimal("2"),
    unitFactorSnapshot: decimal("1"),
    signedCanonicalEffect: decimal("-2"),
    previousOnHandQuantity: decimal("4"),
    resultingOnHandQuantity: decimal("2"),
    reversalOfMovementId: null,
    balanceSource: source,
    valuationEvent: null as Record<string, unknown> | null,
  }
  const targetMovement = {
    id: "target-movement",
    operationId: "operation-1",
    balanceSourceId: target.id,
    configurationVersionId: "configuration-1",
    enteredInventoryUnitId: target.inventoryUnitId,
    transactionScaleSnapshot: 0,
    enteredQuantity: decimal("2"),
    unitFactorSnapshot: decimal("1"),
    signedCanonicalEffect: decimal("2"),
    previousOnHandQuantity: decimal(targetBefore),
    resultingOnHandQuantity: decimal(targetAfter),
    reversalOfMovementId: null,
    balanceSource: target,
    valuationEvent: null as Record<string, unknown> | null,
  }
  const operation = {
    id: "operation-1",
    tenantId: "tenant-1",
    storeId: store.id,
    type: "TRANSFORMATION",
    source: "inventory_adjustment",
    actorUserId,
    effectiveAt,
    store,
    movements: [sourceMovement, targetMovement],
  }
  const sourcePool =
    options.sourcePool === undefined
      ? {
          id: "source-pool",
          quantity: decimal("4"),
          valueMinor: BigInt(101),
          unknownReason: null,
          lastMovementCount: BigInt(1),
          lastSequence: BigInt(2),
          latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
        }
      : options.sourcePool
  const targetPool =
    options.targetPool === undefined
      ? {
          id: "target-pool",
          quantity: decimal("3"),
          valueMinor: BigInt(9),
          unknownReason: null,
          lastMovementCount: BigInt(1),
          lastSequence: BigInt(3),
          latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
        }
      : options.targetPool
  const state: {
    pools: Map<string, Record<string, unknown> | null>
    events: Map<string, Record<string, unknown>>
    eventCreateCount: number
  } = {
    pools: new Map([
      [source.id, sourcePool],
      [target.id, targetPool],
    ]),
    events: new Map(),
    eventCreateCount: 0,
  }
  if (options.existing === true || options.existing === "source") {
    sourceMovement.valuationEvent = {
      id: "source-event",
      tenantId: "tenant-1",
      bookId: "book-1",
      poolId: "source-pool",
      balanceSourceId: source.id,
      sequence: BigInt(3),
      kind: "TRANSFER_OUT",
      sourceKind: "PACKAGED_TRANSFORMATION",
      sourceId: operation.id,
      stockOperationId: operation.id,
      stockMovementId: sourceMovement.id,
      purchaseReceiptId: null,
      productReturnCostId: null,
      canonicalEffect: decimal("-2"),
      quantityBefore: decimal("4"),
      quantityAfter: decimal("2"),
      valueBeforeMinor: BigInt(101),
      valueDeltaMinor: BigInt(-50),
      valueAfterMinor: BigInt(51),
      sourceCostMinor: BigInt(50),
      unknownReason: null,
      effectiveAt,
      actorUserId,
    }
  }
  if (options.existing === true || options.existing === "target") {
    targetMovement.valuationEvent = {
      id: "target-event",
      tenantId: "tenant-1",
      bookId: "book-1",
      poolId: "target-pool",
      balanceSourceId: target.id,
      sequence: BigInt(4),
      kind: "TRANSFER_IN",
      sourceKind: "PACKAGED_TRANSFORMATION",
      sourceId: operation.id,
      stockOperationId: operation.id,
      stockMovementId: targetMovement.id,
      purchaseReceiptId: null,
      productReturnCostId: null,
      canonicalEffect: decimal("2"),
      quantityBefore: decimal("3"),
      quantityAfter: decimal("5"),
      valueBeforeMinor: BigInt(9),
      valueDeltaMinor: BigInt(50),
      valueAfterMinor: BigInt(59),
      sourceCostMinor: BigInt(50),
      unknownReason: null,
      effectiveAt,
      actorUserId,
    }
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
              closedThrough: null,
            }),
    },
    stockMovement: {
      count: async ({ where }: { where: { balanceSourceId: string } }) => {
        if (typeof options.count === "number") return options.count
        if (options.count) {
          return where.balanceSourceId === source.id
            ? options.count.source
            : options.count.target
        }
        return 2
      },
    },
    financeInventoryPool: {
      findUnique: async ({
        where,
      }: { where: { bookId_balanceSourceId: { balanceSourceId: string } } }) =>
        state.pools.get(where.bookId_balanceSourceId.balanceSourceId) ?? null,
      update: async ({
        where,
        data,
      }: { where: { id: string }; data: Record<string, unknown> }) => {
        const entry = [...state.pools.entries()].find(
          ([, pool]) => pool?.id === where.id,
        )
        if (!entry) throw new Error("missing pool update")
        const updated = { ...entry[1], ...data }
        state.pools.set(entry[0], updated)
        return { id: where.id, ...updated }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = data.balanceSourceId as string
        const created = { id: `${id}-pool`, ...data }
        state.pools.set(id, created)
        return created
      },
    },
    financeInventoryValuationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.eventCreateCount += 1
        const created = { id: `event-${state.eventCreateCount}`, ...data }
        state.events.set(data.balanceSourceId as string, created)
        return created
      },
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    state,
    operation,
    sourceMovement,
    targetMovement,
  }
}
