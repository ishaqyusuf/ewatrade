import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import {
  assertSavedStockCountSource,
  resolveLoadedStockCountSource,
} from "./inventory-count-source"
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
function canonicalQuantity(
  quantity: Prisma.Decimal,
  kind: "SHARED_POOL" | "PACKAGED_STOCK",
  factor: Prisma.Decimal,
) {
  return normalizeQuantity(
    kind === "PACKAGED_STOCK"
      ? multiplyExactDecimals(quantity.toFixed(), factor.toFixed(), 18)
      : quantity.toFixed(),
  )
}

const stockCountValuationInclude = {
  store: true,
  lines: {
    include: {
      balanceSource: { include: { store: true, inventoryUnit: true } },
    },
  },
  finalizedOperation: {
    include: {
      store: true,
      movements: {
        include: {
          balanceSource: { include: { store: true, inventoryUnit: true } },
          valuationEvent: { include: { pool: true } },
        },
      },
    },
  },
} satisfies Prisma.StockCountInclude

type ValuationEvent =
  Prisma.FinanceInventoryValuationEventGetPayload<Prisma.FinanceInventoryValuationEventDefaultArgs>

/**
 * Private valuation adapter for a finalized physical stock count. The caller
 * owns the Finance Book lock, count lock, and sorted Balance Source locks.
 */
