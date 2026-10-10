import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { resolveInventoryRelocationSourceInTransaction } from "./inventory-relocation-source"
import { FinanceError, assertFinancePostingDate } from "./rules"
import {
  addQuantities,
  calculateWeightedAverageIssue,
  normalizeQuantity,
  subtractQuantities,
} from "./valuation-math"

const ZERO = BigInt(0)
const MAX_MINOR = BigInt("9223372036854775807")
const MIN_MINOR = BigInt("-9223372036854775808")
type ValuationEvent = Prisma.FinanceInventoryValuationEventGetPayload<{
  include: { pool: true }
}>
type EventCost = Pick<
  ValuationEvent,
  | "sourceCostMinor"
  | "valueBeforeMinor"
  | "valueDeltaMinor"
  | "valueAfterMinor"
  | "unknownReason"
>
type Relocation = NonNullable<
  Awaited<ReturnType<typeof resolveInventoryRelocationSourceInTransaction>>
>
type Endpoint = Relocation["source"]
type Balance = Endpoint["balance"]

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

function signedQuantity(value: string) {
  const negative = value.startsWith("-")
  const magnitude = normalizeQuantity(negative ? value.slice(1) : value)
  return negative && magnitude !== "0" ? `-${magnitude}` : magnitude
}

function canonicalBalanceQuantity(balance: Balance) {
  const quantity = balance.onHandQuantity.toFixed()
  return normalizeQuantity(
    balance.kind === "PACKAGED_STOCK"
      ? multiplyExactDecimals(
          quantity,
          balance.inventoryUnit.factor.toFixed(),
          18,
        )
      : quantity,
  )
}

function eventCostStateIsValid(cost: EventCost) {
  for (const value of [
    cost.sourceCostMinor,
    cost.valueBeforeMinor,
    cost.valueDeltaMinor,
    cost.valueAfterMinor,
  ]) {
    if (value !== null && (value < MIN_MINOR || value > MAX_MINOR)) return false
  }
  if (
    [cost.sourceCostMinor, cost.valueBeforeMinor, cost.valueAfterMinor].some(
      (value) => value !== null && value < ZERO,
    )
  )
    return false
  const known =
    cost.sourceCostMinor !== null &&
    cost.valueBeforeMinor !== null &&
    cost.valueDeltaMinor !== null &&
    cost.valueAfterMinor !== null &&
    cost.unknownReason === null &&
    cost.valueBeforeMinor + cost.valueDeltaMinor === cost.valueAfterMinor
  const unknown =
    cost.valueDeltaMinor === null &&
    cost.valueAfterMinor === null &&
    cost.unknownReason !== null &&
    (cost.valueBeforeMinor === null || cost.valueBeforeMinor >= ZERO)
  const retainedSourceCost =
    cost.sourceCostMinor !== null &&
    cost.valueBeforeMinor === null &&
    cost.valueDeltaMinor === null &&
    cost.valueAfterMinor === null &&
    cost.unknownReason !== null
  return known || unknown || retainedSourceCost
}

function sameEventSource(
  event: ValuationEvent,
  input: {
    tenantId: string
    bookId: string
    balance: Balance
    endpoint: Endpoint
    relocation: Relocation
    kind: "TRANSFER_OUT" | "TRANSFER_IN"
    effectiveAt: Date
    actorUserId: string
  },
) {
  const sourceKind = input.relocation.sourceKind
  return (
    event.tenantId === input.tenantId &&
    event.bookId === input.bookId &&
    event.poolId.length > 0 &&
    event.pool.id === event.poolId &&
    event.pool.tenantId === input.tenantId &&
    event.pool.bookId === input.bookId &&
    event.pool.balanceSourceId === input.balance.id &&
    event.balanceSourceId === input.balance.id &&
    event.sequence > ZERO &&
    event.sequence <= MAX_MINOR &&
    event.kind === input.kind &&
    event.sourceKind === sourceKind &&
    event.sourceId === input.relocation.sourceId &&
    event.stockOperationId === input.relocation.operation.id &&
    event.stockMovementId === input.endpoint.movement.id &&
    event.purchaseReceiptId === null &&
    event.productReturnCostId === null &&
    signedQuantity(event.canonicalEffect.toFixed()) ===
      signedQuantity(input.endpoint.effect) &&
    normalizeQuantity(event.quantityBefore.toFixed()) ===
      input.endpoint.before &&
    normalizeQuantity(event.quantityAfter.toFixed()) === input.endpoint.after &&
    (input.endpoint.before !== "0" ||
      event.valueBeforeMinor === null ||
      event.valueBeforeMinor === ZERO) &&
    (input.endpoint.after !== "0" ||
      event.valueAfterMinor === null ||
      event.valueAfterMinor === ZERO) &&
    event.effectiveAt.getTime() === input.effectiveAt.getTime() &&
    event.actorUserId === input.actorUserId &&
    eventCostStateIsValid(event)
  )
}

