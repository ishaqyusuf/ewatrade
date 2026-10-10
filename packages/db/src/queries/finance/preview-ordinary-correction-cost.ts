import type { Prisma } from "../../../generated/prisma/client"
import { calculateOrdinaryCorrectionCost } from "./ordinary-correction-cost"
import { FinanceError, assertFinancePostingDate } from "./rules"
import { normalizeQuantity } from "./valuation-math"

/** Read-only projection. Confirmation must hold finance/stock locks and reread it. */
export async function previewOrdinaryCorrectionCost(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    storeId: string
    currencyCode: string
    operationId: string
    movementId: string
    balanceSourceId: string
    stockRevision: number
    originalEffectNegative: boolean
    inverseCanonicalBefore: string
    originalCanonical: string
    replacementEffect: string
    inverseAfterCanonical: string
    replacementCanonical: string
  },
) {
  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: input.tenantId,
        currencyCode: input.currencyCode,
      },
    },
  })
  if (!book)
    return {
      status: "NO_FINANCE_BOOK" as const,
      currencyCode: input.currencyCode,
      valueBeforeMinor: null,
      valueAfterMinor: null,
      valueDeltaMinor: null,
      unknownReason: null,
    }
  assertFinancePostingDate({
    effectiveAt: new Date(),
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  const pool = await tx.financeInventoryPool.findUnique({
    where: {
      bookId_balanceSourceId: {
        bookId: book.id,
        balanceSourceId: input.balanceSourceId,
      },
    },
  })
  const event = await tx.financeInventoryValuationEvent.findFirst({
    where: {
      tenantId: input.tenantId,
      bookId: book.id,
      stockMovementId: input.movementId,
      stockOperationId: input.operationId,
      sourceKind: "ORDINARY_STOCK_OPERATION",
      sourceId: input.operationId,
    },
  })
  const count = await tx.stockMovement.count({
    where: { balanceSourceId: input.balanceSourceId },
  })
  const maxMinor = 9223372036854775807n
  if (!Number.isSafeInteger(count) || count < 1)
    throw new FinanceError(
      "CONFLICT",
      "Correction movement history cannot be counted.",
    )
  if (
    pool &&
    (pool.tenantId !== input.tenantId ||
      pool.bookId !== book.id ||
      pool.balanceSourceId !== input.balanceSourceId ||
      pool.lastSequence < 0n ||
      pool.lastSequence > maxMinor - 2n ||
      !Number.isSafeInteger(pool.lastStockRevision) ||
      pool.lastStockRevision < 0 ||
      pool.lastStockRevision > input.stockRevision ||
      pool.lastMovementCount < 0n ||
      pool.lastMovementCount > BigInt(count) ||
      (pool.valueMinor === null) !== (pool.unknownReason !== null) ||
      (pool.valueMinor !== null &&
        (pool.valueMinor < 0n || pool.valueMinor > maxMinor)) ||
      !Number.isFinite(pool.latestEffectiveAt.getTime()) ||
      (event !== null &&
        (pool.lastMovementCount < 1n ||
          event.poolId !== pool.id ||
          event.sequence > pool.lastSequence)))
  )
    throw new FinanceError(
      "CONFLICT",
      "Correction valuation pool scope or state is inconsistent.",
    )
  if (pool && pool.latestEffectiveAt > new Date())
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A stock correction cannot precede the latest valuation event.",
    )
  if (event && !pool)
    throw new FinanceError(
      "CONFLICT",
      "Original correction cost has no matching valuation pool.",
    )
  const complete = Boolean(
    pool &&
      event &&
      pool.lastMovementCount === BigInt(count) &&
      pool.lastStockRevision === input.stockRevision &&
      normalizeQuantity(pool.quantity.toFixed()) ===
        input.inverseCanonicalBefore,
  )
  const before = complete ? pool!.valueMinor : null
  const unknownReason =
    pool && pool.valueMinor === null
      ? (pool.unknownReason ?? "PRIOR_UNKNOWN_COST")
      : complete
        ? pool!.unknownReason
        : "UNCAPTURED_MOVEMENTS"
  const result = calculateOrdinaryCorrectionCost({
    ...input,
    valueBeforeMinor: before,
    unknownReason,
    originalSourceCostMinor: event?.sourceCostMinor ?? null,
  })
  const after = result.replacementValue.valueAfterMinor
  return {
    status: "PROJECTED" as const,
    currencyCode: input.currencyCode,
    poolRevision: pool?.lastStockRevision ?? null,
    poolSequence: pool?.lastSequence.toString() ?? null,
    valueBeforeMinor: before?.toString() ?? null,
    valueAfterMinor: after?.toString() ?? null,
    valueDeltaMinor:
      before !== null && after !== null ? (after - before).toString() : null,
    unknownReason: result.replacementValue.unknownReason,
  }
}
