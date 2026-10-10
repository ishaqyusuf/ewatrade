import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import {
  ordinaryCorrectionSourceInclude,
  readSavedOrdinaryCorrectionSource,
  resolveLoadedOrdinaryCorrectionSource,
} from "./inventory-ordinary-correction-source"
import { calculateOrdinaryCorrectionCost, type CorrectionCost } from "./ordinary-correction-cost"
import { FinanceError, assertFinancePostingDate } from "./rules"
import { normalizeQuantity } from "./valuation-math"
const ZERO = BigInt(0)
const MAX_MINOR = BigInt("9223372036854775807")
function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}
/**
 * Register the inverse/replacement movement pair as one immutable valuation
 * group. The owning correction transaction holds the Book and stock locks.
 */
export async function recordOrdinaryStockCorrectionValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    stockOperationId: string
    expectedStockRevision: number
  },
) {
  const correction = await tx.stockOperation.findFirst({
    where: { id: input.stockOperationId, tenantId: input.tenantId },
    include: ordinaryCorrectionSourceInclude,
  })
  if (!correction)
    throw new FinanceError("NOT_FOUND", "Stock correction not found.")
  if (
    correction.type !== "CORRECTION" ||
    !correction.correctionOf ||
    correction.correctionOfOperationId !== correction.correctionOf.id
  )
    conflict("Stock operation is not a source-owned correction.")

  const store = correction.store
  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: input.tenantId,
        currencyCode: store.currencyCode,
      },
    },
  })
  if (!book) return null
  const source = resolveLoadedOrdinaryCorrectionSource(
    correction,
    input.tenantId,
    book,
  )
  const {
    original,
    balance,
    originalMovement,
    targetEvent,
    factor,
    originalEffectNegative,
    originalCanonical,
    replacementCanonical,
    inverseMovement,
    replacementMovement,
    inverseEffect,
    replacementEffect,
    inverseBeforePhysical,
    inverseAfterPhysical,
    replacementAfterPhysical,
    intermediateCanonical,
    finalCanonical,
    inverseCanonicalBefore,
  } = source
  const existing = readSavedOrdinaryCorrectionSource(source)
  if (existing) return existing
  const inverseCanonicalEffect = inverseEffect
  const inverseAfterCanonical = intermediateCanonical

  if (
    !Number.isSafeInteger(input.expectedStockRevision) ||
    input.expectedStockRevision < 2 ||
    balance.revision !== input.expectedStockRevision ||
    normalizeQuantity(balance.onHandQuantity.toFixed()) !==
      replacementAfterPhysical
  )
    conflict("Stock correction is no longer the current physical revision.")
  if (correction.effectiveAt < original.effectiveAt)
    conflict("A stock correction cannot precede its original operation.")

  assertFinancePostingDate({
    effectiveAt: correction.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  const movementCount = await tx.stockMovement.count({
    where: { balanceSourceId: balance.id },
  })
  if (!Number.isSafeInteger(movementCount) || movementCount < 3)
    conflict("Stock correction movement history cannot be counted.")
  const movementCountExact = BigInt(movementCount)
  const pool = await tx.financeInventoryPool.findUnique({
    where: {
      bookId_balanceSourceId: {
        bookId: book.id,
        balanceSourceId: balance.id,
      },
    },
  })
  if (!pool && targetEvent)
    conflict("A registered original movement has no valuation pool.")
  if (
    pool &&
    (pool.tenantId !== input.tenantId ||
      pool.bookId !== book.id ||
      pool.balanceSourceId !== balance.id ||
      pool.lastSequence < ZERO ||
      pool.lastSequence > MAX_MINOR ||
      !Number.isSafeInteger(pool.lastStockRevision) ||
      pool.lastStockRevision < 0 ||
      pool.lastStockRevision > input.expectedStockRevision ||
      pool.lastMovementCount < ZERO ||
      pool.lastMovementCount > movementCountExact ||
      pool.lastMovementCount + BigInt(2) > movementCountExact ||
      (pool.valueMinor === null) !== (pool.unknownReason !== null) ||
      (pool.valueMinor !== null &&
        (pool.valueMinor < ZERO || pool.valueMinor > MAX_MINOR)) ||
      !Number.isFinite(pool.latestEffectiveAt.getTime()) ||
      (targetEvent !== null &&
        (pool.lastMovementCount < BigInt(1) ||
          targetEvent.poolId !== pool.id ||
          targetEvent.sequence > pool.lastSequence)))
  )
    conflict("Current correction pool scope or state is inconsistent.")
  if (pool && correction.effectiveAt < pool.latestEffectiveAt) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A stock correction cannot precede the latest valuation event.",
    )
  }

  let valueBeforeMinor: bigint | null = pool?.valueMinor ?? null
  let unknownReason: FinanceInventoryUnknownReason | null =
    pool?.unknownReason ?? "UNCAPTURED_MOVEMENTS"
  if (!targetEvent || !pool) {
    valueBeforeMinor = null
    unknownReason = "UNCAPTURED_MOVEMENTS"
  } else if (
    pool.lastMovementCount + BigInt(2) !== movementCountExact ||
    normalizeQuantity(pool.quantity.toFixed()) !== inverseCanonicalBefore
  ) {
    valueBeforeMinor = null
    unknownReason = "UNCAPTURED_MOVEMENTS"
  }
  if (pool && pool.valueMinor === null) {
    valueBeforeMinor = null
    unknownReason = pool.unknownReason ?? "PRIOR_UNKNOWN_COST"
  }

  const { inverseValue, replacementValue } = calculateOrdinaryCorrectionCost({
    originalEffectNegative,
    originalSourceCostMinor: targetEvent?.sourceCostMinor ?? null,
    valueBeforeMinor,
    unknownReason,
    inverseCanonicalBefore,
    originalCanonical,
    replacementEffect,
    inverseAfterCanonical,
    replacementCanonical,
  })

  const firstSequence = (pool?.lastSequence ?? ZERO) + BigInt(1)
  const secondSequence = firstSequence + BigInt(1)
  if (secondSequence > MAX_MINOR)
    conflict("Stock correction valuation sequence exceeds its limit.")
  const poolData = {
    quantity: finalCanonical,
    valueMinor: replacementValue.valueAfterMinor,
    unknownReason:
      replacementValue.valueAfterMinor === null
        ? (replacementValue.unknownReason ?? "PRIOR_UNKNOWN_COST")
        : null,
    lastStockRevision: input.expectedStockRevision,
    lastMovementCount: movementCountExact,
    lastSequence: secondSequence,
    latestEffectiveAt: correction.effectiveAt,
  }
  const nextPool = pool
    ? await tx.financeInventoryPool.update({
        where: { id: pool.id },
        data: poolData,
      })
    : await tx.financeInventoryPool.create({
        data: {
          tenantId: input.tenantId,
          bookId: book.id,
          balanceSourceId: balance.id,
          ...poolData,
        },
      })
  const createEvent = (
    movement: typeof inverseMovement,
    sequence: bigint,
    effect: string,
    before: string,
    after: string,
    cost: CorrectionCost,
  ) =>
    tx.financeInventoryValuationEvent.create({
      data: {
        tenantId: input.tenantId,
        bookId: book.id,
        poolId: nextPool.id,
        balanceSourceId: balance.id,
        sequence,
        kind: "ADJUSTMENT",
        sourceKind: "ORDINARY_STOCK_CORRECTION",
        sourceId: correction.id,
        stockOperationId: correction.id,
        stockMovementId: movement.id,
        canonicalEffect: effect,
        quantityBefore: before,
        quantityAfter: after,
        ...cost,
        effectiveAt: correction.effectiveAt,
        actorUserId: correction.actorUserId,
      },
    })
  const createdInverse = await createEvent(
    inverseMovement,
    firstSequence,
    inverseEffect,
    inverseCanonicalBefore,
    inverseAfterCanonical,
    inverseValue,
  )
  const createdReplacement = await createEvent(
    replacementMovement,
    secondSequence,
    replacementEffect,
    inverseAfterCanonical,
    finalCanonical,
    replacementValue,
  )
  return { inverseEvent: createdInverse, replacementEvent: createdReplacement }
}
