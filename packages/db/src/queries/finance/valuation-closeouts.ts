import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { resolveInventoryCloseoutSourceInTransaction } from "./inventory-closeout-source"
import { FinanceError, assertFinancePostingDate } from "./rules"
import {
  calculateWeightedAverageIssue,
  normalizeQuantity,
} from "./valuation-math"

const ZERO = BigInt(0)
const MAX_MINOR = BigInt("9223372036854775807")
type Source = Awaited<
  ReturnType<typeof resolveInventoryCloseoutSourceInTransaction>
>
type SavedSource = Pick<Source, "closeout" | "operation" | "nonzeroLines"> & {
  book: { id: string; tenantId: string; currencyCode: string }
}
type SourceLine = Source["nonzeroLines"][number]
type SavedEvent = NonNullable<SourceLine["movement"]["valuationEvent"]>
type Event =
  Prisma.FinanceInventoryValuationEventGetPayload<Prisma.FinanceInventoryValuationEventDefaultArgs>

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

function normalized(value: string) {
  try {
    return normalizeQuantity(value)
  } catch {
    conflict("Closeout valuation quantity exceeds exact supported bounds.")
  }
}

function currentQuantity(item: SourceLine) {
  const balance = item.line.balanceSource
  try {
    return normalized(
      balance.kind === "PACKAGED_STOCK"
        ? multiplyExactDecimals(
            balance.onHandQuantity.toFixed(),
            balance.inventoryUnit.factor.toFixed(),
            18,
          )
        : balance.onHandQuantity.toFixed(),
    )
  } catch {
    conflict("Closeout current canonical quantity is invalid.")
  }
}

function originalCostMatches(event: SavedEvent, item: SourceLine) {
  if (
    [event.valueBeforeMinor, event.valueAfterMinor, event.sourceCostMinor].some(
      (value) => value !== null && (value < ZERO || value > MAX_MINOR),
    ) ||
    (event.valueDeltaMinor !== null &&
      (event.valueDeltaMinor < -MAX_MINOR ||
        event.valueDeltaMinor > MAX_MINOR)) ||
    (item.before === "0" &&
      event.valueBeforeMinor !== null &&
      event.valueBeforeMinor !== ZERO)
  )
    return false
  const shortage = item.effect.startsWith("-")
  if (!shortage)
    return (
      event.sourceCostMinor === null &&
      event.valueDeltaMinor === null &&
      event.valueAfterMinor === null &&
      event.unknownReason === "UNCAPTURED_MOVEMENTS"
    )
  if (event.valueBeforeMinor === null)
    return (
      event.sourceCostMinor === null &&
      event.valueDeltaMinor === null &&
      event.valueAfterMinor === null &&
      event.unknownReason !== null
    )
  try {
    const issue = calculateWeightedAverageIssue({
      quantityBefore: item.before,
      quantityIssued: item.effect.slice(1),
      valueBeforeMinor: event.valueBeforeMinor,
    })
    return (
      event.unknownReason === null &&
      event.sourceCostMinor === issue.valueIssuedMinor &&
      event.valueDeltaMinor === -issue.valueIssuedMinor &&
      event.valueAfterMinor === issue.valueAfterMinor
    )
  } catch {
    return false
  }
}

function verifySaved(event: SavedEvent, source: SavedSource, item: SourceLine) {
  const book = source.book
  if (
    !book ||
    event.tenantId !== source.closeout.tenantId ||
    event.bookId !== book.id ||
    event.balanceSourceId !== item.line.balanceSourceId ||
    event.poolId !== event.pool.id ||
    event.pool.tenantId !== source.closeout.tenantId ||
    event.pool.bookId !== book.id ||
    event.pool.balanceSourceId !== item.line.balanceSourceId ||
    event.kind !== "ADJUSTMENT" ||
    event.sourceKind !== "INVENTORY_CLOSEOUT" ||
    event.sourceId !== source.closeout.id ||
    event.stockOperationId !== source.operation.id ||
    event.stockMovementId !== item.movement.id ||
    event.purchaseReceiptId !== null ||
    event.productReturnCostId !== null ||
    event.actorUserId !== source.operation.actorUserId ||
    event.effectiveAt.getTime() !== source.operation.effectiveAt.getTime() ||
    event.sequence <= ZERO ||
    event.sequence > MAX_MINOR ||
    event.canonicalEffect.toFixed() !== item.effect ||
    normalized(event.quantityBefore.toFixed()) !== item.before ||
    normalized(event.quantityAfter.toFixed()) !== item.after ||
    !originalCostMatches(event, item)
  )
    conflict("Saved closeout cost differs from its immutable source.")
}

/** Complete saved original set; shared by replay and private source composition. */
export function assertSavedInventoryCloseoutSource(source: SavedSource) {
  if (
    source.book.tenantId !== source.closeout.tenantId ||
    source.book.currencyCode !== source.closeout.store.currencyCode
  )
    conflict("Closeout financial Book differs from its held context.")
  return source.nonzeroLines.map((item) => {
    const event = item.movement.valuationEvent
    if (!event) conflict("Closeout saved cost is missing.")
    verifySaved(event, source, item)
    return event
  })
}

