import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import {
  calculateWeightedAverageIssue,
  normalizeQuantity,
  subtractQuantities,
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

function signedQuantity(value: Prisma.Decimal) {
  const text = value.toFixed()
  return text.startsWith("-")
    ? `-${normalizeQuantity(text.slice(1))}`
    : normalizeQuantity(text)
}

function normalizedSignedQuantity(value: string) {
  const isNegative = value.startsWith("-")
  const magnitude = normalizeQuantity(isNegative ? value.slice(1) : value)
  return magnitude === "0" || !isNegative ? magnitude : `-${magnitude}`
}

export const stockCountSourceInclude = {
  store: { select: { id: true, tenantId: true, currencyCode: true } },
  lines: {
    include: {
      balanceSource: {
        include: {
          store: { select: { id: true, tenantId: true, currencyCode: true } },
          inventoryUnit: true,
        },
      },
    },
  },
  finalizedOperation: {
    include: {
      store: { select: { id: true, tenantId: true, currencyCode: true } },
      movements: {
        include: {
          balanceSource: {
            include: {
              store: {
                select: { id: true, tenantId: true, currencyCode: true },
              },
              inventoryUnit: true,
            },
          },
          valuationEvent: { include: { pool: true } },
        },
      },
    },
  },
} satisfies Prisma.StockCountInclude

export type StockCountSourceGraph = Prisma.StockCountGetPayload<{
  include: typeof stockCountSourceInclude
}>
type CountLine = StockCountSourceGraph["lines"][number]
type CountOperation = NonNullable<StockCountSourceGraph["finalizedOperation"]>
type CountMovement = CountOperation["movements"][number]
type ValuationEvent =
  Prisma.FinanceInventoryValuationEventGetPayload<Prisma.FinanceInventoryValuationEventDefaultArgs>
type ReplayEvent = NonNullable<CountMovement["valuationEvent"]>

function validReplayEvent(
  event: ReplayEvent,
  input: {
    tenantId: string
    bookId: string
    countId: string
    operationId: string
    actorUserId: string
    effectiveAt: Date
    balanceSourceId: string
    movementId: string
    effect: string
    before: string
    after: string
    shortage: boolean
  },
) {
  if (
    event.tenantId !== input.tenantId ||
    event.bookId !== input.bookId ||
    event.poolId.length === 0 ||
    event.sequence <= ZERO ||
    event.sequence > MAX_DATABASE_MINOR ||
    event.kind !== "ADJUSTMENT" ||
    event.sourceKind !== "STOCK_COUNT" ||
    event.sourceId !== input.countId ||
    event.stockOperationId !== input.operationId ||
    event.stockMovementId !== input.movementId ||
    event.balanceSourceId !== input.balanceSourceId ||
    event.pool.id !== event.poolId ||
    event.pool.tenantId !== input.tenantId ||
    event.pool.bookId !== input.bookId ||
    event.pool.balanceSourceId !== input.balanceSourceId ||
    event.purchaseReceiptId !== null ||
    event.productReturnCostId !== null ||
    event.actorUserId !== input.actorUserId ||
    event.effectiveAt.getTime() !== input.effectiveAt.getTime() ||
    signedQuantity(event.canonicalEffect) !== input.effect ||
    normalizeQuantity(event.quantityBefore.toFixed()) !== input.before ||
    normalizeQuantity(event.quantityAfter.toFixed()) !== input.after
  ) {
    return false
  }

  for (const value of [
    event.valueBeforeMinor,
    event.valueDeltaMinor,
    event.valueAfterMinor,
    event.sourceCostMinor,
  ]) {
    if (
      value !== null &&
      (value < -MAX_DATABASE_MINOR - BigInt(1) || value > MAX_DATABASE_MINOR)
    ) {
      return false
    }
  }
  if (
    [event.valueBeforeMinor, event.valueAfterMinor, event.sourceCostMinor].some(
      (value) => value !== null && value < ZERO,
    )
  ) {
    return false
  }

  if (!input.shortage) {
    return (
      event.valueDeltaMinor === null &&
      event.valueAfterMinor === null &&
      event.sourceCostMinor === null &&
      event.unknownReason === "UNCAPTURED_MOVEMENTS"
    )
  }
  if (event.valueBeforeMinor === null) {
    return (
      event.valueDeltaMinor === null &&
      event.valueAfterMinor === null &&
      event.sourceCostMinor === null &&
      event.unknownReason !== null
    )
  }

  let issue: ReturnType<typeof calculateWeightedAverageIssue>
  try {
    issue = calculateWeightedAverageIssue({
      quantityBefore: input.before,
      valueBeforeMinor: event.valueBeforeMinor,
      quantityIssued: subtractQuantities(input.before, input.after),
    })
  } catch {
    return false
  }
  return (
    event.unknownReason === null &&
    event.sourceCostMinor === issue.valueIssuedMinor &&
    event.valueDeltaMinor === -issue.valueIssuedMinor &&
    event.valueAfterMinor === issue.valueAfterMinor
  )
}

/** Pure complete original count proof; no current-stock or monetary write authority. */
export function resolveLoadedStockCountSource(
  count: StockCountSourceGraph,
  tenantId: string,
  book: { id: string; tenantId: string; currencyCode: string },
) {
  const operation = count.finalizedOperation
  if (
    book.tenantId !== tenantId ||
    book.currencyCode !== count.store.currencyCode ||
    count.tenantId !== tenantId ||
    count.store.id !== count.storeId ||
    count.store.tenantId !== tenantId ||
    count.status !== "FINALIZED" ||
    count.finalizedAt === null ||
    !operation ||
    count.finalizedOperationId !== operation.id ||
    operation.tenantId !== tenantId ||
    operation.storeId !== count.storeId ||
    operation.store.id !== count.storeId ||
    operation.store.tenantId !== tenantId ||
    operation.store.currencyCode !== count.store.currencyCode ||
    operation.type !== "COUNT_RECONCILIATION" ||
    operation.source !== "stock_count" ||
    operation.effectiveAt < count.createdAt ||
    operation.effectiveAt.getTime() !== count.finalizedAt.getTime()
  ) {
    conflict("Finalized Stock Count provenance or scope changed.")
  }

  if (
    new Set(count.lines.map((line) => line.balanceSourceId)).size !==
    count.lines.length
  )
    conflict("Stock Count repeats an original Balance Source line.")
  const movementByBalance = new Map<string, CountMovement>()
  for (const candidate of operation.movements) {
    if (movementByBalance.has(candidate.balanceSourceId)) {
      conflict("Stock Count has duplicate reconciliation movements.")
    }
    movementByBalance.set(candidate.balanceSourceId, candidate)
  }

  const nonzeroLines: Array<{
    line: CountLine
    movement: CountMovement
    before: string
    after: string
    effect: string
  }> = []
  for (const line of count.lines) {
    const balance = line.balanceSource
    if (
      balance.id !== line.balanceSourceId ||
      balance.tenantId !== tenantId ||
      balance.storeId !== count.storeId ||
      balance.store.id !== count.storeId ||
      balance.store.tenantId !== tenantId ||
      balance.store.currencyCode !== count.store.currencyCode ||
      balance.inventoryUnit.id !== balance.inventoryUnitId ||
      line.configurationVersionId !==
        balance.inventoryUnit.configurationVersionId
    ) {
      conflict("Stock Count line Balance Source scope changed.")
    }

    const factor = balance.inventoryUnit.factor
    let normalizedFactor: string
    try {
      normalizedFactor = normalizeQuantity(factor.toFixed())
    } catch {
      conflict("Stock Count Inventory Unit factor is invalid.")
    }
    if (normalizedFactor === "0") {
      conflict("Stock Count Inventory Unit factor must be positive.")
    }
    const before = canonicalQuantity(
      line.expectedQuantity,
      balance.kind,
      factor,
    )
    const after = canonicalQuantity(line.observedQuantity, balance.kind, factor)
    const variance = normalizedSignedQuantity(line.varianceQuantity.toFixed())
    const varianceMagnitude = variance.startsWith("-")
      ? variance.slice(1)
      : variance
    const canonicalVariance =
      balance.kind === "PACKAGED_STOCK"
        ? normalizeQuantity(
            multiplyExactDecimals(varianceMagnitude, factor.toFixed(), 18),
          )
        : varianceMagnitude
    const signedCanonicalVariance = variance.startsWith("-")
      ? `-${canonicalVariance}`
      : canonicalVariance
    if (variance !== "0" && canonicalVariance === "0") {
      conflict("Stock Count variance rounds to a zero canonical effect.")
    }
    let lineQuantitiesMatch = false
    try {
      lineQuantitiesMatch =
        variance === "0"
          ? after === before
          : variance.startsWith("-")
            ? subtractQuantities(before, canonicalVariance) === after
            : subtractQuantities(after, canonicalVariance) === before
    } catch {
      conflict("Stock Count line quantity snapshots are inconsistent.")
    }
    if (!lineQuantitiesMatch) {
      conflict("Stock Count line quantity snapshots are inconsistent.")
    }
    if (variance === "0") {
      if (movementByBalance.has(line.balanceSourceId)) {
        conflict("A zero-variance Stock Count line has a movement.")
      }
      continue
    }

    const movement = movementByBalance.get(line.balanceSourceId)
    if (!movement) {
      conflict("A nonzero Stock Count line is missing its movement.")
    }
    const entered = canonicalQuantity(
      movement.enteredQuantity,
      balance.kind,
      movement.unitFactorSnapshot,
    )
    const effect = signedQuantity(movement.signedCanonicalEffect)
    const expectedEffect = signedCanonicalVariance
    if (
      movement.operationId !== operation.id ||
      movement.balanceSourceId !== line.balanceSourceId ||
      movement.reversalOfMovementId !== null ||
      movement.balanceSource.id !== balance.id ||
      movement.balanceSource.tenantId !== tenantId ||
      movement.balanceSource.storeId !== count.storeId ||
      movement.balanceSource.store.id !== count.storeId ||
      movement.balanceSource.store.tenantId !== tenantId ||
      movement.balanceSource.store.currencyCode !== count.store.currencyCode ||
      movement.configurationVersionId !== line.configurationVersionId ||
      movement.enteredInventoryUnitId !== balance.inventoryUnitId ||
      movement.transactionScaleSnapshot !==
        balance.inventoryUnit.transactionScale ||
      movement.unitFactorSnapshot.toFixed() !== factor.toFixed() ||
      entered !== canonicalVariance ||
      effect !== expectedEffect ||
      canonicalQuantity(
        movement.previousOnHandQuantity,
        balance.kind,
        movement.unitFactorSnapshot,
      ) !== before ||
      canonicalQuantity(
        movement.resultingOnHandQuantity,
        balance.kind,
        movement.unitFactorSnapshot,
      ) !== after
    ) {
      conflict("Stock Count movement does not match its finalized line.")
    }
    nonzeroLines.push({ line, movement, before, after, effect })
  }
  if (operation.movements.length !== nonzeroLines.length) {
    conflict("Stock Count has extraneous reconciliation movements.")
  }

  return { tenantId, count, book, operation, nonzeroLines }
}
export function assertSavedStockCountSource(
  source: ReturnType<typeof resolveLoadedStockCountSource>,
) {
  const { tenantId, count, book, operation, nonzeroLines } = source
  for (const { line, movement, before, after, effect } of nonzeroLines) {
    const event = movement.valuationEvent
    if (
      !event ||
      !validReplayEvent(event, {
        tenantId,
        bookId: book.id,
        countId: count.id,
        operationId: operation.id,
        actorUserId: operation.actorUserId,
        effectiveAt: operation.effectiveAt,
        balanceSourceId: line.balanceSourceId,
        movementId: movement.id,
        effect,
        before,
        after,
        shortage: effect.startsWith("-"),
      })
    )
      conflict(
        "Saved Stock Count valuation differs from its finalized movement.",
      )
  }
  return nonzeroLines.flatMap(({ movement }) =>
    movement.valuationEvent ? [movement.valuationEvent] : [],
  )
}
