import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import {
  assertSavedReservationCommitSource,
  reservationCanonicalQuantity as canonical,
  reservationCommitSourceInclude,
  resolveLoadedReservationCommitSource,
} from "./inventory-reservation-source"
import { FinanceError, assertFinancePostingDate } from "./rules"
import {
  calculateWeightedAverageIssue,
  normalizeQuantity as normalizeExactQuantity,
} from "./valuation-math"

const ZERO = BigInt(0)
const MAX_MINOR = BigInt("9223372036854775807")
function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}
function normalizeQuantity(value: string) {
  try {
    return normalizeExactQuantity(value)
  } catch {
    conflict("Reservation quantity is outside the exact supported bounds.")
  }
}

/** Private source-owned withdrawal costing; the caller holds Book/reservation/balance locks. */
export async function recordReservationCommitValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    stockOperationId: string
    expectedStockRevision: number
    expectedBookId?: string
  },
) {
  const operation = await tx.stockOperation.findFirst({
    where: { tenantId: input.tenantId, id: input.stockOperationId },
    include: reservationCommitSourceInclude,
  })
  if (!operation)
    throw new FinanceError(
      "NOT_FOUND",
      "Reservation commitment operation not found.",
    )
  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: input.tenantId,
        currencyCode: operation.store.currencyCode,
      },
    },
  })
  if (!book) {
    if (input.expectedBookId)
      conflict("The locked reservation Book disappeared.")
    return null
  }
  if (input.expectedBookId !== undefined && book.id !== input.expectedBookId)
    conflict("Reservation commitment is not an owned standalone withdrawal.")
  const source = resolveLoadedReservationCommitSource(
    operation,
    input.tenantId,
    book,
  )
  const {
    reservation,
    movement,
    balance,
    corrections,
    quantity,
    before,
    after,
  } = source
  if (movement.valuationEvent) return assertSavedReservationCommitSource(source)
  if (
    reservation.status !== "COMMITTED" ||
    corrections !== 0 ||
    !Number.isSafeInteger(input.expectedStockRevision) ||
    input.expectedStockRevision < 1 ||
    balance.revision !== input.expectedStockRevision ||
    canonical(balance.onHandQuantity, balance) !== after
  )
    conflict(
      "Reservation costing requires the current fresh physical commitment.",
    )
  assertFinancePostingDate({
    effectiveAt: operation.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  const movementCount = await tx.stockMovement.count({
    where: { balanceSourceId: balance.id },
  })
  if (!Number.isSafeInteger(movementCount) || movementCount < 1)
    conflict("Reservation movement history cannot be counted.")
  const count = BigInt(movementCount)
  const pool = await tx.financeInventoryPool.findUnique({
    where: {
      bookId_balanceSourceId: { bookId: book.id, balanceSourceId: balance.id },
    },
  })
  if (
    pool &&
    (pool.tenantId !== input.tenantId ||
      pool.bookId !== book.id ||
      pool.balanceSourceId !== balance.id ||
      (pool.valueMinor === null) !== (pool.unknownReason !== null) ||
      (pool.valueMinor !== null &&
        (pool.valueMinor < ZERO ||
          pool.valueMinor > MAX_MINOR ||
          (normalizeQuantity(pool.quantity.toFixed()) === "0" &&
            pool.valueMinor !== ZERO))) ||
      !Number.isSafeInteger(pool.lastStockRevision) ||
      pool.lastStockRevision < 0 ||
      pool.lastStockRevision > balance.revision - 1 ||
      pool.lastMovementCount < ZERO ||
      pool.lastMovementCount > MAX_MINOR ||
      pool.lastSequence < ZERO ||
      pool.lastSequence >= MAX_MINOR ||
      !Number.isFinite(pool.latestEffectiveAt.getTime()))
  )
    conflict("Reservation valuation pool state is invalid.")
  if (pool && operation.effectiveAt < pool.latestEffectiveAt)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Reservation commitment cannot precede the latest carrying value.",
    )

  let valueBeforeMinor: bigint | null = null
  let unknownReason: FinanceInventoryUnknownReason | null = null
  if (!pool) unknownReason = "MISSING_OPENING_COST"
  else if (
    normalizeQuantity(pool.quantity.toFixed()) !== before ||
    pool.lastMovementCount + BigInt(1) !== count
  )
    unknownReason = "UNCAPTURED_MOVEMENTS"
  else if (pool.valueMinor === null)
    unknownReason = pool.unknownReason ?? "PRIOR_UNKNOWN_COST"
  else valueBeforeMinor = pool.valueMinor
  const issue =
    valueBeforeMinor === null
      ? null
      : calculateWeightedAverageIssue({
          quantityBefore: before,
          valueBeforeMinor,
          quantityIssued: quantity,
        })
  const sequence = (pool?.lastSequence ?? ZERO) + BigInt(1)
  const data = {
    quantity: after,
    valueMinor: issue?.valueAfterMinor ?? null,
    unknownReason,
    lastStockRevision: balance.revision,
    lastMovementCount: count,
    lastSequence: sequence,
    latestEffectiveAt: operation.effectiveAt,
  }
  const nextPool = pool
    ? await tx.financeInventoryPool.update({ where: { id: pool.id }, data })
    : await tx.financeInventoryPool.create({
        data: {
          tenantId: input.tenantId,
          bookId: book.id,
          balanceSourceId: balance.id,
          ...data,
        },
      })
  return tx.financeInventoryValuationEvent.create({
    data: {
      tenantId: input.tenantId,
      bookId: book.id,
      poolId: nextPool.id,
      balanceSourceId: balance.id,
      sequence,
      kind: "ISSUE",
      sourceKind: "STOCK_RESERVATION_COMMIT",
      sourceId: reservation.id,
      stockOperationId: operation.id,
      stockMovementId: movement.id,
      canonicalEffect: `-${quantity}`,
      quantityBefore: before,
      quantityAfter: after,
      valueBeforeMinor,
      valueDeltaMinor: issue ? -issue.valueIssuedMinor : null,
      valueAfterMinor: issue?.valueAfterMinor ?? null,
      sourceCostMinor: issue?.valueIssuedMinor ?? null,
      unknownReason,
      effectiveAt: operation.effectiveAt,
      actorUserId: operation.actorUserId,
    },
  })
}