function validateSourceCost(event: ValuationEvent, endpoint: Endpoint) {
  if (!eventCostStateIsValid(event))
    conflict("Saved relocation source value state is invalid.")
  if (event.sourceCostMinor === null) {
    if (event.unknownReason === null || event.valueBeforeMinor !== null)
      conflict("Unknown relocation source value has no reason.")
    return
  }
  const valueBeforeMinor = event.valueBeforeMinor
  if (valueBeforeMinor === null)
    conflict("Known relocation source allocation has no starting pool value.")
  let issue: ReturnType<typeof calculateWeightedAverageIssue>
  try {
    issue = calculateWeightedAverageIssue({
      quantityBefore: endpoint.before,
      valueBeforeMinor,
      quantityIssued: subtractQuantities(endpoint.before, endpoint.after),
    })
  } catch {
    conflict("Saved relocation source allocation cannot be verified.")
  }
  if (
    event.sourceCostMinor !== issue.valueIssuedMinor ||
    event.valueDeltaMinor !== -issue.valueIssuedMinor ||
    event.valueAfterMinor !== issue.valueAfterMinor ||
    event.unknownReason !== null
  )
    conflict("Saved relocation source allocation is inconsistent.")
}

function validateTargetCost(source: ValuationEvent, target: ValuationEvent) {
  if (source.sourceCostMinor !== target.sourceCostMinor)
    conflict("Relocation endpoints do not preserve the same source cost.")
  if (!eventCostStateIsValid(target))
    conflict("Saved relocation target value state is invalid.")
  if (target.valueBeforeMinor === null || source.sourceCostMinor === null) {
    if (
      target.valueDeltaMinor !== null ||
      target.valueAfterMinor !== null ||
      target.unknownReason === null
    )
      conflict("Unknown relocation target value is inconsistent.")
    return
  }
  const after = target.valueBeforeMinor + source.sourceCostMinor
  if (
    after > MAX_MINOR ||
    target.valueDeltaMinor !== source.sourceCostMinor ||
    target.valueAfterMinor !== after ||
    target.unknownReason !== null
  )
    conflict("Saved relocation target value does not conserve source cost.")
}

/** Read-only original pair proof, also used by fresh capture's saved replay. */
export function assertSavedInventoryRelocationSource(relocation: Relocation) {
  const { book, operation, source, target } = relocation
  const sourceEvent = source.movement.valuationEvent
  const targetEvent = target.movement.valuationEvent
  if (!sourceEvent || !targetEvent)
    conflict("Original relocation requires its complete saved valuation pair.")
  for (const [event, endpoint, kind] of [
    [sourceEvent, source, "TRANSFER_OUT"],
    [targetEvent, target, "TRANSFER_IN"],
  ] as const) {
    if (
      !sameEventSource(event, {
        tenantId: book.tenantId,
        bookId: book.id,
        balance: endpoint.balance,
        endpoint,
        relocation,
        kind,
        effectiveAt: operation.effectiveAt,
        actorUserId: operation.actorUserId,
      })
    )
      conflict("Saved relocation valuation pair differs from its source.")
  }
  validateSourceCost(sourceEvent, source)
  validateTargetCost(sourceEvent, targetEvent)
  return { sourceEvent, targetEvent }
}