export async function recordStockCountValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; stockCountId: string },
) {
  const count = await tx.stockCount.findFirst({
    where: { id: input.stockCountId, tenantId: input.tenantId },
    include: stockCountValuationInclude,
  })
  if (!count) {
    throw new FinanceError("NOT_FOUND", "Stock count not found.")
  }

  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: input.tenantId,
        currencyCode: count.store.currencyCode,
      },
    },
  })
  if (!book) return null
  const source = resolveLoadedStockCountSource(count, input.tenantId, book)
  const { operation, nonzeroLines } = source

  const existingCount = nonzeroLines.filter(
    ({ movement }) => movement.valuationEvent !== null,
  ).length
  if (existingCount !== 0 && existingCount !== nonzeroLines.length) {
    conflict("Stock Count valuation is only partially registered.")
  }
  if (existingCount === nonzeroLines.length && nonzeroLines.length > 0) {
    return assertSavedStockCountSource(source)
  }
  if (nonzeroLines.length === 0) return []

  assertFinancePostingDate({
    effectiveAt: operation.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })

  const created: ValuationEvent[] = []
  for (const { line, movement, before, after, effect } of nonzeroLines) {
    const balance = line.balanceSource
    if (
      !Number.isSafeInteger(balance.revision) ||
      !Number.isSafeInteger(line.expectedRevision) ||
      line.expectedRevision < 0 ||
      line.expectedRevision === Number.MAX_SAFE_INTEGER ||
      balance.revision !== line.expectedRevision + 1 ||
      canonicalQuantity(
        balance.onHandQuantity,
        balance.kind,
        balance.inventoryUnit.factor,
      ) !== after
    ) {
      conflict("Stock Count is no longer the current Balance Source revision.")
    }

    const movementCount = await tx.stockMovement.count({
      where: { balanceSourceId: balance.id },
    })
    if (!Number.isSafeInteger(movementCount) || movementCount < 1) {
      conflict("Stock Count movement history cannot be counted.")
    }
    const movementCountExact = BigInt(movementCount)
    const pool = await tx.financeInventoryPool.findUnique({
      where: {
        bookId_balanceSourceId: {
          bookId: book.id,
          balanceSourceId: balance.id,
        },
      },
    })
    if (pool && operation.effectiveAt < pool.latestEffectiveAt) {
      throw new FinanceError(
        "INVALID_JOURNAL",
        "A Stock Count cannot precede its latest inventory valuation event.",
      )
    }
    if (
      pool &&
      (pool.tenantId !== input.tenantId ||
        pool.bookId !== book.id ||
        pool.balanceSourceId !== balance.id)
    ) {
      conflict("Stock Count valuation pool scope changed.")
    }
    if (
      pool &&
      ((pool.valueMinor === null) !== (pool.unknownReason !== null) ||
        (pool.valueMinor !== null &&
          (pool.valueMinor < ZERO || pool.valueMinor > MAX_DATABASE_MINOR)) ||
        pool.lastSequence < ZERO ||
        pool.lastSequence > MAX_DATABASE_MINOR ||
        pool.lastMovementCount < ZERO ||
        pool.lastMovementCount > MAX_DATABASE_MINOR ||
        !Number.isSafeInteger(pool.lastStockRevision) ||
        pool.lastStockRevision < 0)
    ) {
      conflict("Stock Count valuation pool cost and reason disagree.")
    }

    let valueBeforeMinor: bigint | null = null
    let unknownReason: FinanceInventoryUnknownReason | null = null
    if (!pool) {
      if (before === "0" && movementCountExact === BigInt(1)) {
        valueBeforeMinor = ZERO
      } else {
        unknownReason =
          before === "0" ? "UNCAPTURED_MOVEMENTS" : "MISSING_OPENING_COST"
      }
    } else if (
      normalizeQuantity(pool.quantity.toFixed()) !== before ||
      pool.lastMovementCount + BigInt(1) !== movementCountExact
    ) {
      unknownReason = "UNCAPTURED_MOVEMENTS"
    } else if (pool.valueMinor === null) {
      unknownReason = pool.unknownReason ?? "PRIOR_UNKNOWN_COST"
    } else {
      valueBeforeMinor = pool.valueMinor
    }

    const shortage = effect.startsWith("-")
    let sourceCostMinor: bigint | null = null
    let valueDeltaMinor: bigint | null = null
    let valueAfterMinor: bigint | null = null
    let eventUnknownReason: FinanceInventoryUnknownReason | null = null
    if (shortage) {
      const issued = normalizeQuantity(effect.slice(1))
      if (valueBeforeMinor !== null) {
        const issue = calculateWeightedAverageIssue({
          quantityBefore: before,
          valueBeforeMinor,
          quantityIssued: issued,
        })
        sourceCostMinor = issue.valueIssuedMinor
        valueDeltaMinor = -issue.valueIssuedMinor
        valueAfterMinor = issue.valueAfterMinor
      } else {
        eventUnknownReason = unknownReason ?? "PRIOR_UNKNOWN_COST"
      }
    } else {
      // A physical gain has no original issue or receipt cost proof.
      eventUnknownReason = "UNCAPTURED_MOVEMENTS"
    }

    const sequence = (pool?.lastSequence ?? ZERO) + BigInt(1)
    if (sequence <= ZERO || sequence > MAX_DATABASE_MINOR) {
      conflict("Stock Count valuation sequence exceeds its limit.")
    }
    const nextPool = {
      quantity: after,
      valueMinor: valueAfterMinor,
      unknownReason: valueAfterMinor === null ? eventUnknownReason : null,
      lastStockRevision: balance.revision,
      lastMovementCount: movementCountExact,
      lastSequence: sequence,
      latestEffectiveAt: operation.effectiveAt,
    }
    const currentPool = pool
      ? await tx.financeInventoryPool.update({
          where: { id: pool.id },
          data: nextPool,
        })
      : await tx.financeInventoryPool.create({
          data: {
            ...nextPool,
            tenantId: input.tenantId,
            bookId: book.id,
            balanceSourceId: balance.id,
          },
        })

    created.push(
      await tx.financeInventoryValuationEvent.create({
        data: {
          tenantId: input.tenantId,
          bookId: book.id,
          poolId: currentPool.id,
          balanceSourceId: balance.id,
          sequence,
          kind: "ADJUSTMENT",
          sourceKind: "STOCK_COUNT",
          sourceId: count.id,
          stockOperationId: operation.id,
          stockMovementId: movement.id,
          canonicalEffect: effect,
          quantityBefore: before,
          quantityAfter: after,
          valueBeforeMinor,
          valueDeltaMinor,
          valueAfterMinor,
          sourceCostMinor,
          unknownReason: eventUnknownReason,
          effectiveAt: operation.effectiveAt,
          actorUserId: operation.actorUserId,
        },
      }),
    )
  }
  return created
}
