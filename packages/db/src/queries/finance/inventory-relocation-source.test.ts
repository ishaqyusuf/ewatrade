import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { resolveInventoryRelocationSourceInTransaction } from "./inventory-relocation-source"
import { FinanceError } from "./rules"

const decimal = (value: string) => ({ toFixed: () => value })
const timestamp = new Date("2026-09-15T12:00:00.000Z")
const sourceStore = {
  id: "store-source",
  tenantId: "tenant-1",
  currencyCode: "NGN",
}
const targetStore = {
  id: "store-target",
  tenantId: "tenant-1",
  currencyCode: "NGN",
}
const configurationVersion = {
  id: "configuration-1",
  productId: "product-1",
}
const unit = {
  id: "unit-1",
  configurationVersionId: configurationVersion.id,
  configurationVersion,
  factor: decimal("1"),
  transactionScale: 3,
  stockBehavior: "CANONICAL_SHARED",
}

function endpointBalance(input: {
  id: string
  store: typeof sourceStore
  custodyType: "STORE" | "STAFF" | "SESSION" | "TRANSIT"
  parentId?: string | null
  referenceId?: string
  factor?: string
  kind?: "SHARED_POOL" | "PACKAGED_STOCK"
}) {
  const factor = input.factor ?? "1"
  const inventoryUnit = {
    ...unit,
    factor: decimal(factor),
    stockBehavior:
      input.kind === "PACKAGED_STOCK"
        ? "PACKAGED_STOCK"
        : Number(factor) === 1
          ? "CANONICAL_SHARED"
          : "ALTERNATE_TRANSACTION",
  }
  return {
    id: input.id,
    tenantId: "tenant-1",
    storeId: input.store.id,
    store: input.store,
    productId: "product-1",
    product: {
      id: "product-1",
      catalogItemId: "item-1",
      catalogItem: { id: "item-1", tenantId: "tenant-1" },
    },
    variantId: "variant-1",
    variant: {
      id: "variant-1",
      catalogItemId: "item-1",
      catalogItem: { id: "item-1", tenantId: "tenant-1" },
    },
    inventoryUnitId: inventoryUnit.id,
    inventoryUnit,
    kind: input.kind ?? "SHARED_POOL",
    custodyType: input.custodyType,
    custodyReferenceId: input.referenceId ?? "",
    parentBalanceSourceId: input.parentId ?? null,
    parentBalanceSource: input.parentId
      ? {
          id: input.parentId,
          tenantId: "tenant-1",
          storeId: input.store.id,
          productId: "product-1",
          variantId: "variant-1",
          inventoryUnitId: inventoryUnit.id,
          kind: input.kind ?? "SHARED_POOL",
          custodyType: "STORE",
        }
      : null,
  }
}

function movement(input: {
  id: string
  operationId: string
  balance: ReturnType<typeof endpointBalance>
  enteredQuantity: string
  factor?: string
  before: string
  after: string
  effect: string
  kind?: "SHARED_POOL" | "PACKAGED_STOCK"
  configId?: string
  tenantId?: string
  unitId?: string
  reversalOfMovementId?: string | null
  valuationEvent?: Record<string, unknown> | null
}) {
  const factor = input.factor ?? "1"
  const enteredUnit = {
    ...input.balance.inventoryUnit,
    id: input.unitId ?? unit.id,
    configurationVersionId: input.configId ?? configurationVersion.id,
    configurationVersion: {
      ...configurationVersion,
      productId: "product-1",
    },
  }
  return {
    id: input.id,
    operationId: input.operationId,
    balanceSourceId: input.balance.id,
    balanceSource: {
      ...input.balance,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    },
    configurationVersionId: input.configId ?? configurationVersion.id,
    enteredInventoryUnitId: input.unitId ?? unit.id,
    enteredInventoryUnit: enteredUnit,
    enteredQuantity: decimal(input.enteredQuantity),
    transactionScaleSnapshot: enteredUnit.transactionScale,
    unitFactorSnapshot: decimal(factor),
    previousOnHandQuantity: decimal(input.before),
    resultingOnHandQuantity: decimal(input.after),
    signedCanonicalEffect: decimal(input.effect),
    reversalOfMovementId: input.reversalOfMovementId ?? null,
    purchaseReceipt: null,
    valuationEvent: input.valuationEvent ?? null,
  }
}