function resolvePoolValue(
  pool: {
    quantity: { toFixed(): string }
    valueMinor: bigint | null
    unknownReason: FinanceInventoryUnknownReason | null
    lastMovementCount: bigint
  } | null,
  endpoint: Endpoint,
  movementCount: number,
): {
  valueBeforeMinor: bigint | null
  unknownReason: FinanceInventoryUnknownReason | null
} {
  const exactCount = BigInt(movementCount)
  if (!pool) {
    if (endpoint.before === "0" && exactCount === BigInt(1))
      return { valueBeforeMinor: ZERO, unknownReason: null }
    return {
      valueBeforeMinor: null,
      unknownReason:
        endpoint.before === "0"
          ? "UNCAPTURED_MOVEMENTS"
          : "MISSING_OPENING_COST",
    }
  }
  if (pool.lastMovementCount + BigInt(1) > exactCount)
    conflict("Relocation pool movement history exceeds the source history.")
  if (
    pool.lastMovementCount + BigInt(1) !== exactCount ||
    normalizeQuantity(pool.quantity.toFixed()) !== endpoint.before
  )
    return {
      valueBeforeMinor: null,
      unknownReason: "UNCAPTURED_MOVEMENTS",
    }
  if (pool.valueMinor === null)
    return {
      valueBeforeMinor: null,
      unknownReason: pool.unknownReason ?? "PRIOR_UNKNOWN_COST",
    }
  return { valueBeforeMinor: pool.valueMinor, unknownReason: null }
}

/** Register exact carrying value on both physical sides of a custody or Store transfer. */
export async function recordInventoryRelocationValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    stockOperationId: string
    expectedSourceStockRevision: number
    expectedTargetStockRevision: number
  },
) {
  const relocation = await resolveInventoryRelocationSourceInTransaction(tx, {
    tenantId: input.tenantId,
    stockOperationId: input.stockOperationId,
  })
  return recordResolvedInventoryRelocationValuationInTransaction(
    tx,
    input,
    relocation,
  )
}

