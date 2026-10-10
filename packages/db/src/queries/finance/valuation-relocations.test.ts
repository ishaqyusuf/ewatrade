import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import { recordResolvedInventoryRelocationValuationInTransaction } from "./valuation-relocations"

import { resolveLoadedInventoryRelocationSource } from "./inventory-relocation-source"
// Verify source proof and posting independently of repository query shape.
async function postFixtureRelocation(
  tx: Prisma.TransactionClient,
  input: Parameters<
    typeof recordResolvedInventoryRelocationValuationInTransaction
  >[1],
) {
  const operation = await tx.stockOperation.findFirst({
    where: { id: input.stockOperationId },
  })
  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: { tenantId: input.tenantId, currencyCode: "NGN" },
    },
  })
  const source = resolveLoadedInventoryRelocationSource(
    operation as unknown as Parameters<
      typeof resolveLoadedInventoryRelocationSource
    >[0],
    input.tenantId,
    book,
  )
  return recordResolvedInventoryRelocationValuationInTransaction(
    tx,
    input,
    source,
  )
}
const decimal = (value: string) => ({ toFixed: () => value })
const effectiveAt = new Date("2026-09-15T12:00:00.000Z")
const actorUserId = "relocation-actor"

type Stage = "custody" | "dispatch" | "receive" | "cancel"

