import {
  addExactDecimals,
  compareExactDecimals,
  multiplyExactDecimals,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  OfflineCommandStatus,
  StockOperationType,
} from "../../generated/prisma/enums"

const balanceReportGraph = {
  inventoryUnit: { include: { configurationVersion: true } },
  product: { include: { catalogItem: true } },
  store: true,
  variant: true,
} as const

export async function listInventoryBalanceReport(
  db: PrismaClient,
  input: {
    includeCompatibleTotals?: boolean
    storeId?: string
    tenantId: string
  },
) {
  const balances = await db.stockBalanceSource.findMany({
    include: balanceReportGraph,
    orderBy: [
      { store: { name: "asc" } },
      { product: { catalogItem: { name: "asc" } } },
      { variant: { sortOrder: "asc" } },
      { inventoryUnit: { sortOrder: "asc" } },
    ],
    where: { storeId: input.storeId, tenantId: input.tenantId },
  })
  const rows = balances.map((balance) => ({
    availableQuantity: subtractExactDecimals(
      balance.onHandQuantity.toString(),
      balance.reservedQuantity.toString(),
    ),
    balanceSourceId: balance.id,
    custodyReferenceId: balance.custodyReferenceId || null,
    custodyType: balance.custodyType,
    configurationVersionId: balance.inventoryUnit.configurationVersionId,
    inventoryUnitId: balance.inventoryUnitId,
    inventoryUnitName: balance.inventoryUnit.name,
    kind: balance.kind,
    onHandQuantity: balance.onHandQuantity.toString(),
    productId: balance.productId,
    productName: balance.product.catalogItem.name,
    reservedQuantity: balance.reservedQuantity.toString(),
    revision: balance.revision,
    storeId: balance.storeId,
    storeName: balance.store.name,
    variantId: balance.variantId,
    variantName: balance.variant.name,
  }))
  if (!input.includeCompatibleTotals) {
    return { compatibleCanonicalTotals: [], rows }
  }

  const groups = new Map<
    string,
    {
      components: Array<{
        balanceSourceId: string
        canonicalOnHandQuantity: string
        inventoryUnitName: string
        kind: string
      }>
      custodyReferenceId: string | null
      custodyType: string
      onHandCanonicalQuantity: string
      productId: string
      productName: string
      reservedCanonicalQuantity: string
      storeId: string
      variantId: string
      variantName: string
    }
  >()
  for (const balance of balances) {
    const key = [
      balance.storeId,
      balance.variantId,
      balance.custodyType,
      balance.custodyReferenceId,
    ].join(":")
    const canonicalOnHand = multiplyExactDecimals(
      balance.onHandQuantity.toString(),
      balance.inventoryUnit.factor.toString(),
    )
    const canonicalReserved = multiplyExactDecimals(
      balance.reservedQuantity.toString(),
      balance.inventoryUnit.factor.toString(),
    )
    const group = groups.get(key) ?? {
      components: [],
      custodyReferenceId: balance.custodyReferenceId || null,
      custodyType: balance.custodyType,
      onHandCanonicalQuantity: "0",
      productId: balance.productId,
      productName: balance.product.catalogItem.name,
      reservedCanonicalQuantity: "0",
      storeId: balance.storeId,
      variantId: balance.variantId,
      variantName: balance.variant.name,
    }
    group.onHandCanonicalQuantity = addExactDecimals(
      group.onHandCanonicalQuantity,
      canonicalOnHand,
    )
    group.reservedCanonicalQuantity = addExactDecimals(
      group.reservedCanonicalQuantity,
      canonicalReserved,
    )
    group.components.push({
      balanceSourceId: balance.id,
      canonicalOnHandQuantity: canonicalOnHand,
      inventoryUnitName: balance.inventoryUnit.name,
      kind: balance.kind,
    })
    groups.set(key, group)
  }
  return {
    compatibleCanonicalTotals: [...groups.values()].map((group) => ({
      ...group,
      availableCanonicalQuantity: subtractExactDecimals(
        group.onHandCanonicalQuantity,
        group.reservedCanonicalQuantity,
      ),
      informationalOnly: true as const,
    })),
    rows,
  }
}

