import type {
  FinanceInventoryPool,
  Prisma,
} from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import {
  readSavedPackagedTransformationSource,
  resolveLoadedPackagedTransformationSource,
  transformationCanonicalQuantity,
  transformationSourceInclude,
} from "./inventory-transformation-source"
import { FinanceError, assertFinancePostingDate } from "./rules"
import { normalizeQuantity } from "./valuation-math"

const MAX_DATABASE_MINOR = BigInt("9223372036854775807")
const ZERO = BigInt(0)

/** Valuation source kind for a source-owned packaged transformation restoration. */
export const PACKAGED_TRANSFORMATION_RESTORATION_SOURCE =
  "PACKAGED_TRANSFORMATION_RESTORATION"

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

type PoolRow = FinanceInventoryPool

/** Current pool value exactly as the forward writer would read it, or UNKNOWN. */
function currentPoolValue(
  pool: PoolRow | null,
  before: string,
  movementCount: bigint,
): { value: bigint | null; reason: FinanceInventoryUnknownReason | null } {
  if (!pool) {
    if (before === "0" && movementCount === BigInt(1))
      return { value: ZERO, reason: null }
    return {
      value: null,
      reason: before === "0" ? "UNCAPTURED_MOVEMENTS" : "MISSING_OPENING_COST",
    }
  }
  if (
    normalizeQuantity(pool.quantity.toFixed()) !== before ||
    pool.lastMovementCount + BigInt(1) !== movementCount
  )
    return { value: null, reason: "UNCAPTURED_MOVEMENTS" }
  if (pool.valueMinor === null)
    return { value: null, reason: pool.unknownReason ?? "PRIOR_UNKNOWN_COST" }
  return { value: pool.valueMinor, reason: null }
}

/**
 * Pure restoration decision. `movedValueMinor` is the exact value the original
 * pair moved (its saved sourceCostMinor), or null when that value was UNKNOWN
 * or the original was never registered. Known values move back exactly; UNKNOWN
 * stays UNKNOWN. Every situation that would need an invented value refuses.
 */
export function decidePackagedTransformationRestoration(input: {
  movedValueMinor: bigint | null
  originalTargetKnown: boolean
  originalSourceKnown: boolean
  target: { value: bigint | null; reason: FinanceInventoryUnknownReason | null }
  source: { value: bigint | null; reason: FinanceInventoryUnknownReason | null }
  targetQuantityAfter: string
  unregisteredReason?: FinanceInventoryUnknownReason
}) {
  const moved = input.movedValueMinor
  const fallback = input.unregisteredReason ?? "PRIOR_UNKNOWN_COST"
  if (moved === null) {
    return {
      target: {
        valueBeforeMinor: input.target.value,
        valueDeltaMinor: null,
        valueAfterMinor: null,
        unknownReason:
          input.unregisteredReason ?? input.target.reason ?? fallback,
      },
      source: {
        valueBeforeMinor: input.source.value,
        valueDeltaMinor: null,
        valueAfterMinor: null,
        unknownReason:
          input.unregisteredReason ?? input.source.reason ?? fallback,
      },
      sourceCostMinor: null,
    }
  }
  if (moved < ZERO || moved > MAX_DATABASE_MINOR)
    conflict("Original transformation value is outside its limit.")

  let target: {
    valueBeforeMinor: bigint | null
    valueDeltaMinor: bigint | null
    valueAfterMinor: bigint | null
    unknownReason: FinanceInventoryUnknownReason | null
  }
  if (input.target.value === null) {
    if (input.originalTargetKnown)
      conflict(
        "The target stock value is now UNKNOWN, but the original transformation added a known value. Resolve the target cost before moving stock back.",
      )
    target = {
      valueBeforeMinor: null,
      valueDeltaMinor: null,
      valueAfterMinor: null,
      unknownReason: input.target.reason ?? fallback,
    }
  } else {
    if (input.target.value < moved)
      conflict(
        "The target stock value is now less than the value the original transformation added. Moving stock back would invent value.",
      )
    const after = input.target.value - moved
    if (input.targetQuantityAfter === "0" && after !== ZERO)
      conflict(
        "Moving stock back would leave value on an empty target balance. Review the target cost first.",
      )
    target = {
      valueBeforeMinor: input.target.value,
      valueDeltaMinor: -moved,
      valueAfterMinor: after,
      unknownReason: null,
    }
  }

  if (input.source.value === null) {
    if (input.originalSourceKnown)
      conflict(
        "The source stock value is now UNKNOWN, but the original transformation removed a known value. Resolve the source cost before moving stock back.",
      )
    return {
      target,
      source: {
        valueBeforeMinor: null,
        valueDeltaMinor: null,
        valueAfterMinor: null,
        unknownReason: input.source.reason ?? fallback,
      },
      sourceCostMinor: moved,
    }
  }
  const sourceAfter = input.source.value + moved
  if (sourceAfter > MAX_DATABASE_MINOR)
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Restored source carrying value exceeds its limit.",
    )
  return {
    target,
    source: {
      valueBeforeMinor: input.source.value,
      valueDeltaMinor: moved,
      valueAfterMinor: sourceAfter,
      unknownReason: null,
    },
    sourceCostMinor: moved,
  }
}