function fixture(
  options: {
    stage?: Stage
    packaged?: boolean
    sourcePool?: Record<string, unknown> | null
    targetPool?: Record<string, unknown> | null
    sourceCount?: number
    targetCount?: number
    bookMissing?: boolean
  } = {},
) {
  const stage = options.stage ?? "dispatch"
  const factor = options.packaged ? "12" : "1"
  const unitId = options.packaged ? "pack-unit" : "shared-unit"
  const stockBehavior = options.packaged ? "PACKAGED_STOCK" : "CANONICAL_SHARED"
  const sourceStore = {
    id: "source-store",
    tenantId: "tenant-1",
    currencyCode: "NGN",
  }
  const targetStore = {
    id: "target-store",
    tenantId: "tenant-1",
    currencyCode: "NGN",
  }
  const unit = {
    id: unitId,
    configurationVersionId: "configuration-1",
    configurationVersion: { id: "configuration-1", productId: "product-1" },
    transactionScale: 3,
    factor: decimal(factor),
    stockBehavior,
  }
  const catalogItem = { id: "catalog-item-1", tenantId: "tenant-1" }
  const product = {
    id: "product-1",
    catalogItemId: catalogItem.id,
    catalogItem,
  }
  const variant = {
    id: "variant-1",
    catalogItemId: catalogItem.id,
    catalogItem,
  }
  const makeBalance = (input: {
    id: string
    store: typeof sourceStore
    quantity: string
    revision: number
    custodyType?: string
    custodyReferenceId?: string
    parentBalanceSourceId?: string | null
    parentBalanceSource?: {
      id: string
      tenantId: string
      storeId: string
      productId: string
      variantId: string
      inventoryUnitId: string
      kind: string
      custodyType: string
    } | null
  }) => ({
    id: input.id,
    tenantId: "tenant-1",
    storeId: input.store.id,
    store: input.store,
    product,
    variant,
    productId: "product-1",
    variantId: "variant-1",
    inventoryUnitId: unitId,
    kind: options.packaged ? "PACKAGED_STOCK" : "SHARED_POOL",
    custodyType: input.custodyType ?? "STORE",
    custodyReferenceId: input.custodyReferenceId ?? "",
    parentBalanceSourceId: input.parentBalanceSourceId ?? null,
    revision: input.revision,
    onHandQuantity: decimal(input.quantity),
    reservedQuantity: decimal("0"),
    inventoryUnit: unit,
    parentBalanceSource: input.parentBalanceSource ?? null,
  })
  const sourceStoreBalance = makeBalance({
    id: "source-balance",
    store: sourceStore,
    quantity: stage === "dispatch" ? "2" : stage === "cancel" ? "4" : "2",
    revision: stage === "dispatch" ? 2 : stage === "cancel" ? 3 : 2,
  })
  const transitBalance = makeBalance({
    id: "transit-balance",
    store: sourceStore,
    quantity: stage === "dispatch" ? "2" : "0",
    revision: stage === "dispatch" ? 1 : 2,
    custodyType: "TRANSIT",
    custodyReferenceId: "transfer-1",
    parentBalanceSourceId: sourceStoreBalance.id,
    parentBalanceSource: sourceStoreBalance,
  })
  const targetStoreBalance = makeBalance({
    id: "target-store-balance",
    store: targetStore,
    quantity: "5",
    revision: 2,
  })
  let sourceBalance = sourceStoreBalance
  let targetBalance = transitBalance
  let sourceBeforePhysical = "4"
  let sourceAfterPhysical = "2"
  let targetBeforePhysical = "0"
  let targetAfterPhysical = "2"
  if (stage === "custody") {
    sourceBalance = makeBalance({
      id: "custody-source",
      store: sourceStore,
      quantity: "2",
      revision: 2,
    })
    targetBalance = makeBalance({
      id: "custody-target",
      store: sourceStore,
      quantity: "5",
      revision: 2,
      custodyType: "STAFF",
      custodyReferenceId: "staff-1",
      parentBalanceSourceId: "custody-source",
      parentBalanceSource: sourceBalance,
    })
    sourceBeforePhysical = "4"
    sourceAfterPhysical = "2"
    targetBeforePhysical = "3"
    targetAfterPhysical = "5"
  } else if (stage === "receive") {
    sourceBalance = transitBalance
    targetBalance = targetStoreBalance
    sourceBeforePhysical = "2"
    sourceAfterPhysical = "0"
    targetBeforePhysical = "3"
    targetAfterPhysical = "5"
  } else if (stage === "cancel") {
    sourceBalance = transitBalance
    targetBalance = sourceStoreBalance
    sourceBeforePhysical = "2"
    sourceAfterPhysical = "0"
    targetBeforePhysical = "2"
    targetAfterPhysical = "4"
  }

  const canonical = options.packaged ? "24" : "2"
  const sourceMovement = {
    id: `movement-${stage}-out`,
    operationId: "operation-1",
    balanceSourceId: sourceBalance.id,
    configurationVersionId: unit.configurationVersionId,
    enteredInventoryUnitId: unit.id,
    enteredInventoryUnit: unit,
    enteredQuantity: decimal("2"),
    transactionScaleSnapshot: 3,
    unitFactorSnapshot: decimal(factor),
    signedCanonicalEffect: decimal(`-${canonical}`),
    previousOnHandQuantity: decimal(sourceBeforePhysical),
    resultingOnHandQuantity: decimal(sourceAfterPhysical),
    reversalOfMovementId: null,
    balanceSource: sourceBalance,
    purchaseReceipt: null,
    valuationEvent: null as Record<string, unknown> | null,
  }
  const targetMovement = {
    id: `movement-${stage}-in`,
    operationId: "operation-1",
    balanceSourceId: targetBalance.id,
    configurationVersionId: unit.configurationVersionId,
    enteredInventoryUnitId: unit.id,
    enteredInventoryUnit: unit,
    enteredQuantity: decimal("2"),
    transactionScaleSnapshot: 3,
    unitFactorSnapshot: decimal(factor),
    signedCanonicalEffect: decimal(canonical),
    previousOnHandQuantity: decimal(targetBeforePhysical),
    resultingOnHandQuantity: decimal(targetAfterPhysical),
    reversalOfMovementId: null,
    balanceSource: targetBalance,
    purchaseReceipt: null,
    valuationEvent: null as Record<string, unknown> | null,
  }
  const store = sourceStore
  const operation = {
    id: "operation-1",
    tenantId: "tenant-1",
    storeId: sourceStore.id,
    type: stage === "custody" ? "CUSTODY_ASSIGNMENT" : "TRANSFER",
    source: "inventory_move",
    actorUserId,
    effectiveAt,
    correctionOfOperationId: null,
    store,
    movements: [sourceMovement, targetMovement],
    purchaseReceipts: [],
    productFulfillments: [],
    productReturns: [],
    finalizedCounts: [],
    finalizedCloseouts: [],
    corrections: [],
    dispatchedTransfers: [] as Array<Record<string, unknown>>,
    receivedTransfers: [] as Array<Record<string, unknown>>,
    cancelledTransfers: [] as Array<Record<string, unknown>>,
  }
  const transfer = {
    id: "transfer-1",
    tenantId: "tenant-1",
    sourceStoreId: sourceStore.id,
    targetStoreId: targetStore.id,
    sourceStore,
    targetStore,
    sourceBalanceSourceId: sourceStoreBalance.id,
    sourceBalanceSource: sourceStoreBalance,
    transitBalanceSourceId: transitBalance.id,
    transitBalanceSource: transitBalance,
    inventoryUnitId: unit.id,
    inventoryUnit: unit,
    configurationVersionId: unit.configurationVersionId,
    configurationVersion: unit.configurationVersion,
    enteredQuantity: decimal("2"),
    unitFactorSnapshot: decimal(factor),
    canonicalQuantity: decimal(canonical),
    stockBehaviorSnapshot: stockBehavior,
    createdByUserId: actorUserId,
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    status:
      stage === "dispatch"
        ? "IN_TRANSIT"
        : stage === "receive"
          ? "RECEIVED"
          : "CANCELLED",
    dispatchedAt:
      stage === "dispatch" ? effectiveAt : new Date("2026-09-12T00:00:00.000Z"),
    receivedAt: stage === "receive" ? effectiveAt : null,
    cancelledAt: stage === "cancel" ? effectiveAt : null,
    dispatchedOperationId: stage === "dispatch" ? operation.id : "dispatch-op",
    receivedOperationId: stage === "receive" ? operation.id : null,
    cancelledOperationId: stage === "cancel" ? operation.id : null,
  }
  if (stage === "dispatch") operation.dispatchedTransfers.push(transfer)
  if (stage === "receive") operation.receivedTransfers.push(transfer)
  if (stage === "cancel") operation.cancelledTransfers.push(transfer)

  const book: {
    id: string
    tenantId: string
    currencyCode: string
    startsAt: Date
    closedThrough: Date | null
  } = {
    id: "book-1",
    tenantId: "tenant-1",
    currencyCode: "NGN",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    closedThrough: null as Date | null,
  }
  const poolDefault = (
    id: string,
    balance: typeof sourceBalance,
    before: string,
    movementCount: number,
    valueMinor: bigint,
  ) => ({
    id,
    tenantId: "tenant-1",
    bookId: book.id,
    balanceSourceId: balance.id,
    quantity: decimal(before),
    valueMinor,
    unknownReason: null,
    lastStockRevision: balance.revision - 1,
    lastMovementCount: BigInt(movementCount - 1),
    lastSequence: BigInt(2),
    latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
  })
  const sourceBefore = options.packaged
    ? multiply(sourceBeforePhysical, factor)
    : sourceBeforePhysical
  const targetBefore = options.packaged
    ? multiply(targetBeforePhysical, factor)
    : targetBeforePhysical
  const sourceCount = options.sourceCount ?? (stage === "dispatch" ? 2 : 2)
  const targetCount =
    options.targetCount ??
    (stage === "dispatch" ? 1 : stage === "cancel" ? 3 : 2)
  const pools = new Map<string, Record<string, unknown> | null>()
  const sourcePool =
    options.sourcePool === undefined
      ? poolDefault(
          `${sourceBalance.id}-pool`,
          sourceBalance,
          sourceBefore,
          sourceCount,
          BigInt(options.packaged ? 101 : 101),
        )
      : options.sourcePool
  const targetPool = options.targetPool ?? null
  pools.set(sourceBalance.id, sourcePool)
  pools.set(targetBalance.id, targetPool)
  const createdEvents: Array<Record<string, unknown>> = []
  let countCalls = 0
  const tx = {
    stockOperation: {
      findFirst: async () => ({
        ...operation,
        _count: {
          purchaseReceipts: operation.purchaseReceipts.length,
          productFulfillments: operation.productFulfillments.length,
          productReturns: operation.productReturns.length,
          finalizedCounts: operation.finalizedCounts.length,
          finalizedCloseouts: operation.finalizedCloseouts.length,
          corrections: operation.corrections.length,
        },
      }),
    },
    financeBook: {
      findUnique: async () => (options.bookMissing ? null : book),
    },
    stockMovement: {
      count: async ({ where }: { where: { balanceSourceId: string } }) => {
        countCalls += 1
        return where.balanceSourceId === sourceBalance.id
          ? sourceCount
          : targetCount
      },
    },
    financeInventoryPool: {
      findUnique: async ({
        where,
      }: { where: { bookId_balanceSourceId: { balanceSourceId: string } } }) =>
        pools.get(where.bookId_balanceSourceId.balanceSourceId) ?? null,
      update: async ({
        where,
        data,
      }: { where: { id: string }; data: Record<string, unknown> }) => {
        const found = [...pools.entries()].find(
          ([, value]) => value?.id === where.id,
        )
        if (!found) throw new Error("Missing pool for update")
        const updated = { ...found[1], ...data }
        pools.set(found[0], updated)
        return updated
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `${String(data.balanceSourceId)}-pool`, ...data }
        pools.set(String(data.balanceSourceId), created)
        return created
      },
    },
    financeInventoryValuationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `event-${createdEvents.length + 1}`, ...data }
        createdEvents.push(created)
        return {
          ...created,
          canonicalEffect: decimal(String(data.canonicalEffect)),
          quantityBefore: decimal(String(data.quantityBefore)),
          quantityAfter: decimal(String(data.quantityAfter)),
        }
      },
    },
  } as unknown as Prisma.TransactionClient
  return {
    tx,
    operation,
    sourceBalance,
    targetBalance,
    sourceMovement,
    targetMovement,
    pools,
    createdEvents,
    book,
    getCountCalls: () => countCalls,
  }
}

