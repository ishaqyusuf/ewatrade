import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { FinanceError, assertFinancePostingDate } from "./rules"
import {
  calculateWeightedAverageIssue,
  normalizeQuantity,
} from "./valuation-math"

/** Matches ordinary stock valuation at the pre-posting movement count. */
export async function previewOrdinaryAdjustmentCost(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    currencyCode: string
    balanceSourceId: string
    canonicalBefore: string
    canonicalQuantity: string
    direction: "increase" | "decrease"
    effectiveAt: Date
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
  const empty = {
    currencyCode: input.currencyCode,
    valueBeforeMinor: null,
    valueAfterMinor: null,
    valueDeltaMinor: null,
    unknownReason: null,
  }
  if (!book) return { ...empty, status: "NO_FINANCE_BOOK" as const }
  assertFinancePostingDate({
    effectiveAt: input.effectiveAt,
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
  const count = await tx.stockMovement.count({
    where: { balanceSourceId: input.balanceSourceId },
  })
  if (!Number.isSafeInteger(count) || count < 0)
    throw new FinanceError(
      "CONFLICT",
      "Ordinary movement history cannot be counted.",
    )
  const max = 9223372036854775807n
  if (
    pool &&
    (pool.tenantId !== input.tenantId ||
      pool.bookId !== book.id ||
      pool.balanceSourceId !== input.balanceSourceId ||
      (pool.valueMinor === null) !== (pool.unknownReason !== null) ||
      (pool.valueMinor !== null &&
        (pool.valueMinor < 0n || pool.valueMinor > max)) ||
      pool.lastSequence < 0n ||
      pool.lastSequence >= max ||
      pool.lastMovementCount < 0n ||
      pool.lastMovementCount > max ||
      !Number.isSafeInteger(pool.lastStockRevision) ||
      pool.lastStockRevision < 0)
  )
    throw new FinanceError(
      "CONFLICT",
      "Ordinary stock valuation pool state is invalid.",
    )
  if (pool && input.effectiveAt < pool.latestEffectiveAt)
    throw new FinanceError(
      "INVALID_JOURNAL",
      "An ordinary stock operation cannot precede its latest valuation event.",
    )
  let before: bigint | null = null
  let unknown: FinanceInventoryUnknownReason | null = null
  if (!pool) {
    if (input.canonicalBefore === "0" && count === 0) before = 0n
    else
      unknown =
        input.canonicalBefore === "0"
          ? "UNCAPTURED_MOVEMENTS"
          : "MISSING_OPENING_COST"
  } else if (
    normalizeQuantity(pool.quantity.toFixed()) !== input.canonicalBefore ||
    pool.lastMovementCount !== BigInt(count)
  )
    unknown = "UNCAPTURED_MOVEMENTS"
  else if (pool.valueMinor === null)
    unknown = pool.unknownReason ?? "PRIOR_UNKNOWN_COST"
  else before = pool.valueMinor
  const base = {
    status: "PROJECTED" as const,
    currencyCode: input.currencyCode,
    poolSequence: pool?.lastSequence.toString() ?? null,
    valueBeforeMinor: before?.toString() ?? null,
  }
  if (input.direction === "increase" || before === null)
    return {
      ...base,
      valueAfterMinor: null,
      valueDeltaMinor: null,
      unknownReason:
        input.direction === "increase"
          ? "UNCAPTURED_MOVEMENTS"
          : (unknown ?? "PRIOR_UNKNOWN_COST"),
    }
  const issue = calculateWeightedAverageIssue({
    quantityBefore: input.canonicalBefore,
    valueBeforeMinor: before,
    quantityIssued: input.canonicalQuantity,
  })
  return {
    ...base,
    valueAfterMinor: issue.valueAfterMinor.toString(),
    valueDeltaMinor: (-issue.valueIssuedMinor).toString(),
    unknownReason: null,
  }
}