function transferFixture(
  options: {
    stage?: "dispatch" | "receive" | "cancel"
    factor?: string
    kind?: "SHARED_POOL" | "PACKAGED_STOCK"
    status?: "IN_TRANSIT" | "RECEIVED" | "CANCELLED"
    noBook?: boolean
    targetCurrency?: string
    brokenLink?: boolean
    brokenTransitLink?: boolean
    wrongTenant?: boolean
    correctionOf?: boolean
    partialPair?: boolean
    correctionCount?: number
  } = {},
) {
  const stage = options.stage ?? "dispatch"
  const factor = options.factor ?? "1"
  const kind = options.kind ?? "SHARED_POOL"
  const source = endpointBalance({
    id: "balance-source",
    store: sourceStore,
    custodyType: "STORE",
    factor,
    kind,
  })
  const transit = endpointBalance({
    id: "balance-transit",
    store: sourceStore,
    custodyType: "TRANSIT",
    parentId: source.id,
    referenceId: "transfer-1",
    factor,
    kind,
  })
  const destination = endpointBalance({
    id: "balance-target",
    store:
      options.targetCurrency === undefined
        ? targetStore
        : { ...targetStore, currencyCode: options.targetCurrency },
    custodyType: "STORE",
    factor,
    kind,
  })
  const physical = (quantity: number) =>
    kind === "PACKAGED_STOCK"
      ? String(quantity)
      : String(quantity * Number(factor))
  const enteredQuantity = stage === "dispatch" ? "2" : "2"
  const canonical = String(Number(enteredQuantity) * Number(factor))
  const sourceMovement =
    stage === "dispatch"
      ? movement({
          id: "movement-out",
          operationId: "operation-1",
          balance: source,
          enteredQuantity,
          factor,
          kind,
          before: physical(4),
          after: physical(2),
          effect: `-${canonical}`,
        })
      : movement({
          id: "movement-out",
          operationId: "operation-1",
          balance: transit,
          enteredQuantity,
          factor,
          kind,
          before: physical(2),
          after: physical(0),
          effect: `-${canonical}`,
        })
  const targetMovement =
    stage === "dispatch"
      ? movement({
          id: "movement-in",
          operationId: "operation-1",
          balance: transit,
          enteredQuantity,
          factor,
          kind,
          before: physical(0),
          after: physical(2),
          effect: canonical,
        })
      : stage === "receive"
        ? movement({
            id: "movement-in",
            operationId: "operation-1",
            balance: destination,
            enteredQuantity,
            factor,
            kind,
            before: physical(3),
            after: physical(5),
            effect: canonical,
          })
        : movement({
            id: "movement-in",
            operationId: "operation-1",
            balance: source,
            enteredQuantity,
            factor,
            kind,
            before: physical(4),
            after: physical(6),
            effect: canonical,
          })
  const dispatchDate =
    stage === "dispatch" ? timestamp : new Date("2026-09-14T12:00:00.000Z")
  const transfer = {
    id: "transfer-1",
    tenantId: options.wrongTenant ? "tenant-other" : "tenant-1",
    sourceStoreId: sourceStore.id,
    targetStoreId: targetStore.id,
    sourceStore,
    targetStore:
      options.targetCurrency === undefined
        ? targetStore
        : { ...targetStore, currencyCode: options.targetCurrency },
    sourceBalanceSourceId: source.id,
    sourceBalanceSource: source,
    transitBalanceSourceId: options.brokenTransitLink
      ? "other-transit"
      : transit.id,
    transitBalanceSource: transit,
    inventoryUnitId: unit.id,
    inventoryUnit: {
      ...unit,
      factor: decimal(factor),
      stockBehavior:
        kind === "PACKAGED_STOCK"
          ? "PACKAGED_STOCK"
          : Number(factor) === 1
            ? "CANONICAL_SHARED"
            : "ALTERNATE_TRANSACTION",
    },
    configurationVersionId: configurationVersion.id,
    configurationVersion,
    enteredQuantity: decimal(enteredQuantity),
    unitFactorSnapshot: decimal(factor),
    canonicalQuantity: decimal(canonical),
    stockBehaviorSnapshot:
      kind === "PACKAGED_STOCK"
        ? "PACKAGED_STOCK"
        : Number(factor) === 1
          ? "CANONICAL_SHARED"
          : "ALTERNATE_TRANSACTION",
    createdByUserId: "dispatch-actor",
    dispatchedOperationId: "operation-dispatch",
    receivedOperationId:
      stage === "receive" && !options.brokenLink ? "operation-1" : null,
    cancelledOperationId:
      stage === "cancel" && !options.brokenLink ? "operation-1" : null,
    status:
      options.status ??
      (stage === "dispatch"
        ? "IN_TRANSIT"
        : stage === "receive"
          ? "RECEIVED"
          : "CANCELLED"),
    createdAt: new Date("2026-09-14T11:00:00.000Z"),
    dispatchedAt: dispatchDate,
    receivedAt: stage === "receive" ? timestamp : null,
    cancelledAt: stage === "cancel" ? timestamp : null,
  }
  const operation = {
    id: "operation-1",
    tenantId: "tenant-1",
    storeId: sourceStore.id,
    type: "TRANSFER",
    correctionOfOperationId: options.correctionOf ? "original-op" : null,
    actorUserId: stage === "dispatch" ? "dispatch-actor" : "transition-actor",
    effectiveAt: timestamp,
    store: sourceStore,
    movements: options.partialPair
      ? [sourceMovement]
      : [sourceMovement, targetMovement],
    purchaseReceipts: [],
    productFulfillments: [],
    productReturns: [],
    finalizedCounts: [],
    finalizedCloseouts: [],
    corrections: Array.from(
      { length: options.correctionCount ?? 0 },
      (_, index) => ({
        id: `correction-${index}`,
      }),
    ),
    dispatchedTransfers:
      stage === "dispatch"
        ? [{ ...transfer, dispatchedOperationId: "operation-1" }]
        : [],
    receivedTransfers: stage === "receive" ? [transfer] : [],
    cancelledTransfers: stage === "cancel" ? [transfer] : [],
  }
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
      findUnique: async () =>
        options.noBook
          ? null
          : {
              id: "book-1",
              tenantId: "tenant-1",
              currencyCode: "NGN",
            },
    },
  }
  return { tx: tx as unknown as Prisma.TransactionClient, operation, transfer }
}