function multiply(quantity: string, factor: string) {
  return (BigInt(quantity) * BigInt(factor)).toString()
}

function persistedEvent(event: Record<string, unknown>) {
  const poolId = String(event.poolId)
  const balanceSourceId = String(event.balanceSourceId)
  return {
    ...event,
    pool: {
      id: poolId,
      tenantId: "tenant-1",
      bookId: "book-1",
      balanceSourceId,
    },
    canonicalEffect: decimal(String(event.canonicalEffect)),
    quantityBefore: decimal(String(event.quantityBefore)),
    quantityAfter: decimal(String(event.quantityAfter)),
    purchaseReceiptId: null,
    productReturnCostId: null,
  }
}

describe("inventory relocation valuation", () => {
  test("allocates the original weighted issue and transfers that exact cost to a new zero destination", async () => {
    const state = fixture({ packaged: true })
    const result = await postFixtureRelocation(state.tx, {
      tenantId: "tenant-1",
      stockOperationId: "operation-1",
      expectedSourceStockRevision: 2,
      expectedTargetStockRevision: 1,
    })
    expect(result?.sourceEvent.kind).toBe("TRANSFER_OUT")
    expect(result?.sourceEvent.sourceKind).toBe("STOCK_TRANSFER_DISPATCH")
    expect(result?.sourceEvent.canonicalEffect.toFixed()).toBe("-24")
    expect(result?.sourceEvent.sourceCostMinor).toBe(BigInt(50))
    expect(result?.sourceEvent.valueAfterMinor).toBe(BigInt(51))
    expect(result?.targetEvent.sourceCostMinor).toBe(BigInt(50))
    expect(result?.targetEvent.valueAfterMinor).toBe(BigInt(50))
  })

  test("retains known inbound source cost when destination history is unknown", async () => {
    const state = fixture({ stage: "custody", targetCount: 2 })
    const result = await postFixtureRelocation(state.tx, {
      tenantId: "tenant-1",
      stockOperationId: "operation-1",
      expectedSourceStockRevision: 2,
      expectedTargetStockRevision: 2,
    })
    expect(result?.sourceEvent.sourceCostMinor).toBe(BigInt(50))
    expect(result?.targetEvent.sourceCostMinor).toBe(BigInt(50))
    expect(result?.targetEvent.valueBeforeMinor).toBeNull()
    expect(result?.targetEvent.valueDeltaMinor).toBeNull()
    expect(result?.targetEvent.valueAfterMinor).toBeNull()
    expect(result?.targetEvent.unknownReason).toBe("MISSING_OPENING_COST")
    expect(result?.sourceEvent.sourceKind).toBe("INVENTORY_CUSTODY_MOVE")
  })

  test("unknown source cost never becomes zero and retains a known target before value", async () => {
    const state = fixture({
      stage: "custody",
      sourcePool: {
        id: "source-pool",
        tenantId: "tenant-1",
        bookId: "book-1",
        balanceSourceId: "custody-source",
        quantity: decimal("4"),
        valueMinor: null,
        unknownReason: "PRIOR_UNKNOWN_COST",
        lastStockRevision: 1,
        lastMovementCount: BigInt(1),
        lastSequence: BigInt(2),
        latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
      },
      targetPool: {
        id: "target-pool",
        tenantId: "tenant-1",
        bookId: "book-1",
        balanceSourceId: "custody-target",
        quantity: decimal("3"),
        valueMinor: BigInt(9),
        unknownReason: null,
        lastStockRevision: 1,
        lastMovementCount: BigInt(1),
        lastSequence: BigInt(4),
        latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
      },
    })
    const result = await postFixtureRelocation(state.tx, {
      tenantId: "tenant-1",
      stockOperationId: "operation-1",
      expectedSourceStockRevision: 2,
      expectedTargetStockRevision: 2,
    })
    expect(result?.sourceEvent.sourceCostMinor).toBeNull()
    expect(result?.targetEvent.sourceCostMinor).toBeNull()
    expect(result?.targetEvent.valueBeforeMinor).toBe(BigInt(9))
    expect(result?.targetEvent.valueDeltaMinor).toBeNull()
    expect(result?.targetEvent.valueAfterMinor).toBeNull()
  })

  test("uncaptured net-zero destination history does not establish known zero", async () => {
    const state = fixture({ stage: "dispatch", targetCount: 2 })
    const result = await postFixtureRelocation(state.tx, {
      tenantId: "tenant-1",
      stockOperationId: "operation-1",
      expectedSourceStockRevision: 2,
      expectedTargetStockRevision: 1,
    })
    expect(result?.targetEvent.valueBeforeMinor).toBeNull()
    expect(result?.targetEvent.sourceCostMinor).toBe(BigInt(50))
    expect(result?.targetEvent.unknownReason).toBe("UNCAPTURED_MOVEMENTS")
  })

  test("saved pair replays before current stage, quantity, revision, or closed-date gates", async () => {
    const state = fixture()
    const first = await postFixtureRelocation(state.tx, {
      tenantId: "tenant-1",
      stockOperationId: "operation-1",
      expectedSourceStockRevision: 2,
      expectedTargetStockRevision: 1,
    })
    const [sourceEvent, targetEvent] = state.createdEvents
    if (!sourceEvent || !targetEvent) throw new Error("Expected saved pair")
    state.sourceMovement.valuationEvent = persistedEvent(sourceEvent)
    state.targetMovement.valuationEvent = persistedEvent(targetEvent)
    state.sourceBalance.onHandQuantity = decimal("99")
    state.sourceBalance.revision = 99
    state.targetBalance.onHandQuantity = decimal("98")
    state.targetBalance.revision = 98
    state.book.closedThrough = new Date("2026-09-30T00:00:00.000Z")
    const transfer = state.operation.dispatchedTransfers[0]
    if (!transfer) throw new Error("Expected dispatch transfer")
    transfer.status = "CANCELLED"
    const countCalls = state.getCountCalls()
    const replay = await postFixtureRelocation(state.tx, {
      tenantId: "tenant-1",
      stockOperationId: "operation-1",
      expectedSourceStockRevision: 2,
      expectedTargetStockRevision: 1,
    })
    expect(replay?.sourceEvent.id).toBe(first?.sourceEvent.id)
    expect(replay?.targetEvent.id).toBe(first?.targetEvent.id)
    expect(state.getCountCalls()).toBe(countCalls)
  })

  test("maps receive and cancel to their persisted source kinds", async () => {
    for (const stage of ["receive", "cancel"] as const) {
      const state = fixture({ stage })
      const result = await postFixtureRelocation(state.tx, {
        tenantId: "tenant-1",
        stockOperationId: "operation-1",
        expectedSourceStockRevision: state.sourceBalance.revision,
        expectedTargetStockRevision: state.targetBalance.revision,
      })
      expect(result?.sourceEvent.sourceKind).toBe(
        stage === "receive"
          ? "STOCK_TRANSFER_RECEIVE"
          : "STOCK_TRANSFER_CANCEL",
      )
      expect(result?.targetEvent.sourceId).toBe("transfer-1")
    }
  })

  test("rejects partial pairs and preserves no-Book physical operation", async () => {
    const partial = fixture()
    partial.sourceMovement.valuationEvent = { id: "partial" }
    await expect(
      postFixtureRelocation(partial.tx, {
        tenantId: "tenant-1",
        stockOperationId: "operation-1",
        expectedSourceStockRevision: 2,
        expectedTargetStockRevision: 1,
      }),
    ).rejects.toBeInstanceOf(FinanceError)

    const missingBook = fixture({ bookMissing: true })
    expect(
      await postFixtureRelocation(missingBook.tx, {
        tenantId: "tenant-1",
        stockOperationId: "operation-1",
        expectedSourceStockRevision: 2,
        expectedTargetStockRevision: 1,
      }),
    ).toBeNull()
  })

  test("rejects endpoint pool scope/revision corruption and zero-quantity positive value", async () => {
    const wrongBalance = fixture({ stage: "custody" })
    const sourcePool = wrongBalance.pools.get("custody-source")
    if (!sourcePool) throw new Error("Expected source pool")
    sourcePool.balanceSourceId = "custody-target"
    await expect(
      postFixtureRelocation(wrongBalance.tx, {
        tenantId: "tenant-1",
        stockOperationId: "operation-1",
        expectedSourceStockRevision: 2,
        expectedTargetStockRevision: 2,
      }),
    ).rejects.toBeInstanceOf(FinanceError)

    const futureRevision = fixture({ stage: "custody" })
    const revisionPool = futureRevision.pools.get("custody-source")
    if (!revisionPool) throw new Error("Expected source pool")
    revisionPool.lastStockRevision = 2
    await expect(
      postFixtureRelocation(futureRevision.tx, {
        tenantId: "tenant-1",
        stockOperationId: "operation-1",
        expectedSourceStockRevision: 2,
        expectedTargetStockRevision: 2,
      }),
    ).rejects.toBeInstanceOf(FinanceError)

    const zeroQuantity = fixture({ stage: "custody" })
    const emptyPool = zeroQuantity.pools.get("custody-source")
    if (!emptyPool) throw new Error("Expected source pool")
    emptyPool.quantity = decimal("0")
    emptyPool.valueMinor = BigInt(1)
    await expect(
      postFixtureRelocation(zeroQuantity.tx, {
        tenantId: "tenant-1",
        stockOperationId: "operation-1",
        expectedSourceStockRevision: 2,
        expectedTargetStockRevision: 2,
      }),
    ).rejects.toBeInstanceOf(FinanceError)
  })

  test("unknown saved source allocations cannot retain a known before value", async () => {
    const state = fixture()
    await postFixtureRelocation(state.tx, {
      tenantId: "tenant-1",
      stockOperationId: "operation-1",
      expectedSourceStockRevision: 2,
      expectedTargetStockRevision: 1,
    })
    const [sourceEvent, targetEvent] = state.createdEvents
    if (!sourceEvent || !targetEvent) throw new Error("Expected saved pair")
    const savedSource = persistedEvent(sourceEvent)
    const savedTarget = persistedEvent(targetEvent)
    Object.assign(savedSource, {
      sourceCostMinor: null,
      valueBeforeMinor: BigInt(0),
      valueDeltaMinor: null,
      valueAfterMinor: null,
      unknownReason: "PRIOR_UNKNOWN_COST",
    })
    Object.assign(savedTarget, {
      sourceCostMinor: null,
      valueDeltaMinor: null,
      valueAfterMinor: null,
      unknownReason: "PRIOR_UNKNOWN_COST",
    })
    state.sourceMovement.valuationEvent = savedSource
    state.targetMovement.valuationEvent = savedTarget
    await expect(
      postFixtureRelocation(state.tx, {
        tenantId: "tenant-1",
        stockOperationId: "operation-1",
        expectedSourceStockRevision: 2,
        expectedTargetStockRevision: 1,
      }),
    ).rejects.toBeInstanceOf(FinanceError)
  })

  test("rejects target value overflow, chronology and closed dates before writing any pair", async () => {
    const overflow = fixture({ stage: "custody", targetCount: 2 })
    overflow.pools.set(overflow.targetBalance.id, {
      id: "target-pool",
      tenantId: "tenant-1",
      bookId: "book-1",
      balanceSourceId: overflow.targetBalance.id,
      quantity: decimal("3"),
      valueMinor: BigInt("9223372036854775807") - BigInt(49),
      unknownReason: null,
      lastStockRevision: 1,
      lastMovementCount: BigInt(1),
      lastSequence: BigInt(1),
      latestEffectiveAt: new Date("2026-09-10T00:00:00.000Z"),
    })
    const chronological = fixture()
    const datedPool = chronological.pools.get(chronological.sourceBalance.id)
    if (!datedPool) throw new Error("Expected source pool")
    datedPool.latestEffectiveAt = new Date("2026-09-16T00:00:00.000Z")
    const closed = fixture()
    closed.book.closedThrough = new Date("2026-09-16T00:00:00.000Z")
    for (const [state, code] of [
      [overflow, "INVALID_AMOUNT"],
      [chronological, "INVALID_JOURNAL"],
      [closed, "CLOSED_PERIOD"],
    ] as const) {
      const originalPools = [...state.pools.entries()]
      await expect(
        postFixtureRelocation(state.tx, {
          tenantId: "tenant-1",
          stockOperationId: "operation-1",
          expectedSourceStockRevision: state.sourceBalance.revision,
          expectedTargetStockRevision: state.targetBalance.revision,
        }),
      ).rejects.toMatchObject({ code })
      expect(state.createdEvents).toHaveLength(0)
      expect([...state.pools.entries()]).toEqual(originalPools)
    }
  })

  test("saved replay rejects invented value on an empty inbound starting balance", async () => {
    const state = fixture()
    await postFixtureRelocation(state.tx, {
      tenantId: "tenant-1",
      stockOperationId: "operation-1",
      expectedSourceStockRevision: 2,
      expectedTargetStockRevision: 1,
    })
    const [sourceEvent, targetEvent] = state.createdEvents
    if (!sourceEvent || !targetEvent) throw new Error("Expected saved pair")
    const savedTarget = persistedEvent(targetEvent)
    Object.assign(savedTarget, {
      valueBeforeMinor: BigInt(9),
      valueAfterMinor: BigInt(59),
    })
    state.sourceMovement.valuationEvent = persistedEvent(sourceEvent)
    state.targetMovement.valuationEvent = savedTarget
    await expect(
      postFixtureRelocation(state.tx, {
        tenantId: "tenant-1",
        stockOperationId: "operation-1",
        expectedSourceStockRevision: 2,
        expectedTargetStockRevision: 1,
      }),
    ).rejects.toBeInstanceOf(FinanceError)
  })
})
