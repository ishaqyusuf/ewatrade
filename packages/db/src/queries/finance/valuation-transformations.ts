import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import {
  readSavedPackagedTransformationSource,
  resolveLoadedPackagedTransformationSource,
  transformationCanonicalQuantity,
  transformationSourceInclude,
} from "./inventory-transformation-source"
import { FinanceError, assertFinancePostingDate } from "./rules"
import {
  calculateWeightedAverageIssue,
  normalizeQuantity,
} from "./valuation-math"

const MAX_DATABASE_MINOR = BigInt("9223372036854775807")
const ZERO = BigInt(0)

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

/**
 * Private paired transformation adapter. Its caller holds the existing Book
 * lock and both source balances in stable ID order before writing the pair.
 */
export async function recordPackagedTransformationValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; stockOperationId: string },
) {
  const operation = await tx.stockOperation.findFirst({
    where: { id: input.stockOperationId, tenantId: input.tenantId },
    include: transformationSourceInclude,
  })
  if (!operation) {
    throw new FinanceError("NOT_FOUND", "Stock transformation not found.")
  }
  const store = operation.store
  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: input.tenantId,
        currencyCode: store.currencyCode,
      },
    },
  })
  // The transformation remains valid in workspaces that have no Finance Book.
  if (!book) return null
  const source = resolveLoadedPackagedTransformationSource(
    operation,
    input.tenantId,
    book,
  )
  const {
    sourceMovement,
    targetMovement,
    sourceBalance,
    targetBalance,
    sourceEffect,
    targetEffect,
    sourceBefore,
    sourceAfter,
    sourceCanonical,
    targetBefore,
    targetAfter,
    targetCanonical,
  } = source
  const existing = readSavedPackagedTransformationSource(source)
  if (existing) return existing
  const effectiveAt = operation.effectiveAt

  if (
    !Number.isSafeInteger(sourceBalance.revision) ||
    sourceBalance.revision < 1 ||
    !Number.isSafeInteger(targetBalance.revision) ||
    targetBalance.revision < 1 ||
    transformationCanonicalQuantity(
      sourceBalance.onHandQuantity,
      sourceMovement.unitFactorSnapshot,
    ) !== sourceAfter ||
    transformationCanonicalQuantity(
      targetBalance.onHandQuantity,
      targetMovement.unitFactorSnapshot,
    ) !== targetAfter
  ) {
    conflict("Transformation is no longer the current stock revision.")
  }

  assertFinancePostingDate({
    effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })

  const sourceMovementCount = await tx.stockMovement.count({
    where: { balanceSourceId: sourceBalance.id },
  })
  const targetMovementCount = await tx.stockMovement.count({
    where: { balanceSourceId: targetBalance.id },
  })
  if (
    !Number.isSafeInteger(sourceMovementCount) ||
    sourceMovementCount < 1 ||
    !Number.isSafeInteger(targetMovementCount) ||
    targetMovementCount < 1
  ) {
    conflict("Transformation movement history cannot be counted.")
  }

  const sourcePool = await tx.financeInventoryPool.findUnique({
    where: {
      bookId_balanceSourceId: {
        bookId: book.id,
        balanceSourceId: sourceBalance.id,
      },
    },
  })
  const targetPool = await tx.financeInventoryPool.findUnique({
    where: {
      bookId_balanceSourceId: {
        bookId: book.id,
        balanceSourceId: targetBalance.id,
      },
    },
  })
  for (const pool of [sourcePool, targetPool]) {
    if (pool && effectiveAt < pool.latestEffectiveAt) {
      throw new FinanceError(
        "INVALID_JOURNAL",
        "A packaged transformation cannot precede the latest endpoint valuation event.",
      )
    }
    if (pool && (pool.valueMinor === null) !== (pool.unknownReason !== null)) {
      conflict("Transformation valuation pool null cost and reason disagree.")
    }
    if (
      pool &&
      pool.valueMinor !== null &&
      (pool.valueMinor < ZERO || pool.valueMinor > MAX_DATABASE_MINOR)
    ) {
      conflict("Transformation valuation pool value exceeds its limit.")
    }
  }

  const sourceCountExact = BigInt(sourceMovementCount)
  const targetCountExact = BigInt(targetMovementCount)
  let sourceValueBefore: bigint | null = null
  let sourceUnknown: FinanceInventoryUnknownReason | null = null
  if (!sourcePool) {
    if (sourceBefore === "0" && sourceCountExact === BigInt(1)) {
      sourceValueBefore = ZERO
    } else {
      sourceUnknown =
        sourceBefore === "0" ? "UNCAPTURED_MOVEMENTS" : "MISSING_OPENING_COST"
    }
  } else if (
    normalizeQuantity(sourcePool.quantity.toFixed()) !== sourceBefore ||
    sourcePool.lastMovementCount + BigInt(1) !== sourceCountExact
  ) {
    sourceUnknown = "UNCAPTURED_MOVEMENTS"
  } else if (sourcePool.valueMinor === null) {
    sourceUnknown = sourcePool.unknownReason ?? "PRIOR_UNKNOWN_COST"
  } else {
    sourceValueBefore = sourcePool.valueMinor
  }

  let targetValueBefore: bigint | null = null
  let targetUnknown: FinanceInventoryUnknownReason | null = null
  if (!targetPool) {
    if (targetBefore === "0" && targetCountExact === BigInt(1)) {
      targetValueBefore = ZERO
    } else {
      targetUnknown =
        targetBefore === "0" ? "UNCAPTURED_MOVEMENTS" : "MISSING_OPENING_COST"
    }
  } else if (
    normalizeQuantity(targetPool.quantity.toFixed()) !== targetBefore ||
    targetPool.lastMovementCount + BigInt(1) !== targetCountExact
  ) {
    targetUnknown = "UNCAPTURED_MOVEMENTS"
  } else if (targetPool.valueMinor === null) {
    targetUnknown = targetPool.unknownReason ?? "PRIOR_UNKNOWN_COST"
  } else {
    targetValueBefore = targetPool.valueMinor
  }

  let sourceCostMinor: bigint | null = null
  let sourceValueAfter: bigint | null = null
  if (sourceValueBefore !== null) {
    const issue = calculateWeightedAverageIssue({
      quantityBefore: sourceBefore,
      valueBeforeMinor: sourceValueBefore,
      quantityIssued: sourceCanonical,
    })
    sourceCostMinor = issue.valueIssuedMinor
    sourceValueAfter = issue.valueAfterMinor
  } else {
    sourceUnknown ??= "PRIOR_UNKNOWN_COST"
  }

  let targetValueAfter: bigint | null = null
  if (targetValueBefore !== null && sourceCostMinor !== null) {
    targetValueAfter = targetValueBefore + sourceCostMinor
    if (targetValueAfter > MAX_DATABASE_MINOR) {
      throw new FinanceError(
        "INVALID_AMOUNT",
        "Transformation target carrying value exceeds its limit.",
      )
    }
  } else {
    targetUnknown ??= sourceUnknown ?? "PRIOR_UNKNOWN_COST"
  }

  const sourceSequence = (sourcePool?.lastSequence ?? ZERO) + BigInt(1)
  const targetSequence = (targetPool?.lastSequence ?? ZERO) + BigInt(1)
  if (
    sourceSequence > MAX_DATABASE_MINOR ||
    targetSequence > MAX_DATABASE_MINOR
  ) {
    conflict("Transformation valuation sequence exceeds its limit.")
  }
  const sourceNextPool = {
    quantity: sourceAfter,
    valueMinor: sourceValueAfter,
    unknownReason: sourceValueAfter === null ? sourceUnknown : null,
    lastStockRevision: sourceBalance.revision,
    lastMovementCount: sourceCountExact,
    lastSequence: sourceSequence,
    latestEffectiveAt: effectiveAt,
  }
  const targetNextPool = {
    quantity: targetAfter,
    valueMinor: targetValueAfter,
    unknownReason: targetValueAfter === null ? targetUnknown : null,
    lastStockRevision: targetBalance.revision,
    lastMovementCount: targetCountExact,
    lastSequence: targetSequence,
    latestEffectiveAt: effectiveAt,
  }
  const sourceCurrentPool = sourcePool
    ? await tx.financeInventoryPool.update({
        where: { id: sourcePool.id },
        data: sourceNextPool,
      })
    : await tx.financeInventoryPool.create({
        data: {
          ...sourceNextPool,
          tenantId: input.tenantId,
          bookId: book.id,
          balanceSourceId: sourceBalance.id,
        },
      })
  const targetCurrentPool = targetPool
    ? await tx.financeInventoryPool.update({
        where: { id: targetPool.id },
        data: targetNextPool,
      })
    : await tx.financeInventoryPool.create({
        data: {
          ...targetNextPool,
          tenantId: input.tenantId,
          bookId: book.id,
          balanceSourceId: targetBalance.id,
        },
      })

  const sourceEvent = await tx.financeInventoryValuationEvent.create({
    data: {
      tenantId: input.tenantId,
      bookId: book.id,
      poolId: sourceCurrentPool.id,
      balanceSourceId: sourceBalance.id,
      sequence: sourceSequence,
      kind: "TRANSFER_OUT",
      sourceKind: "PACKAGED_TRANSFORMATION",
      sourceId: operation.id,
      stockOperationId: operation.id,
      stockMovementId: sourceMovement.id,
      canonicalEffect: sourceEffect,
      quantityBefore: sourceBefore,
      quantityAfter: sourceAfter,
      valueBeforeMinor: sourceValueBefore,
      valueDeltaMinor: sourceCostMinor === null ? null : -sourceCostMinor,
      valueAfterMinor: sourceValueAfter,
      sourceCostMinor,
      unknownReason: sourceValueAfter === null ? sourceUnknown : null,
      effectiveAt,
      actorUserId: operation.actorUserId,
    },
  })
  const targetEvent = await tx.financeInventoryValuationEvent.create({
    data: {
      tenantId: input.tenantId,
      bookId: book.id,
      poolId: targetCurrentPool.id,
      balanceSourceId: targetBalance.id,
      sequence: targetSequence,
      kind: "TRANSFER_IN",
      sourceKind: "PACKAGED_TRANSFORMATION",
      sourceId: operation.id,
      stockOperationId: operation.id,
      stockMovementId: targetMovement.id,
      canonicalEffect: targetEffect,
      quantityBefore: targetBefore,
      quantityAfter: targetAfter,
      valueBeforeMinor: targetValueBefore,
      valueDeltaMinor:
        targetValueBefore === null || sourceCostMinor === null
          ? null
          : sourceCostMinor,
      valueAfterMinor: targetValueAfter,
      sourceCostMinor,
      unknownReason: targetValueAfter === null ? targetUnknown : null,
      effectiveAt,
      actorUserId: operation.actorUserId,
    },
  })
  return { sourceEvent, targetEvent }
}