/** Fresh approved source costing; caller owns Book/closeout/sorted balance locks. */
export async function recordInventoryCloseoutValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; closeoutId: string; expectedBookId?: string },
): Promise<Event[] | null> {
  const context = await recordInventoryCloseoutCostContextInTransaction(
    tx,
    input,
  )
  return context?.events ?? null
}

/** Private fresh composer context; reuses one proven source graph under held locks. */
export async function recordInventoryCloseoutCostContextInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; closeoutId: string; expectedBookId?: string },
): Promise<{ source: Source; events: Event[] } | null> {
  const source = await resolveInventoryCloseoutSourceInTransaction(tx, input)
  const book = source.book
  if (!book) return null
  const { nonzeroLines, operation, closeout } = source
  const savedCount = nonzeroLines.filter(
    (item) => item.movement.valuationEvent !== null,
  ).length
  if (savedCount !== 0 && savedCount !== nonzeroLines.length)
    conflict("Closeout valuation is an incomplete saved source set.")
  if (savedCount > 0) {
    const events = assertSavedInventoryCloseoutSource({ ...source, book })
    return { source, events }
  }
  if (nonzeroLines.length === 0) return { source, events: [] }
  if (closeout.status !== "FINALIZED" || source.corrections !== 0)
    conflict("Closeout costing requires its fresh finalized source.")
  assertFinancePostingDate({
    effectiveAt: operation.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  const events: Event[] = []
  for (const item of nonzeroLines) {
    const balance = item.line.balanceSource
    if (
      !Number.isSafeInteger(balance.revision) ||
      balance.revision !== item.line.expectedRevision + 1 ||
      currentQuantity(item) !== item.after
    )
      conflict(
        "Closeout costing requires its current finalized stock revision.",
      )
    const movementCount = await tx.stockMovement.count({
      where: { balanceSourceId: balance.id },
    })
    if (!Number.isSafeInteger(movementCount) || movementCount < 1)
      conflict("Closeout stock movement history cannot be counted.")
    const count = BigInt(movementCount)
    const pool = await tx.financeInventoryPool.findUnique({
      where: {
        bookId_balanceSourceId: {
          bookId: book.id,
          balanceSourceId: balance.id,
        },
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
            (normalized(pool.quantity.toFixed()) === "0" &&
              pool.valueMinor !== ZERO))) ||
        !Number.isSafeInteger(pool.lastStockRevision) ||
        pool.lastStockRevision < 0 ||
        pool.lastStockRevision >= balance.revision ||
        pool.lastMovementCount < ZERO ||
        pool.lastMovementCount > MAX_MINOR ||
        pool.lastSequence < ZERO ||
        pool.lastSequence >= MAX_MINOR ||
        !Number.isFinite(pool.latestEffectiveAt.getTime()))
    )
      conflict("Closeout valuation pool state or scope is invalid.")
    if (pool && operation.effectiveAt < pool.latestEffectiveAt)
      throw new FinanceError(
        "INVALID_JOURNAL",
        "A closeout cannot precede its latest carrying value.",
      )

    let valueBeforeMinor: bigint | null = null
    let unknownReason: FinanceInventoryUnknownReason | null = null
    if (!pool) {
      if (item.before === "0" && count === BigInt(1)) valueBeforeMinor = ZERO
      else
        unknownReason =
          item.before === "0" ? "UNCAPTURED_MOVEMENTS" : "MISSING_OPENING_COST"
    } else if (
      normalized(pool.quantity.toFixed()) !== item.before ||
      pool.lastMovementCount + BigInt(1) !== count
    ) {
      unknownReason = "UNCAPTURED_MOVEMENTS"
    } else if (pool.valueMinor === null)
      unknownReason = pool.unknownReason ?? "PRIOR_UNKNOWN_COST"
    else valueBeforeMinor = pool.valueMinor
    const shortage = item.effect.startsWith("-")
    const issue =
      shortage && valueBeforeMinor !== null
        ? calculateWeightedAverageIssue({
            quantityBefore: item.before,
            quantityIssued: item.effect.slice(1),
            valueBeforeMinor,
          })
        : null
    if (!shortage) unknownReason = "UNCAPTURED_MOVEMENTS"
    const sequence = (pool?.lastSequence ?? ZERO) + BigInt(1)
    const data = {
      quantity: item.after,
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
            ...data,
            tenantId: input.tenantId,
            bookId: book.id,
            balanceSourceId: balance.id,
          },
        })
    events.push(
      await tx.financeInventoryValuationEvent.create({
        data: {
          tenantId: input.tenantId,
          bookId: book.id,
          poolId: nextPool.id,
          balanceSourceId: balance.id,
          sequence,
          kind: "ADJUSTMENT",
          sourceKind: "INVENTORY_CLOSEOUT",
          sourceId: closeout.id,
          stockOperationId: operation.id,
          stockMovementId: item.movement.id,
          canonicalEffect: item.effect,
          quantityBefore: item.before,
          quantityAfter: item.after,
          valueBeforeMinor,
          valueDeltaMinor: issue ? -issue.valueIssuedMinor : null,
          valueAfterMinor: issue?.valueAfterMinor ?? null,
          sourceCostMinor: issue?.valueIssuedMinor ?? null,
          unknownReason,
          effectiveAt: operation.effectiveAt,
          actorUserId: operation.actorUserId,
        },
      }),
    )
  }
  return { source, events }
}