export async function getStockOperationAudit(
  db: PrismaClient,
  input: { operationId: string; tenantId: string },
) {
  const operation = await db.stockOperation.findFirst({
    include: {
      corrections: { select: { id: true } },
      linkedOperation: { select: { id: true, type: true } },
      linkedOperations: { select: { id: true, type: true } },
      movements: {
        include: {
          balanceSource: { include: balanceReportGraph },
          enteredInventoryUnit: true,
          reversalOfMovement: { select: { id: true } },
          reversals: { select: { id: true } },
        },
      },
    },
    where: { id: input.operationId, tenantId: input.tenantId },
  })
  if (!operation) return null
  const canonicalNetEffect = operation.movements.reduce(
    (total, movement) =>
      addExactDecimals(total, movement.signedCanonicalEffect.toString()),
    "0",
  )
  return {
    actorUserId: operation.actorUserId,
    canonicalNetEffect,
    clientOperationId: operation.clientOperationId,
    correctionIds: operation.corrections.map((row) => row.id),
    correctionOfOperationId: operation.correctionOfOperationId,
    createdAt: operation.createdAt,
    effectiveAt: operation.effectiveAt,
    id: operation.id,
    linkedOperation: operation.linkedOperation,
    linkedOperations: operation.linkedOperations,
    movements: operation.movements.map((movement) => ({
      balanceSourceId: movement.balanceSourceId,
      barcode: null,
      configurationVersionId: movement.configurationVersionId,
      currencyCodeSnapshot: movement.currencyCodeSnapshot,
      custodyReferenceId:
        movement.balanceSource.custodyReferenceId || null,
      custodyType: movement.balanceSource.custodyType,
      enteredInventoryUnitId: movement.enteredInventoryUnitId,
      enteredInventoryUnitName: movement.enteredInventoryUnit.name,
      enteredQuantity: movement.enteredQuantity.toString(),
      id: movement.id,
      previousOnHandQuantity: movement.previousOnHandQuantity.toString(),
      productName: movement.balanceSource.product.catalogItem.name,
      resultingOnHandQuantity: movement.resultingOnHandQuantity.toString(),
      reversalIds: movement.reversals.map((row) => row.id),
      reversalOfMovementId: movement.reversalOfMovement?.id ?? null,
      signedCanonicalEffect: movement.signedCanonicalEffect.toString(),
      storeName: movement.balanceSource.store.name,
      totalCostMinorSnapshot:
        movement.totalCostMinorSnapshot?.toString() ?? null,
      transactionScaleSnapshot: movement.transactionScaleSnapshot,
      unitCostMinorSnapshot: movement.unitCostMinorSnapshot,
      unitFactorSnapshot: movement.unitFactorSnapshot.toString(),
      variantName: movement.balanceSource.variant.name,
    })),
    payloadHash: operation.payloadHash,
    reason: operation.reason,
    source: operation.source,
    storeId: operation.storeId,
    transformationConserved:
      operation.type === StockOperationType.TRANSFORMATION
        ? compareExactDecimals(canonicalNetEffect, "0") === 0
        : null,
    type: operation.type,
  }
}

export async function listInventoryOperationHistory(
  db: PrismaClient,
  input: {
    limit?: number
    storeId?: string
    tenantId: string
    type?: StockOperationType
  },
) {
  const operations = await db.stockOperation.findMany({
    include: { movements: true },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(input.limit ?? 50, 1), 200),
    where: {
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: input.type,
    },
  })
  return operations.map((operation) => ({
    actorUserId: operation.actorUserId,
    canonicalNetEffect: operation.movements.reduce(
      (total, movement) =>
        addExactDecimals(total, movement.signedCanonicalEffect.toString()),
      "0",
    ),
    createdAt: operation.createdAt,
    effectiveAt: operation.effectiveAt,
    id: operation.id,
    movementCount: operation.movements.length,
    reason: operation.reason,
    source: operation.source,
    type: operation.type,
  }))
}

export async function getInventoryReconciliationSummary(
  db: PrismaClient,
  input: { storeId?: string; tenantId: string },
) {
  const storeWhere = { storeId: input.storeId, tenantId: input.tenantId }
  const [
    reservations,
    transfers,
    closeouts,
    returns,
    offline,
    provisional,
  ] = await Promise.all([
    db.stockReservation.groupBy({
      _count: true,
      by: ["status"],
      where: storeWhere,
    }),
    db.stockTransfer.groupBy({
      _count: true,
      by: ["status"],
      where: {
        tenantId: input.tenantId,
        OR: input.storeId
          ? [{ sourceStoreId: input.storeId }, { targetStoreId: input.storeId }]
          : undefined,
      },
    }),
    db.inventoryCloseout.groupBy({
      _count: true,
      by: ["status"],
      where: storeWhere,
    }),
    db.productReturn.groupBy({
      _count: true,
      by: ["disposition"],
      where: storeWhere,
    }),
    db.offlineCommand.groupBy({
      _count: true,
      by: ["status"],
      where: storeWhere,
    }),
    db.offlineCommand.count({
      where: { ...storeWhere, status: OfflineCommandStatus.PENDING },
    }),
  ])
  return {
    closeouts,
    offline,
    provisionalCommands: provisional,
    reservations,
    returns,
    transfers,
  }
}

export async function exportInventoryAuditRows(
  db: PrismaClient,
  input: { storeId?: string; tenantId: string },
) {
  const movements = await db.stockMovement.findMany({
    include: {
      balanceSource: { include: balanceReportGraph },
      enteredInventoryUnit: true,
      operation: true,
    },
    orderBy: [{ operation: { effectiveAt: "asc" } }, { createdAt: "asc" }],
    where: {
      operation: {
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    },
  })
  return movements.map((movement) => ({
    actorUserId: movement.operation.actorUserId,
    balanceSourceId: movement.balanceSourceId,
    configurationVersionId: movement.configurationVersionId,
    createdAt: movement.createdAt.toISOString(),
    currencyCodeSnapshot: movement.currencyCodeSnapshot,
    effectiveAt: movement.operation.effectiveAt.toISOString(),
    enteredQuantity: movement.enteredQuantity.toString(),
    enteredUnit: movement.enteredInventoryUnit.name,
    movementId: movement.id,
    operationId: movement.operationId,
    operationType: movement.operation.type,
    previousOnHandQuantity: movement.previousOnHandQuantity.toString(),
    productName: movement.balanceSource.product.catalogItem.name,
    resultingOnHandQuantity: movement.resultingOnHandQuantity.toString(),
    signedCanonicalEffect: movement.signedCanonicalEffect.toString(),
    source: movement.operation.source,
    storeName: movement.balanceSource.store.name,
    totalCostMinorSnapshot:
      movement.totalCostMinorSnapshot?.toString() ?? null,
    unitCostMinorSnapshot: movement.unitCostMinorSnapshot,
    unitFactorSnapshot: movement.unitFactorSnapshot.toString(),
    variantName: movement.balanceSource.variant.name,
  }))
}
