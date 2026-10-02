import type { Prisma } from "../../../generated/prisma/client"
import { resolveInventoryOpeningSourceInTransaction } from "./inventory-opening-source"
import { FinanceError, assertFinancePostingDate } from "./rules"

const ZERO = BigInt(0)
const ONE = BigInt(1)
type Source = Awaited<
  ReturnType<typeof resolveInventoryOpeningSourceInTransaction>
>
type Item = Source["sources"][number]
type Event = NonNullable<Item["movement"]["valuationEvent"]>
type Saved =
  Prisma.FinanceInventoryValuationEventGetPayload<Prisma.FinanceInventoryValuationEventDefaultArgs>

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}
export function assertSavedInventoryOpeningSource(
  event: Event,
  source: Source,
  item: Item,
) {
  const book = source.book
  const empty = item.quantity === "0"
  if (
    !book ||
    event.tenantId !== source.receipt.tenantId ||
    event.bookId !== book.id ||
    event.poolId !== event.pool.id ||
    event.pool.tenantId !== source.receipt.tenantId ||
    event.pool.bookId !== book.id ||
    event.pool.balanceSourceId !== item.movement.balanceSourceId ||
    event.balanceSourceId !== item.movement.balanceSourceId ||
    event.kind !== "OPENING" ||
    event.sourceKind !== source.sourceKind ||
    event.sourceId !== source.receipt.id ||
    event.stockOperationId !== item.operation.id ||
    event.stockMovementId !== item.movement.id ||
    event.purchaseReceiptId !== null ||
    event.productReturnCostId !== null ||
    event.sequence !== ONE ||
    event.actorUserId !== item.operation.actorUserId ||
    event.effectiveAt.getTime() !== item.operation.effectiveAt.getTime() ||
    event.canonicalEffect.toFixed() !== item.quantity ||
    event.quantityBefore.toFixed() !== "0" ||
    event.quantityAfter.toFixed() !== item.quantity ||
    event.valueBeforeMinor !== ZERO ||
    event.valueDeltaMinor !== (empty ? ZERO : null) ||
    event.valueAfterMinor !== (empty ? ZERO : null) ||
    event.sourceCostMinor !== (empty ? ZERO : null) ||
    event.unknownReason !== (empty ? null : "MISSING_OPENING_COST")
  )
    conflict("Saved opening cost differs from its immutable source.")
}

/** Private fresh source capture only. Historical public replay must exit earlier. */
export async function recordInventoryOpeningValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; receiptId: string; expectedBookId?: string },
): Promise<Saved[] | null> {
  const source = await resolveInventoryOpeningSourceInTransaction(tx, input)
  const { book, sources } = source
  if (!book) return null
  const savedCount = sources.filter(
    (item) => item.movement.valuationEvent !== null,
  ).length
  if (savedCount !== 0 && savedCount !== sources.length)
    conflict("Opening cost has a partial saved source set.")
  if (savedCount)
    return sources.map((item) => {
      const event = item.movement.valuationEvent
      if (!event) conflict("Opening cost is missing from its saved set.")
      assertSavedInventoryOpeningSource(event, source, item)
      return event
    })
  if (sources.length === 0) return []
  for (const item of sources) {
    const balance = item.movement.balanceSource
    if (
      item.corrections !== 0 ||
      balance.revision !== 0 ||
      balance.onHandQuantity.toFixed() !== item.quantity ||
      balance.reservedQuantity.toFixed() !== "0"
    )
      conflict("Opening capture requires its fresh unmodified root balance.")
    assertFinancePostingDate({
      effectiveAt: item.operation.effectiveAt,
      startsAt: book.startsAt,
      closedThrough: book.closedThrough,
      now: new Date(),
    })
  }
  const balanceIds = sources.map((item) => item.movement.balanceSourceId)
  const counts = await tx.stockMovement.groupBy({
    by: ["balanceSourceId"],
    where: { balanceSourceId: { in: balanceIds } },
    _count: { _all: true },
  })
  const pools = await tx.financeInventoryPool.findMany({
    where: { bookId: book.id, balanceSourceId: { in: balanceIds } },
    select: { id: true },
  })
  if (
    counts.length !== sources.length ||
    counts.some((row) => row._count._all !== 1) ||
    pools.length
  )
    conflict(
      "Opening capture cannot replace existing cost or unregistered history.",
    )
  const createdPools = await tx.financeInventoryPool.createManyAndReturn({
    select: { id: true, balanceSourceId: true },
    data: sources.map((item) => ({
      tenantId: input.tenantId,
      bookId: book.id,
      balanceSourceId: item.movement.balanceSourceId,
      quantity: item.quantity,
      valueMinor: item.quantity === "0" ? ZERO : null,
      unknownReason: item.quantity === "0" ? null : "MISSING_OPENING_COST",
      lastStockRevision: 0,
      lastMovementCount: ONE,
      lastSequence: ONE,
      latestEffectiveAt: item.operation.effectiveAt,
    })),
  })
  const poolByBalance = new Map(
    createdPools.map((pool) => [pool.balanceSourceId, pool.id]),
  )
  if (
    createdPools.length !== sources.length ||
    poolByBalance.size !== sources.length
  )
    conflict("Opening pool creation did not retain every original root.")
  return tx.financeInventoryValuationEvent.createManyAndReturn({
    data: sources.map((item) => {
      const poolId = poolByBalance.get(item.movement.balanceSourceId)
      if (!poolId) conflict("Opening root pool is missing.")
      const empty = item.quantity === "0"
      const value = empty ? ZERO : null
      return {
        tenantId: input.tenantId,
        bookId: book.id,
        poolId,
        balanceSourceId: item.movement.balanceSourceId,
        sequence: ONE,
        kind: "OPENING",
        sourceKind: source.sourceKind,
        sourceId: source.receipt.id,
        stockOperationId: item.operation.id,
        stockMovementId: item.movement.id,
        canonicalEffect: item.quantity,
        quantityBefore: "0",
        quantityAfter: item.quantity,
        valueBeforeMinor: ZERO,
        valueDeltaMinor: value,
        valueAfterMinor: value,
        sourceCostMinor: value,
        unknownReason: empty ? null : "MISSING_OPENING_COST",
        effectiveAt: item.operation.effectiveAt,
        actorUserId: item.operation.actorUserId,
      }
    }),
  })
}