function custodyFixture(
  options: {
    returning?: boolean
    factor?: string
    kind?: "SHARED_POOL" | "PACKAGED_STOCK"
    invalidParent?: boolean
    hasTransferOwner?: boolean
  } = {},
) {
  const returning = options.returning ?? false
  const factor = options.factor ?? "1"
  const kind = options.kind ?? "SHARED_POOL"
  const storeBalance = endpointBalance({
    id: "balance-store",
    store: sourceStore,
    custodyType: "STORE",
    factor,
    kind,
  })
  const staffBalance = endpointBalance({
    id: "balance-staff",
    store: sourceStore,
    custodyType: "STAFF",
    parentId: options.invalidParent ? "foreign-parent" : storeBalance.id,
    referenceId: "staff-1",
    factor,
    kind,
  })
  const sourceBalance = returning ? staffBalance : storeBalance
  const targetBalance = returning ? storeBalance : staffBalance
  const physical = (quantity: number) =>
    kind === "PACKAGED_STOCK"
      ? String(quantity)
      : String(quantity * Number(factor))
  const beforeSource = physical(returning ? 2 : 4)
  const afterSource = physical(returning ? 0 : 2)
  const beforeTarget = physical(returning ? 2 : 0)
  const afterTarget = physical(returning ? 4 : 2)
  const canonical = String(2 * Number(factor))
  const operation = {
    id: "custody-operation",
    committedReservation: null as { id: string } | null,
    tenantId: "tenant-1",
    storeId: sourceStore.id,
    type: returning ? "CUSTODY_RETURN" : "CUSTODY_ASSIGNMENT",
    correctionOfOperationId: null,
    actorUserId: "operator-1",
    effectiveAt: timestamp,
    store: sourceStore,
    movements: [
      movement({
        id: "custody-out",
        operationId: "custody-operation",
        balance: sourceBalance,
        enteredQuantity: "2",
        factor,
        kind,
        before: beforeSource,
        after: afterSource,
        effect: `-${canonical}`,
      }),
      movement({
        id: "custody-in",
        operationId: "custody-operation",
        balance: targetBalance,
        enteredQuantity: "2",
        factor,
        kind,
        before: beforeTarget,
        after: afterTarget,
        effect: canonical,
      }),
    ],
    purchaseReceipts: [],
    productFulfillments: [],
    productReturns: [],
    finalizedCounts: [],
    finalizedCloseouts: [],
    corrections: [],
    dispatchedTransfers: options.hasTransferOwner ? [{ id: "transfer-1" }] : [],
    receivedTransfers: [],
    cancelledTransfers: [],
  }
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
      findUnique: async () => ({
        id: "book-1",
        tenantId: "tenant-1",
        currencyCode: "NGN",
      }),
    },
  }
  return { tx: tx as unknown as Prisma.TransactionClient, operation }
}

