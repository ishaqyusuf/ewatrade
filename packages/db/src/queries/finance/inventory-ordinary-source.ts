import {
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import {
  addQuantities,
  calculateWeightedAverageIssue,
  normalizeQuantity,
  subtractQuantities,
} from "./valuation-math"

const MAX_DATABASE_MINOR = BigInt("9223372036854775807")
const ZERO = BigInt(0)

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

export function ordinaryStockCanonicalQuantity(
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

const scopeStore = {
  select: { id: true, tenantId: true, currencyCode: true },
} as const
export const ordinaryStockSourceInclude = {
  store: scopeStore,
  committedReservation: { select: { id: true } },
  movements: {
    include: {
      balanceSource: { include: { store: scopeStore, inventoryUnit: true } },
      enteredInventoryUnit: { include: { configurationVersion: true } },
      valuationEvent: { include: { pool: true } },
      purchaseReceipt: { select: { id: true } },
    },
  },
  _count: {
    select: {
      movements: true,
      purchaseReceipts: true,
      productFulfillments: true,
      productReturns: true,
      finalizedCounts: true,
      finalizedCloseouts: true,
      dispatchedTransfers: true,
      receivedTransfers: true,
      cancelledTransfers: true,
      corrections: true,
    },
  },
} satisfies Prisma.StockOperationInclude
export type OrdinaryStockSourceOperation = Prisma.StockOperationGetPayload<{
  include: typeof ordinaryStockSourceInclude
}>
type StockOperationGraph = OrdinaryStockSourceOperation
type StockMovementGraph = StockOperationGraph["movements"][number]
type ValuationEvent = NonNullable<StockMovementGraph["valuationEvent"]>
type Book = { id: string; tenantId: string; currencyCode: string }
function hasOwnedSource(operation: StockOperationGraph) {
  return (
    operation.committedReservation !== null ||
    operation.correctionOfOperationId !== null ||
    Object.entries(operation._count).some(
      ([kind, count]) =>
        kind !== "movements" && kind !== "corrections" && count !== 0,
    )
  )
}
function validSavedEvent(
  event: ValuationEvent,
  input: {
    tenantId: string
    bookId: string
    operation: StockOperationGraph
    movement: StockMovementGraph
    balanceSourceId: string
    effect: string
    before: string
    after: string
  },
) {
  return (
    event.tenantId === input.tenantId &&
    event.bookId === input.bookId &&
    event.balanceSourceId === input.balanceSourceId &&
    event.poolId === event.pool.id &&
    event.pool.tenantId === input.tenantId &&
    event.pool.bookId === input.bookId &&
    event.pool.balanceSourceId === input.balanceSourceId &&
    event.sequence > ZERO &&
    event.sequence <= MAX_DATABASE_MINOR &&
    event.kind === "ADJUSTMENT" &&
    event.sourceKind === "ORDINARY_STOCK_OPERATION" &&
    event.sourceId === input.operation.id &&
    event.stockOperationId === input.operation.id &&
    event.stockMovementId === input.movement.id &&
    event.purchaseReceiptId === null &&
    event.productReturnCostId === null &&
    event.actorUserId === input.operation.actorUserId &&
    event.effectiveAt.getTime() === input.operation.effectiveAt.getTime() &&
    signedQuantity(event.canonicalEffect) === input.effect &&
    normalizeQuantity(event.quantityBefore.toFixed()) === input.before &&
    normalizeQuantity(event.quantityAfter.toFixed()) === input.after
  )
}

function validateSavedCost(
  event: ValuationEvent,
  input: { effect: string; before: string; after: string },
) {
  const values = [
    event.valueBeforeMinor,
    event.valueDeltaMinor,
    event.valueAfterMinor,
    event.sourceCostMinor,
  ]
  if (
    values.some(
      (value) =>
        value !== null &&
        (value < -MAX_DATABASE_MINOR - BigInt(1) || value > MAX_DATABASE_MINOR),
    ) ||
    [event.valueBeforeMinor, event.valueAfterMinor, event.sourceCostMinor].some(
      (value) => value !== null && value < ZERO,
    )
  ) {
    return false
  }

  if (!input.effect.startsWith("-")) {
    return (
      event.sourceCostMinor === null &&
      event.valueDeltaMinor === null &&
      event.valueAfterMinor === null &&
      event.unknownReason === "UNCAPTURED_MOVEMENTS"
    )
  }
  if (event.valueBeforeMinor === null) {
    return (
      event.sourceCostMinor === null &&
      event.valueDeltaMinor === null &&
      event.valueAfterMinor === null &&
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

/** Original ordinary source proof only; current stock and posting authority remain separate. */
export function resolveLoadedOrdinaryStockSource(
  operation: OrdinaryStockSourceOperation,
  tenantId: string,
  book: Book,
) {
  const store = operation.store
  if (
    book.tenantId !== tenantId ||
    book.currencyCode !== store.currencyCode ||
    operation.tenantId !== tenantId ||
    store.tenantId !== tenantId ||
    operation.storeId !== store.id ||
    !["RECEIPT", "RETURN", "ADJUSTMENT"].includes(operation.type) ||
    operation.movements.length !== 1 ||
    operation._count.movements !== 1 ||
    hasOwnedSource(operation)
  ) {
    conflict("Ordinary stock valuation source or scope changed.")
  }

  const movement = operation.movements[0]
  if (!movement) conflict("Ordinary stock movement is missing.")
  const balance = movement.balanceSource
  const unit = movement.enteredInventoryUnit
  if (
    movement.operationId !== operation.id ||
    movement.balanceSourceId !== balance.id ||
    movement.reversalOfMovementId !== null ||
    movement.purchaseReceipt !== null ||
    balance.tenantId !== tenantId ||
    balance.storeId !== store.id ||
    balance.store.id !== store.id ||
    balance.store.tenantId !== tenantId ||
    balance.store.currencyCode !== store.currencyCode ||
    (balance.kind !== "SHARED_POOL" && balance.kind !== "PACKAGED_STOCK") ||
    movement.configurationVersionId !== unit.configurationVersionId ||
    unit.configurationVersion.productId !== balance.productId ||
    movement.enteredInventoryUnitId !== unit.id ||
    movement.transactionScaleSnapshot !== unit.transactionScale ||
    movement.unitFactorSnapshot.toFixed() !== unit.factor.toFixed() ||
    (balance.kind === "PACKAGED_STOCK" &&
      unit.stockBehavior !== "PACKAGED_STOCK") ||
    (balance.kind === "SHARED_POOL" && unit.stockBehavior === "PACKAGED_STOCK")
  ) {
    conflict("Ordinary stock movement unit or ownership proof changed.")
  }

  const factor = movement.unitFactorSnapshot
  let normalizedFactor: string
  try {
    normalizedFactor = normalizeQuantity(factor.toFixed())
  } catch {
    conflict("Ordinary stock unit factor is invalid.")
  }
  if (normalizedFactor === "0") {
    conflict("Ordinary stock unit factor must be positive.")
  }
  let normalizedEnteredQuantity: string
  try {
    normalizedEnteredQuantity = parseExactDecimal(
      movement.enteredQuantity.toFixed(),
      { allowZero: false, maxScale: movement.transactionScaleSnapshot },
    )
  } catch {
    conflict("Ordinary stock entered quantity exceeds its unit scale.")
  }
  const before = ordinaryStockCanonicalQuantity(
    movement.previousOnHandQuantity,
    balance.kind,
    factor,
  )
  const after = ordinaryStockCanonicalQuantity(
    movement.resultingOnHandQuantity,
    balance.kind,
    factor,
  )
  const effect = signedQuantity(movement.signedCanonicalEffect)
  const entered = normalizeQuantity(
    multiplyExactDecimals(normalizedEnteredQuantity, factor.toFixed(), 18),
  )
  const magnitude = effect.startsWith("-")
    ? normalizeQuantity(effect.slice(1))
    : effect
  if (
    magnitude === "0" ||
    entered !== magnitude ||
    (effect.startsWith("-")
      ? subtractQuantities(before, magnitude) !== after
      : addQuantities(before, magnitude) !== after)
  ) {
    conflict("Ordinary stock movement quantity snapshots are inconsistent.")
  }

  return {
    tenantId,
    book,
    operation,
    movement,
    balance,
    unit,
    factor,
    before,
    after,
    effect,
    magnitude,
  }
}

export function assertSavedOrdinaryStockSource(
  source: ReturnType<typeof resolveLoadedOrdinaryStockSource>,
) {
  const event = source.movement.valuationEvent
  if (
    !event ||
    !validSavedEvent(event, {
      tenantId: source.tenantId,
      bookId: source.book.id,
      operation: source.operation,
      movement: source.movement,
      balanceSourceId: source.balance.id,
      effect: source.effect,
      before: source.before,
      after: source.after,
    }) ||
    !validateSavedCost(event, source)
  )
    conflict("Saved ordinary stock valuation differs from its source movement.")
  return event
}