const restorationInclude = {
  store: { select: { id: true, tenantId: true, currencyCode: true } },
  movements: {
    include: {
      balanceSource: { include: { inventoryUnit: true } },
      valuationEvent: true,
    },
  },
} satisfies Prisma.StockOperationInclude

/**
 * Register a packaged transformation restoration. The caller holds the Store
 * financial lock, the original operation row and both balances (stable ID
 * order) and has already written the reversal movements. No journal is posted:
 * packaged transformations move value between pools of one Inventory account.
 */
export async function recordPackagedTransformationRestorationValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; stockOperationId: string },
) {
  const reversal = await tx.stockOperation.findFirst({
    where: { id: input.stockOperationId, tenantId: input.tenantId },
    include: restorationInclude,
  })
  if (!reversal)
    throw new FinanceError("NOT_FOUND", "Transformation restoration not found.")
  if (
    reversal.type !== "TRANSFORMATION" ||
    !reversal.correctionOfOperationId ||
    reversal.movements.length !== 2
  )
    conflict("Stock operation is not a packaged transformation restoration.")
  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: input.tenantId,
        currencyCode: reversal.store.currencyCode,
      },
    },
  })
  // Restorations stay physically valid in workspaces without a Finance Book.
  if (!book) return null
  const bookId = book.id

  const original = await tx.stockOperation.findFirst({
    where: {
      id: reversal.correctionOfOperationId,
      tenantId: input.tenantId,
      storeId: reversal.storeId,
    },
    include: transformationSourceInclude,
  })
  if (!original) conflict("Original packaged transformation is missing.")
  const source = resolveLoadedPackagedTransformationSource(
    original,
    input.tenantId,
    book,
  )
  const saved = readSavedPackagedTransformationSource(source)

  const outMovement = reversal.movements.find(
    (row) => row.reversalOfMovementId === source.targetMovement.id,
  )
  const inMovement = reversal.movements.find(
    (row) => row.reversalOfMovementId === source.sourceMovement.id,
  )
  if (
    !outMovement ||
    !inMovement ||
    outMovement.balanceSourceId !== source.targetBalance.id ||
    inMovement.balanceSourceId !== source.sourceBalance.id ||
    !outMovement.signedCanonicalEffect.isNegative() ||
    normalizeQuantity(outMovement.signedCanonicalEffect.negated().toFixed()) !==
      source.sourceCanonical ||
    normalizeQuantity(inMovement.signedCanonicalEffect.toFixed()) !==
      source.sourceCanonical
  )
    conflict("Restoration movements do not exactly reverse the original pair.")
  if (outMovement.valuationEvent || inMovement.valuationEvent) {
    if (!outMovement.valuationEvent || !inMovement.valuationEvent)
      conflict("Restoration valuation is only partially registered.")
    return {
      targetEvent: outMovement.valuationEvent,
      sourceEvent: inMovement.valuationEvent,
    }
  }

  const effectiveAt = reversal.effectiveAt
  if (effectiveAt < original.effectiveAt)
    conflict("A restoration cannot precede its original transformation.")
  assertFinancePostingDate({
    effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })

  const factorOf = (movement: typeof outMovement) => movement.unitFactorSnapshot
  const targetBefore = transformationCanonicalQuantity(
    outMovement.previousOnHandQuantity,
    factorOf(outMovement),
  )
  const targetAfter = transformationCanonicalQuantity(
    outMovement.resultingOnHandQuantity,
    factorOf(outMovement),
  )
  const sourceBefore = transformationCanonicalQuantity(
    inMovement.previousOnHandQuantity,
    factorOf(inMovement),
  )
  const sourceAfter = transformationCanonicalQuantity(
    inMovement.resultingOnHandQuantity,
    factorOf(inMovement),
  )
  const targetBalance = outMovement.balanceSource
  const sourceBalance = inMovement.balanceSource
  if (
    transformationCanonicalQuantity(
      targetBalance.onHandQuantity,
      factorOf(outMovement),
    ) !== targetAfter ||
    transformationCanonicalQuantity(
      sourceBalance.onHandQuantity,
      factorOf(inMovement),
    ) !== sourceAfter
  )
    conflict("Restoration is no longer the current stock revision.")

  const [targetCount, sourceCount] = await Promise.all([
    tx.stockMovement.count({ where: { balanceSourceId: targetBalance.id } }),
    tx.stockMovement.count({ where: { balanceSourceId: sourceBalance.id } }),
  ])
  const [targetPool, sourcePool] = await Promise.all(
    [targetBalance.id, sourceBalance.id].map((balanceSourceId) =>
      tx.financeInventoryPool.findUnique({
        where: { bookId_balanceSourceId: { bookId: book.id, balanceSourceId } },
      }),
    ),
  )
  for (const pool of [targetPool, sourcePool]) {
    if (!pool) continue
    if (effectiveAt < pool.latestEffectiveAt)
      throw new FinanceError(
        "INVALID_JOURNAL",
        "A transformation restoration cannot precede the latest endpoint valuation event.",
      )
    if (
      (pool.valueMinor === null) !== (pool.unknownReason !== null) ||
      (pool.valueMinor !== null &&
        (pool.valueMinor < ZERO || pool.valueMinor > MAX_DATABASE_MINOR))
    )
      conflict("Restoration valuation pool state is inconsistent.")
  }
  if (saved && (!targetPool || !sourcePool))
    conflict("A registered original transformation has no valuation pool.")

  const targetValue = currentPoolValue(
    targetPool ?? null,
    targetBefore,
    BigInt(targetCount),
  )
  const sourceValue = currentPoolValue(
    sourcePool ?? null,
    sourceBefore,
    BigInt(sourceCount),
  )
  const decision = decidePackagedTransformationRestoration({
    movedValueMinor: saved?.sourceEvent.sourceCostMinor ?? null,
    originalTargetKnown: saved?.targetEvent.valueAfterMinor != null,
    originalSourceKnown: saved?.sourceEvent.valueAfterMinor != null,
    target: targetValue,
    source: sourceValue,
    targetQuantityAfter: targetAfter,
    unregisteredReason: saved ? undefined : "UNCAPTURED_MOVEMENTS",
  })

  const targetSequence = (targetPool?.lastSequence ?? ZERO) + BigInt(1)
  const sourceSequence = (sourcePool?.lastSequence ?? ZERO) + BigInt(1)
  if (
    targetSequence > MAX_DATABASE_MINOR ||
    sourceSequence > MAX_DATABASE_MINOR
  )
    conflict("Restoration valuation sequence exceeds its limit.")

  async function writePool(
    pool: PoolRow | null | undefined,
    balance: typeof targetBalance,
    data: {
      quantity: string
      valueMinor: bigint | null
      unknownReason: FinanceInventoryUnknownReason | null
      lastMovementCount: bigint
      lastSequence: bigint
    },
  ) {
    const next = {
      ...data,
      lastStockRevision: balance.revision,
      latestEffectiveAt: effectiveAt,
    }
    return pool
      ? tx.financeInventoryPool.update({ where: { id: pool.id }, data: next })
      : tx.financeInventoryPool.create({
          data: {
            ...next,
            tenantId: input.tenantId,
            bookId,
            balanceSourceId: balance.id,
          },
        })
  }
  const nextTargetPool = await writePool(targetPool, targetBalance, {
    quantity: targetAfter,
    valueMinor: decision.target.valueAfterMinor,
    unknownReason: decision.target.unknownReason,
    lastMovementCount: BigInt(targetCount),
    lastSequence: targetSequence,
  })
  const nextSourcePool = await writePool(sourcePool, sourceBalance, {
    quantity: sourceAfter,
    valueMinor: decision.source.valueAfterMinor,
    unknownReason: decision.source.unknownReason,
    lastMovementCount: BigInt(sourceCount),
    lastSequence: sourceSequence,
  })

  const common = {
    tenantId: input.tenantId,
    bookId: book.id,
    sourceKind: PACKAGED_TRANSFORMATION_RESTORATION_SOURCE,
    sourceId: reversal.id,
    stockOperationId: reversal.id,
    sourceCostMinor: decision.sourceCostMinor,
    effectiveAt,
    actorUserId: reversal.actorUserId,
  }
  const targetEvent = await tx.financeInventoryValuationEvent.create({
    data: {
      ...common,
      poolId: nextTargetPool.id,
      balanceSourceId: targetBalance.id,
      sequence: targetSequence,
      kind: "TRANSFER_OUT",
      stockMovementId: outMovement.id,
      canonicalEffect: outMovement.signedCanonicalEffect,
      quantityBefore: targetBefore,
      quantityAfter: targetAfter,
      ...decision.target,
    },
  })
  const sourceEvent = await tx.financeInventoryValuationEvent.create({
    data: {
      ...common,
      poolId: nextSourcePool.id,
      balanceSourceId: sourceBalance.id,
      sequence: sourceSequence,
      kind: "TRANSFER_IN",
      stockMovementId: inMovement.id,
      canonicalEffect: inMovement.signedCanonicalEffect,
      quantityBefore: sourceBefore,
      quantityAfter: sourceAfter,
      ...decision.source,
    },
  })
  return { targetEvent, sourceEvent }
}