/** Same posting rules over an already proven source; repository loading stays separate. */
export async function recordResolvedInventoryRelocationValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    stockOperationId: string
    expectedSourceStockRevision: number
    expectedTargetStockRevision: number
  },
  relocation: Awaited<
    ReturnType<typeof resolveInventoryRelocationSourceInTransaction>
  >,
) {
  if (!relocation) return null

  const { book, operation, source, target } = relocation
  const sourceBalance = source.balance
  const targetBalance = target.balance
  const effectiveAt = operation.effectiveAt
  const actorUserId = operation.actorUserId
  if (
    operation.id !== input.stockOperationId ||
    book.tenantId !== input.tenantId ||
    book.currencyCode !== sourceBalance.store.currencyCode ||
    sourceBalance.store.currencyCode !== targetBalance.store.currencyCode ||
    sourceBalance.id === targetBalance.id ||
    source.movement.balanceSourceId !== sourceBalance.id ||
    target.movement.balanceSourceId !== targetBalance.id ||
    source.movement.operationId !== operation.id ||
    target.movement.operationId !== operation.id
  )
    conflict("Relocation endpoints are not in one scoped Finance Book.")

  const sourceEvent = source.movement.valuationEvent
  const targetEvent = target.movement.valuationEvent
  if (Boolean(sourceEvent) !== Boolean(targetEvent))
    conflict("Relocation valuation pair is only partially registered.")
  if (sourceEvent && targetEvent) {
    return assertSavedInventoryRelocationSource(relocation)
  }

  if (
    !relocation.freshStageValid ||
    relocation.correctionCount !== 0 ||
    !Number.isSafeInteger(input.expectedSourceStockRevision) ||
    !Number.isSafeInteger(input.expectedTargetStockRevision) ||
    input.expectedSourceStockRevision < 1 ||
    input.expectedTargetStockRevision < 1 ||
    (sourceBalance.kind !== "SHARED_POOL" &&
      sourceBalance.kind !== "PACKAGED_STOCK") ||
    (targetBalance.kind !== "SHARED_POOL" &&
      targetBalance.kind !== "PACKAGED_STOCK") ||
    sourceBalance.revision !== input.expectedSourceStockRevision ||
    targetBalance.revision !== input.expectedTargetStockRevision ||
    canonicalBalanceQuantity(sourceBalance) !== source.after ||
    canonicalBalanceQuantity(targetBalance) !== target.after
  )
    conflict("Relocation is no longer the fresh current physical transition.")
  if (
    !Number.isFinite(effectiveAt.getTime()) ||
    actorUserId.length === 0 ||
    sourceBalance.tenantId !== input.tenantId ||
    targetBalance.tenantId !== input.tenantId ||
    sourceBalance.store.tenantId !== input.tenantId ||
    targetBalance.store.tenantId !== input.tenantId ||
    sourceBalance.productId !== targetBalance.productId ||
    sourceBalance.variantId !== targetBalance.variantId ||
    sourceBalance.kind !== targetBalance.kind ||
    sourceBalance.inventoryUnitId !== targetBalance.inventoryUnitId ||
    sourceBalance.inventoryUnit.configurationVersionId !==
      targetBalance.inventoryUnit.configurationVersionId ||
    sourceBalance.inventoryUnit.factor.toFixed() !==
      targetBalance.inventoryUnit.factor.toFixed() ||
    sourceBalance.inventoryUnit.transactionScale !==
      targetBalance.inventoryUnit.transactionScale ||
    signedQuantity(source.effect) === "0" ||
    !signedQuantity(source.effect).startsWith("-") ||
    signedQuantity(target.effect).startsWith("-")
  )
    conflict("Relocation endpoint scope or signed quantity is inconsistent.")
  const issuedQuantity = signedQuantity(source.effect).slice(1)
  if (
    issuedQuantity === "0" ||
    signedQuantity(target.effect) !== issuedQuantity ||
    subtractQuantities(source.before, issuedQuantity) !== source.after ||
    addQuantities(target.before, issuedQuantity) !== target.after
  )
    conflict("Relocation movement quantities do not form a balanced pair.")
  assertFinancePostingDate({
    effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  const [sourceMovementCount, targetMovementCount] = await Promise.all([
    tx.stockMovement.count({ where: { balanceSourceId: sourceBalance.id } }),
    tx.stockMovement.count({ where: { balanceSourceId: targetBalance.id } }),
  ])
  if (
    !Number.isSafeInteger(sourceMovementCount) ||
    sourceMovementCount < 1 ||
    !Number.isSafeInteger(targetMovementCount) ||
    targetMovementCount < 1
  )
    conflict("Relocation movement history cannot be counted.")

  const [sourcePool, targetPool] = await Promise.all([
    tx.financeInventoryPool.findUnique({
      where: {
        bookId_balanceSourceId: {
          bookId: book.id,
          balanceSourceId: sourceBalance.id,
        },
      },
    }),
    tx.financeInventoryPool.findUnique({
      where: {
        bookId_balanceSourceId: {
          bookId: book.id,
          balanceSourceId: targetBalance.id,
        },
      },
    }),
  ])
  for (const [pool, balance] of [
    [sourcePool, sourceBalance],
    [targetPool, targetBalance],
  ] as const) {
    if (!pool) continue
    if (
      pool.tenantId !== input.tenantId ||
      pool.bookId !== book.id ||
      pool.balanceSourceId !== balance.id ||
      (pool.valueMinor === null) !== (pool.unknownReason !== null) ||
      !Number.isSafeInteger(pool.lastStockRevision) ||
      pool.lastStockRevision < 0 ||
      pool.lastStockRevision > balance.revision - 1 ||
      pool.lastMovementCount < ZERO ||
      pool.lastMovementCount > MAX_MINOR ||
      pool.lastSequence < ZERO ||
      pool.lastSequence > MAX_MINOR ||
      !Number.isFinite(pool.latestEffectiveAt.getTime()) ||
      (normalizeQuantity(pool.quantity.toFixed()) === "0" &&
        pool.valueMinor !== null &&
        pool.valueMinor > ZERO) ||
      (pool.valueMinor !== null &&
        (pool.valueMinor < ZERO || pool.valueMinor > MAX_MINOR))
    )
      conflict("Relocation pool scope or current state is inconsistent.")
    if (effectiveAt < pool.latestEffectiveAt)
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Relocation cannot precede an endpoint valuation event.",
      )
  }
  const sourceBase = resolvePoolValue(sourcePool, source, sourceMovementCount)
  const targetBase = resolvePoolValue(targetPool, target, targetMovementCount)
  let sourceCostMinor: bigint | null = null
  let sourceValueAfter: bigint | null = null
  let sourceUnknownReason: FinanceInventoryUnknownReason | null =
    sourceBase.unknownReason
  if (sourceBase.valueBeforeMinor !== null) {
    const issue = calculateWeightedAverageIssue({
      quantityBefore: source.before,
      valueBeforeMinor: sourceBase.valueBeforeMinor,
      quantityIssued: subtractQuantities(source.before, source.after),
    })
    sourceCostMinor = issue.valueIssuedMinor
    sourceValueAfter = issue.valueAfterMinor
    sourceUnknownReason = null
  } else {
    sourceUnknownReason ??= "PRIOR_UNKNOWN_COST"
  }
  let targetValueAfter: bigint | null = null
  let targetUnknownReason: FinanceInventoryUnknownReason | null =
    targetBase.unknownReason
  if (targetBase.valueBeforeMinor !== null && sourceCostMinor !== null) {
    targetValueAfter = targetBase.valueBeforeMinor + sourceCostMinor
    if (targetValueAfter > MAX_MINOR)
      throw new FinanceError(
        "INVALID_AMOUNT",
        "Relocation target carrying value exceeds its limit.",
      )
    targetUnknownReason = null
  } else {
    targetUnknownReason ??= sourceUnknownReason ?? "PRIOR_UNKNOWN_COST"
  }

  const sourceSequence = (sourcePool?.lastSequence ?? ZERO) + BigInt(1)
  const targetSequence = (targetPool?.lastSequence ?? ZERO) + BigInt(1)
  if (sourceSequence > MAX_MINOR || targetSequence > MAX_MINOR)
    conflict("Relocation valuation sequence exceeds its limit.")
  const sourceNextPool = {
    quantity: source.after,
    valueMinor: sourceValueAfter,
    unknownReason: sourceValueAfter === null ? sourceUnknownReason : null,
    lastStockRevision: sourceBalance.revision,
    lastMovementCount: BigInt(sourceMovementCount),
    lastSequence: sourceSequence,
    latestEffectiveAt: effectiveAt,
  }
  const targetNextPool = {
    quantity: target.after,
    valueMinor: targetValueAfter,
    unknownReason: targetValueAfter === null ? targetUnknownReason : null,
    lastStockRevision: targetBalance.revision,
    lastMovementCount: BigInt(targetMovementCount),
    lastSequence: targetSequence,
    latestEffectiveAt: effectiveAt,
  }
  const [sourceCurrentPool, targetCurrentPool] = await Promise.all([
    sourcePool
      ? tx.financeInventoryPool.update({
          where: { id: sourcePool.id },
          data: sourceNextPool,
        })
      : tx.financeInventoryPool.create({
          data: {
            tenantId: input.tenantId,
            bookId: book.id,
            balanceSourceId: sourceBalance.id,
            ...sourceNextPool,
          },
        }),
    targetPool
      ? tx.financeInventoryPool.update({
          where: { id: targetPool.id },
          data: targetNextPool,
        })
      : tx.financeInventoryPool.create({
          data: {
            tenantId: input.tenantId,
            bookId: book.id,
            balanceSourceId: targetBalance.id,
            ...targetNextPool,
          },
        }),
  ])
  const sourceCost: EventCost = {
    sourceCostMinor,
    valueBeforeMinor: sourceBase.valueBeforeMinor,
    valueDeltaMinor: sourceCostMinor === null ? null : -sourceCostMinor,
    valueAfterMinor: sourceValueAfter,
    unknownReason: sourceValueAfter === null ? sourceUnknownReason : null,
  }
  const targetCost: EventCost = {
    sourceCostMinor,
    valueBeforeMinor: targetBase.valueBeforeMinor,
    valueDeltaMinor:
      targetBase.valueBeforeMinor === null || sourceCostMinor === null
        ? null
        : sourceCostMinor,
    valueAfterMinor: targetValueAfter,
    unknownReason: targetValueAfter === null ? targetUnknownReason : null,
  }
  const createEvent = (
    endpoint: Endpoint,
    poolId: string,
    sequence: bigint,
    kind: "TRANSFER_OUT" | "TRANSFER_IN",
    cost: EventCost,
  ) =>
    tx.financeInventoryValuationEvent.create({
      data: {
        tenantId: input.tenantId,
        bookId: book.id,
        poolId,
        balanceSourceId: endpoint.balance.id,
        sequence,
        kind,
        sourceKind: relocation.sourceKind,
        sourceId: relocation.sourceId,
        stockOperationId: operation.id,
        stockMovementId: endpoint.movement.id,
        canonicalEffect: signedQuantity(endpoint.effect),
        quantityBefore: endpoint.before,
        quantityAfter: endpoint.after,
        ...cost,
        effectiveAt,
        actorUserId,
      },
    })
  const createdSource = await createEvent(
    source,
    sourceCurrentPool.id,
    sourceSequence,
    "TRANSFER_OUT",
    sourceCost,
  )
  const createdTarget = await createEvent(
    target,
    targetCurrentPool.id,
    targetSequence,
    "TRANSFER_IN",
    targetCost,
  )
  return { sourceEvent: createdSource, targetEvent: createdTarget }
}
