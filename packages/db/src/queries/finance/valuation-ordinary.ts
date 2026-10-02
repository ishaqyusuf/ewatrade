import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import {
  assertSavedOrdinaryStockSource,
  ordinaryStockCanonicalQuantity as canonicalQuantity,
  resolveLoadedOrdinaryStockSource,
} from "./inventory-ordinary-source"
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

const ordinaryStockOperationInclude = {
  committedReservation: { select: { id: true } },
  store: true,
  movements: {
    include: {
      balanceSource: { include: { store: true, inventoryUnit: true } },
      enteredInventoryUnit: { include: { configurationVersion: true } },
      valuationEvent: { include: { pool: true } },
      purchaseReceipt: true,
    },
  },
  purchaseReceipts: true,
  productFulfillments: true,
  productReturns: true,
  finalizedCounts: true,
  dispatchedTransfers: true,
  receivedTransfers: true,
  cancelledTransfers: true,
  finalizedCloseouts: true,
  corrections: true,
} satisfies Prisma.StockOperationInclude

/** Private ordinary stock valuation adapter; the caller already holds Book/stock locks. */
export async function recordOrdinaryStockValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    stockOperationId: string
    expectedStockRevision: number
  },
) {
  const operation = await tx.stockOperation.findFirst({
    where: { id: input.stockOperationId, tenantId: input.tenantId },
    include: ordinaryStockOperationInclude,
  })
  if (!operation) {
    throw new FinanceError("NOT_FOUND", "Stock operation not found.")
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
  if (!book) return null
  const source = resolveLoadedOrdinaryStockSource(
    {
      ...operation,
      _count: {
        movements: operation.movements.length,
        purchaseReceipts: operation.purchaseReceipts.length,
        productFulfillments: operation.productFulfillments.length,
        productReturns: operation.productReturns.length,
        finalizedCounts: operation.finalizedCounts.length,
        finalizedCloseouts: operation.finalizedCloseouts.length,
        dispatchedTransfers: operation.dispatchedTransfers.length,
        receivedTransfers: operation.receivedTransfers.length,
        cancelledTransfers: operation.cancelledTransfers.length,
        corrections: operation.corrections.length,
      },
    },
    input.tenantId,
    book,
  )
  const { movement, balance, unit, factor, before, after, effect, magnitude } =
    source
  const event = movement.valuationEvent
  if (event) return assertSavedOrdinaryStockSource(source)

  if (
    operation.corrections.length > 0 ||
    movement.purchaseReceipt !== null ||
    balance.inventoryUnit.id !== balance.inventoryUnitId ||
    movement.configurationVersionId !==
      balance.inventoryUnit.configurationVersionId ||
    (balance.kind === "PACKAGED_STOCK" &&
      unit.id !== balance.inventoryUnitId) ||
    !Number.isSafeInteger(input.expectedStockRevision) ||
    input.expectedStockRevision < 1 ||
    !Number.isSafeInteger(balance.revision) ||
    balance.revision !== input.expectedStockRevision ||
    canonicalQuantity(balance.onHandQuantity, balance.kind, factor) !== after
  ) {
    conflict("Ordinary stock valuation requires its current physical movement.")
  }
  assertFinancePostingDate({
    effectiveAt: operation.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })

  const movementCount = await tx.stockMovement.count({
    where: { balanceSourceId: balance.id },
  })
  if (!Number.isSafeInteger(movementCount) || movementCount < 1) {
    conflict("Ordinary stock movement history cannot be counted.")
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
      "An ordinary stock operation cannot precede its latest valuation event.",
    )
  }
  if (
    pool &&
    (pool.tenantId !== input.tenantId ||
      pool.bookId !== book.id ||
      pool.balanceSourceId !== balance.id ||
      (pool.valueMinor === null) !== (pool.unknownReason !== null) ||
      (pool.valueMinor !== null &&
        (pool.valueMinor < ZERO || pool.valueMinor > MAX_DATABASE_MINOR)) ||
      pool.lastSequence < ZERO ||
      pool.lastSequence >= MAX_DATABASE_MINOR ||
      pool.lastMovementCount < ZERO ||
      pool.lastMovementCount > MAX_DATABASE_MINOR ||
      !Number.isSafeInteger(pool.lastStockRevision) ||
      pool.lastStockRevision < 0)
  ) {
    conflict("Ordinary stock valuation pool state is invalid.")
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

  let sourceCostMinor: bigint | null = null
  let valueDeltaMinor: bigint | null = null
  let valueAfterMinor: bigint | null = null
  let eventUnknownReason: FinanceInventoryUnknownReason | null = null
  if (effect.startsWith("-")) {
    if (valueBeforeMinor !== null) {
      const issue = calculateWeightedAverageIssue({
        quantityBefore: before,
        valueBeforeMinor,
        quantityIssued: magnitude,
      })
      sourceCostMinor = issue.valueIssuedMinor
      valueDeltaMinor = -issue.valueIssuedMinor
      valueAfterMinor = issue.valueAfterMinor
    } else {
      eventUnknownReason = unknownReason ?? "PRIOR_UNKNOWN_COST"
    }
  } else {
    // Generic positive movements have no trusted purchase-cost authority.
    eventUnknownReason = "UNCAPTURED_MOVEMENTS"
  }

  const sequence = (pool?.lastSequence ?? ZERO) + BigInt(1)
  if (sequence <= ZERO || sequence > MAX_DATABASE_MINOR) {
    conflict("Ordinary stock valuation sequence exceeds its limit.")
  }
  const data = {
    quantity: after,
    valueMinor: valueAfterMinor,
    unknownReason: valueAfterMinor === null ? eventUnknownReason : null,
    lastStockRevision: input.expectedStockRevision,
    lastMovementCount: movementCountExact,
    lastSequence: sequence,
    latestEffectiveAt: operation.effectiveAt,
  }
  const currentPool = pool
    ? await tx.financeInventoryPool.update({
        where: { id: pool.id },
        data,
      })
    : await tx.financeInventoryPool.create({
        data: {
          ...data,
          tenantId: input.tenantId,
          bookId: book.id,
          balanceSourceId: balance.id,
        },
      })

  return tx.financeInventoryValuationEvent.create({
    data: {
      tenantId: input.tenantId,
      bookId: book.id,
      poolId: currentPool.id,
      balanceSourceId: balance.id,
      sequence,
      kind: "ADJUSTMENT",
      sourceKind: "ORDINARY_STOCK_OPERATION",
      sourceId: operation.id,
      stockOperationId: operation.id,
      stockMovementId: movement.id,
      purchaseReceiptId: null,
      productReturnCostId: null,
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
  })
}
