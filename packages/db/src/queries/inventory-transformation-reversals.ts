import { createHash } from "node:crypto"

import {
  addExactDecimals,
  compareExactDecimals,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  StockBalanceKind,
  StockOperationType,
  UnitConfigurationStatus,
} from "../../generated/prisma/enums"
import { CatalogError, stableJson } from "./catalog"
import { recordPackagedTransformationRestorationValuationInTransaction } from "./finance/valuation-transformation-reversals"
import { stockOperationCategoryGraph } from "./inventory-categories"
import { lockInventoryFinancialStore } from "./inventory-finance-locks"
import { serializeStockOperation } from "./inventory-operations"

export type ReverseStockTransformationInput = {
  actorUserId: string
  clientOperationId: string
  /** Current revision of the original source balance (it receives stock back). */
  expectedSourceBalanceRevision: number
  /** Current revision of the original target balance (it gives stock back). */
  expectedTargetBalanceRevision: number
  operationId: string
  reason: string
  schemaVersion: number
  source: string
  tenantId: string
}

const resultGraph = {
  movements: true,
  categories: stockOperationCategoryGraph,
} satisfies Prisma.StockOperationInclude

const originalGraph = {
  corrections: { select: { id: true } },
  _count: {
    select: {
      purchaseReceipts: true,
      productFulfillments: true,
      productReturns: true,
      finalizedCounts: true,
      dispatchedTransfers: true,
      receivedTransfers: true,
      cancelledTransfers: true,
      finalizedCloseouts: true,
    },
  },
  committedReservation: { select: { id: true } },
  transferAcknowledgment: { select: { id: true } },
  movements: {
    include: { reversals: { select: { id: true } } },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.StockOperationInclude

const balanceGraph = {
  inventoryUnit: { include: { configurationVersion: true } },
} satisfies Prisma.StockBalanceSourceInclude

function invalid(message: string): never {
  throw new CatalogError("INVALID_STOCK_OPERATION", message)
}

function payloadHash(input: ReverseStockTransformationInput) {
  return createHash("sha256")
    .update(stableJson({ kind: "transformation_reversal", ...input }))
    .digest("hex")
}

function serialize(
  operation: Prisma.StockOperationGetPayload<{ include: typeof resultGraph }>,
) {
  return {
    ...serializeStockOperation(operation),
    correctionOfOperationId: operation.correctionOfOperationId,
  }
}

function assertInput(input: ReverseStockTransformationInput) {
  if (input.schemaVersion !== 1)
    throw new CatalogError(
      "INVALID_STOCK_OPERATION",
      "CLIENT_SCHEMA_UNSUPPORTED: stock commands require schema version 1.",
    )
  const reason = input.reason.trim()
  if (!reason || reason.length > 500)
    invalid(
      "A transformation reversal requires a reason of 1 to 500 characters.",
    )
  for (const revision of [
    input.expectedSourceBalanceRevision,
    input.expectedTargetBalanceRevision,
  ])
    if (!Number.isSafeInteger(revision) || revision < 0)
      invalid("Expected balance revisions must be non-negative integers.")
}

/**
 * Undo one packaged-stock transformation at its original quantities and
 * values. One new TRANSFORMATION operation corrects the original; each of its
 * two movements reverses one original movement (target back to source).
 */
export async function reverseStockTransformation(
  db: PrismaClient,
  input: ReverseStockTransformationInput,
) {
  assertInput(input)
  return db.$transaction(
    (tx) => reverseStockTransformationInTransaction(tx, input),
    { maxWait: 10_000, timeout: 30_000 },
  )
}

/**
 * Caller owns the transaction. Lock order matches the forward writer and
 * corrections: Store financial context, idempotency replay, original
 * operation row, then both balances in stable ID order.
 *
 * Refusals (nothing is written):
 * - INVALID_STOCK_OPERATION: original missing in this business, not a
 *   TRANSFORMATION, itself a correction/reversal, not a plain two-movement
 *   packaged pair, owned by another source, or already corrected/reversed.
 * - REVISION_CONFLICT: either balance changed since the person reviewed it.
 * - STALE_CONFIGURATION: either balance's unit, factor, scale or configuration
 *   version no longer matches the original snapshot, so exact canonical
 *   conservation cannot be proven.
 * - INSUFFICIENT_STOCK: the original target lacks the available (unreserved)
 *   quantity to move back.
 * - IDEMPOTENCY_MISMATCH: same clientOperationId with a different payload.
 * - FinanceError CONFLICT (Finance Book only): target value now below the
 *   value originally added; target or source pool now UNKNOWN where the
 *   original was known; the move would strand value on an empty target; the
 *   original valuation pair is partial or inconsistent. CLOSED_PERIOD when the
 *   date is closed.
 */
export async function reverseStockTransformationInTransaction(
  tx: Prisma.TransactionClient,
  input: ReverseStockTransformationInput,
) {
  assertInput(input)
  const hash = payloadHash(input)
  const identity = await tx.stockOperation.findFirst({
    select: { storeId: true },
    where: { id: input.operationId, tenantId: input.tenantId },
  })
  if (!identity) invalid("The transformation to reverse was not found.")
  await lockInventoryFinancialStore(tx, {
    tenantId: input.tenantId,
    storeId: identity.storeId,
  })

  const previous = await tx.stockOperation.findUnique({
    include: resultGraph,
    where: {
      tenantId_clientOperationId: {
        clientOperationId: input.clientOperationId,
        tenantId: input.tenantId,
      },
    },
  })
  if (previous) {
    if (previous.payloadHash !== hash)
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This stock operation identity was already used with different input.",
      )
    return serialize(previous)
  }

  await tx.$queryRaw<Array<{ id: string }>>`
  SELECT "id" FROM "StockOperation"
  WHERE "id" = ${input.operationId}
    AND "tenantId" = ${input.tenantId}
    AND "storeId" = ${identity.storeId}
  FOR UPDATE
`
  const original = await tx.stockOperation.findFirst({
    include: originalGraph,
    where: {
      id: input.operationId,
      storeId: identity.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!original) invalid("The transformation to reverse was not found.")
  if (original.type !== StockOperationType.TRANSFORMATION)
    invalid("Only a packaged stock transformation can be reversed here.")
  if (original.correctionOfOperationId !== null)
    invalid("A transformation reversal cannot itself be reversed.")
  if (original.corrections.length > 0)
    invalid("This transformation has already been reversed or corrected.")
  if (
    original.committedReservation !== null ||
    original.transferAcknowledgment !== null ||
    Object.values(original._count).some((count) => count !== 0)
  )
    invalid("This transformation is owned by another source.")
  const [first, second] = original.movements
  if (
    original.movements.length !== 2 ||
    !first ||
    !second ||
    first.balanceSourceId === second.balanceSourceId ||
    original.movements.some(
      (movement) =>
        movement.reversalOfMovementId !== null || movement.reversals.length,
    )
  )
    invalid("The transformation does not have two plain packaged movements.")
  const sourceMovement = first.signedCanonicalEffect.isNegative()
    ? first
    : second
  const targetMovement = sourceMovement === first ? second : first
  if (
    !sourceMovement.signedCanonicalEffect.isNegative() ||
    !targetMovement.signedCanonicalEffect.isPositive() ||
    compareExactDecimals(
      sourceMovement.signedCanonicalEffect.negated().toFixed(),
      targetMovement.signedCanonicalEffect.toFixed(),
    ) !== 0
  )
    invalid("The transformation movements do not conserve exact quantity.")

  const balanceIds = [
    sourceMovement.balanceSourceId,
    targetMovement.balanceSourceId,
  ].sort()
  await tx.$queryRaw<Array<{ id: string }>>`
  SELECT "id" FROM "StockBalanceSource"
  WHERE "id" IN (${Prisma.join(balanceIds)})
    AND "tenantId" = ${input.tenantId}
    AND "storeId" = ${identity.storeId}
  ORDER BY "id"
  FOR UPDATE
`
  const balances = await tx.stockBalanceSource.findMany({
    include: balanceGraph,
    where: {
      id: { in: balanceIds },
      storeId: identity.storeId,
      tenantId: input.tenantId,
    },
  })
  const sourceBalance = balances.find(
    (row) => row.id === sourceMovement.balanceSourceId,
  )
  const targetBalance = balances.find(
    (row) => row.id === targetMovement.balanceSourceId,
  )
  if (
    !sourceBalance ||
    !targetBalance ||
    sourceBalance.kind !== StockBalanceKind.PACKAGED_STOCK ||
    targetBalance.kind !== StockBalanceKind.PACKAGED_STOCK ||
    sourceBalance.productId !== targetBalance.productId ||
    sourceBalance.variantId !== targetBalance.variantId
  )
    invalid("Transformation balances no longer belong to this Store pair.")
  if (
    sourceBalance.revision !== input.expectedSourceBalanceRevision ||
    targetBalance.revision !== input.expectedTargetBalanceRevision
  )
    throw new CatalogError(
      "REVISION_CONFLICT",
      "A transformation Balance Source changed before confirmation.",
    )
  for (const [balance, movement] of [
    [sourceBalance, sourceMovement],
    [targetBalance, targetMovement],
  ] as const) {
    const unit = balance.inventoryUnit
    if (
      balance.inventoryUnitId !== movement.enteredInventoryUnitId ||
      unit.configurationVersionId !== movement.configurationVersionId ||
      unit.configurationVersion.status !== UnitConfigurationStatus.CURRENT ||
      unit.factor.toFixed() !== movement.unitFactorSnapshot.toFixed() ||
      unit.transactionScale !== movement.transactionScaleSnapshot
    )
      throw new CatalogError(
        "STALE_CONFIGURATION",
        "The product's pack configuration changed after this transformation, so it cannot be reversed exactly.",
      )
  }

  const targetResult = subtractExactDecimals(
    targetBalance.onHandQuantity.toString(),
    targetMovement.enteredQuantity.toString(),
  )
  if (
    compareExactDecimals(
      targetResult,
      targetBalance.reservedQuantity.toString(),
    ) < 0
  )
    throw new CatalogError(
      "INSUFFICIENT_STOCK",
      "The transformation target no longer has the available stock to move back.",
    )
  const sourceResult = addExactDecimals(
    sourceBalance.onHandQuantity.toString(),
    sourceMovement.enteredQuantity.toString(),
  )

  const targetUpdate = await tx.stockBalanceSource.updateMany({
    data: { onHandQuantity: targetResult, revision: { increment: 1 } },
    where: { id: targetBalance.id, revision: targetBalance.revision },
  })
  const sourceUpdate = await tx.stockBalanceSource.updateMany({
    data: { onHandQuantity: sourceResult, revision: { increment: 1 } },
    where: { id: sourceBalance.id, revision: sourceBalance.revision },
  })
  if (targetUpdate.count !== 1 || sourceUpdate.count !== 1)
    throw new CatalogError(
      "REVISION_CONFLICT",
      "A transformation Balance Source changed while posting.",
    )

  const operation = await tx.stockOperation.create({
    data: {
      actorUserId: input.actorUserId,
      clientOperationId: input.clientOperationId,
      correctionOfOperationId: original.id,
      effectiveAt: new Date(),
      payloadHash: hash,
      reason: input.reason.trim(),
      source: input.source,
      storeId: identity.storeId,
      tenantId: input.tenantId,
      type: StockOperationType.TRANSFORMATION,
    },
  })
  const reverse = (
    movement: typeof sourceMovement,
    previous: Prisma.Decimal,
    resulting: string,
  ) => ({
    balanceSourceId: movement.balanceSourceId,
    configurationVersionId: movement.configurationVersionId,
    enteredInventoryUnitId: movement.enteredInventoryUnitId,
    enteredQuantity: movement.enteredQuantity,
    operationId: operation.id,
    previousOnHandQuantity: previous,
    resultingOnHandQuantity: resulting,
    reversalOfMovementId: movement.id,
    signedCanonicalEffect: movement.signedCanonicalEffect.negated(),
    transactionScaleSnapshot: movement.transactionScaleSnapshot,
    unitFactorSnapshot: movement.unitFactorSnapshot,
  })
  await tx.stockMovement.createMany({
    data: [
      reverse(targetMovement, targetBalance.onHandQuantity, targetResult),
      reverse(sourceMovement, sourceBalance.onHandQuantity, sourceResult),
    ],
  })
  await recordPackagedTransformationRestorationValuationInTransaction(tx, {
    tenantId: input.tenantId,
    stockOperationId: operation.id,
  })
  return serialize(
    await tx.stockOperation.findUniqueOrThrow({
      include: resultGraph,
      where: { id: operation.id },
    }),
  )
}