async function resolve(value: {
  tx: Prisma.TransactionClient
}) {
  return resolveInventoryRelocationSourceInTransaction(value.tx, {
    tenantId: "tenant-1",
    stockOperationId: "operation-1",
  })
}

describe("inventory relocation source proof", () => {
  test("custody cannot claim a committed reservation's operation", async () => {
    const f = custodyFixture()
    f.operation.committedReservation = { id: "reservation" }
    await expect(
      resolveInventoryRelocationSourceInTransaction(f.tx, {
        tenantId: "tenant-1",
        stockOperationId: "custody-operation",
      }),
    ).rejects.toBeInstanceOf(FinanceError)
  })
  test("proves custody assignment and return from the persisted custody graph", async () => {
    const assignment = custodyFixture()
    const assignmentResult =
      await resolveInventoryRelocationSourceInTransaction(assignment.tx, {
        tenantId: "tenant-1",
        stockOperationId: "custody-operation",
      })
    expect(assignmentResult?.sourceKind).toBe("INVENTORY_CUSTODY_MOVE")
    expect(assignmentResult?.sourceId).toBe("custody-operation")

    const returned = custodyFixture({ returning: true })
    const returnResult = await resolveInventoryRelocationSourceInTransaction(
      returned.tx,
      { tenantId: "tenant-1", stockOperationId: "custody-operation" },
    )
    expect(returnResult?.source.balance.id).toBe("balance-staff")
    expect(returnResult?.target.balance.id).toBe("balance-store")
  })

  test("proves dispatch, receipt and cancellation as separate persisted stages", async () => {
    for (const [stage, sourceKind] of [
      ["dispatch", "STOCK_TRANSFER_DISPATCH"],
      ["receive", "STOCK_TRANSFER_RECEIVE"],
      ["cancel", "STOCK_TRANSFER_CANCEL"],
    ] as const) {
      const f = transferFixture({ stage })
      const result = await resolve(f)
      expect(result?.sourceKind).toBe(sourceKind)
      expect(result?.sourceId).toBe("transfer-1")
      expect(result?.freshStageValid).toBe(true)
    }
  })

  test("converts packaged physical quantities while preserving the movement event graph", async () => {
    const f = transferFixture({ factor: "12", kind: "PACKAGED_STOCK" })
    const sourceMove = f.operation.movements[0]
    if (!sourceMove) throw new Error("fixture source movement missing")
    sourceMove.valuationEvent = {
      id: "event-1",
      poolId: "pool-1",
      pool: {
        id: "pool-1",
        tenantId: "tenant-1",
        bookId: "book-1",
        balanceSourceId: "balance-source",
      },
    }
    const result = await resolve(f)
    expect(result?.source.before).toBe("48")
    expect(result?.source.after).toBe("24")
    expect(result?.source.effect).toBe("-24")
    expect(result?.source.movement.valuationEvent?.pool.id).toBe("pool-1")
  })

  test("keeps shared endpoint snapshots in the canonical balance unit", async () => {
    const result = await resolve(transferFixture({ kind: "SHARED_POOL" }))
    expect(result?.source.before).toBe("4")
    expect(result?.source.after).toBe("2")
    expect(result?.source.effect).toBe("-2")
    await expect(
      resolve(transferFixture({ factor: "12", kind: "SHARED_POOL" })),
    ).rejects.toBeInstanceOf(FinanceError)
  })

  test("keeps exact replay proof available after transfer closure while fresh status fails", async () => {
    const f = transferFixture({ stage: "dispatch", status: "RECEIVED" })
    const result = await resolve(f)
    expect(result?.freshStageValid).toBe(false)
    expect(result?.source.balance.id).toBe("balance-source")
  })

  test("rejects corrupted immutable stage dates even when status is closed", async () => {
    const f = transferFixture({ stage: "dispatch", status: "RECEIVED" })
    const dispatch = f.operation.dispatchedTransfers[0]
    if (!dispatch) throw new Error("fixture dispatch link missing")
    dispatch.dispatchedAt = new Date("2026-09-13T12:00:00.000Z")
    await expect(resolve(f)).rejects.toBeInstanceOf(FinanceError)
  })

  test("returns no-Book status and rejects cross-currency adapter scope", async () => {
    expect(await resolve(transferFixture({ noBook: true }))).toBeNull()
    await expect(
      resolve(transferFixture({ targetCurrency: "USD" })),
    ).rejects.toBeInstanceOf(FinanceError)
  })

  test("rejects incomplete, mislinked, foreign and malformed custody pairs", async () => {
    await expect(
      resolve(transferFixture({ partialPair: true })),
    ).rejects.toBeInstanceOf(FinanceError)
    await expect(
      resolve(transferFixture({ brokenLink: true, stage: "receive" })),
    ).rejects.toBeInstanceOf(FinanceError)
    await expect(
      resolve(transferFixture({ wrongTenant: true })),
    ).rejects.toBeInstanceOf(FinanceError)
    await expect(
      resolve(transferFixture({ brokenTransitLink: true })),
    ).rejects.toBeInstanceOf(FinanceError)
    await expect(
      resolve(transferFixture({ correctionOf: true })),
    ).rejects.toBeInstanceOf(FinanceError)
    const badUnit = transferFixture()
    const badUnitMovement = badUnit.operation.movements[0]
    if (!badUnitMovement) throw new Error("fixture movement missing")
    badUnitMovement.enteredInventoryUnitId = "other-unit"
    await expect(resolve(badUnit)).rejects.toBeInstanceOf(FinanceError)
    const badFactor = transferFixture()
    const factorMovement = badFactor.operation.movements[0]
    if (!factorMovement) throw new Error("fixture movement missing")
    factorMovement.balanceSource.inventoryUnit.factor = decimal("2")
    await expect(resolve(badFactor)).rejects.toBeInstanceOf(FinanceError)
    await expect(
      resolveInventoryRelocationSourceInTransaction(
        custodyFixture({ invalidParent: true }).tx,
        { tenantId: "tenant-1", stockOperationId: "custody-operation" },
      ),
    ).rejects.toBeInstanceOf(FinanceError)
    await expect(
      resolveInventoryRelocationSourceInTransaction(
        custodyFixture({ hasTransferOwner: true }).tx,
        { tenantId: "tenant-1", stockOperationId: "custody-operation" },
      ),
    ).rejects.toBeInstanceOf(FinanceError)
  })

  test("exposes corrections separately for fresh-source gating", async () => {
    const f = transferFixture({ correctionCount: 1 })
    expect((await resolve(f))?.correctionCount).toBe(1)
  })
})
