import { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import {
  type ReviewedCostBookContext,
  readReviewedCostBook,
} from "./reviewed-cost-book-context"
import {
  type ReviewedHistoryUnit,
  type ReviewedPhysicalBalance,
  type ReviewedPhysicalMovement,
  auditReviewedCostPhysicalHistory,
} from "./reviewed-cost-history-rules"
import { FinanceError } from "./rules"

const storeSelect = { id: true, tenantId: true, currencyCode: true } as const
const unitSelect = {
  id: true,
  configurationVersionId: true,
  factor: true,
  stockBehavior: true,
  configurationVersion: { select: { productId: true } },
} satisfies Prisma.InventoryUnitSelect
type Unit = Prisma.InventoryUnitGetPayload<{ select: typeof unitSelect }>
function unitFact(unit: Unit): ReviewedHistoryUnit {
  return {
    id: unit.id,
    configurationVersionId: unit.configurationVersionId,
    productId: unit.configurationVersion.productId,
    factor: unit.factor.toFixed(),
    stockBehavior: unit.stockBehavior,
  }
}
const movementInclude = {
  enteredInventoryUnit: { select: unitSelect },
  operation: {
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      type: true,
      source: true,
      clientOperationId: true,
      payloadHash: true,
      actorUserId: true,
      effectiveAt: true,
      linkedOperationId: true,
      correctionOfOperationId: true,
      store: { select: storeSelect },
    },
  },
  valuationEvent: true,
} satisfies Prisma.StockMovementInclude

/**
 * Private current physical snapshot, with management/Book and sorted balance locks.
 * This is one input to complete source loading, not a confirmed monetary import.
 */
export async function readReviewedCostPhysicalHistoryInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & {
    bookId: string
    balanceSourceIds: string[]
    through: Date
  },
  context?: ReviewedCostBookContext,
) {
  const ids = [...input.balanceSourceIds].sort()
  if (
    !ids.length ||
    ids.length > 128 ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !id.trim() || id.length > 256)
  )
    throw new FinanceError(
      "CONFLICT",
      "Review 1–128 unique stock balance sources.",
    )
  const book = await readReviewedCostBook(tx, input, context)
  if (!Number.isFinite(input.through.getTime()) || input.through > new Date())
    throw new FinanceError(
      "CONFLICT",
      "Physical review requires a finite past history-through time.",
    )
  const scope = await tx.stockBalanceSource.findMany({
    where: { id: { in: ids }, tenantId: input.tenantId },
    select: { id: true, store: { select: storeSelect } },
    take: 129,
  })
  if (
    scope.length !== ids.length ||
    scope.some(
      (balance) =>
        balance.store.tenantId !== input.tenantId ||
        balance.store.currencyCode !== book.currencyCode,
    )
  )
    throw new FinanceError(
      "CONFLICT",
      "Requested physical balances do not all belong to this Tenant/currency Book.",
    )
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "StockBalanceSource"
    WHERE "tenantId" = ${input.tenantId} AND id IN (${Prisma.join(ids)})
    ORDER BY id FOR SHARE
  `
  if (
    locked.length !== ids.length ||
    locked.some((row) => !ids.includes(row.id))
  )
    throw new FinanceError(
      "CONFLICT",
      "Physical balance scope changed before the reviewed snapshot.",
    )
  const balances = await tx.stockBalanceSource.findMany({
    where: { id: { in: ids }, tenantId: input.tenantId },
    include: {
      store: { select: storeSelect },
      product: {
        select: {
          id: true,
          catalogItemId: true,
          catalogItem: { select: { tenantId: true } },
        },
      },
      variant: { select: { id: true, catalogItemId: true } },
      inventoryUnit: { select: unitSelect },
      financeInventoryPools: { where: { bookId: book.id }, take: 2 },
      _count: { select: { movements: true } },
    },
    orderBy: { id: "asc" },
    take: 129,
  })
  if (
    balances.length !== ids.length ||
    balances.some((balance) => balance.financeInventoryPools.length > 1) ||
    balances.reduce((count, balance) => count + balance._count.movements, 0) >
      4096
  )
    throw new FinanceError(
      "CONFLICT",
      "Physical review exceeds its complete bounded history scope.",
    )
  // Do not filter by date, actor, operation Tenant or presence of a valuation event:
  // those filters could hide legacy/net-zero/crossed history from the audit.
  const movements = await tx.stockMovement.findMany({
    where: { balanceSourceId: { in: ids } },
    include: movementInclude,
    orderBy: { id: "asc" },
    take: 4097,
  })
  const balanceFacts: ReviewedPhysicalBalance[] = balances.map((balance) => ({
    id: balance.id,
    tenantId: balance.tenantId,
    storeId: balance.storeId,
    store: balance.store,
    productId: balance.productId,
    product: {
      id: balance.product.id,
      catalogItemId: balance.product.catalogItemId,
      tenantId: balance.product.catalogItem.tenantId,
    },
    variantId: balance.variantId,
    variant: balance.variant,
    inventoryUnitId: balance.inventoryUnitId,
    unit: unitFact(balance.inventoryUnit),
    kind: balance.kind,
    onHandQuantity: balance.onHandQuantity.toFixed(),
    revision: balance.revision,
    movementCount: balance._count.movements,
    pool: (() => {
      const pool = balance.financeInventoryPools[0]
      return pool
        ? {
            id: pool.id,
            tenantId: pool.tenantId,
            bookId: pool.bookId,
            balanceSourceId: pool.balanceSourceId,
            quantity: pool.quantity.toFixed(),
            valueMinor: pool.valueMinor,
            lastSequence: pool.lastSequence,
            lastMovementCount: pool.lastMovementCount,
            lastStockRevision: pool.lastStockRevision,
            lastCostReviewSnapshotId: pool.lastCostReviewSnapshotId,
          }
        : null
    })(),
  }))
  const movementFacts: ReviewedPhysicalMovement[] = movements.map(
    (movement) => {
      const event = movement.valuationEvent
      return {
        id: movement.id,
        balanceSourceId: movement.balanceSourceId,
        configurationVersionId: movement.configurationVersionId,
        enteredInventoryUnitId: movement.enteredInventoryUnitId,
        enteredQuantity: movement.enteredQuantity.toFixed(),
        transactionScaleSnapshot: movement.transactionScaleSnapshot,
        unitFactorSnapshot: movement.unitFactorSnapshot.toFixed(),
        signedCanonicalEffect: movement.signedCanonicalEffect.toFixed(),
        previousOnHandQuantity: movement.previousOnHandQuantity.toFixed(),
        resultingOnHandQuantity: movement.resultingOnHandQuantity.toFixed(),
        reversalOfMovementId: movement.reversalOfMovementId,
        createdAt: movement.createdAt,
        unit: unitFact(movement.enteredInventoryUnit),
        operation: movement.operation,
        valuation: event
          ? {
              id: event.id,
              tenantId: event.tenantId,
              bookId: event.bookId,
              poolId: event.poolId,
              balanceSourceId: event.balanceSourceId,
              stockOperationId: event.stockOperationId,
              stockMovementId: event.stockMovementId,
              sequence: event.sequence,
              sourceKind: event.sourceKind,
              sourceId: event.sourceId,
              canonicalEffect: event.canonicalEffect.toFixed(),
              quantityBefore: event.quantityBefore.toFixed(),
              quantityAfter: event.quantityAfter.toFixed(),
              sourceCostMinor: event.sourceCostMinor,
              effectiveAt: event.effectiveAt,
            }
          : null,
      }
    },
  )
  return auditReviewedCostPhysicalHistory({
    tenantId: book.tenantId,
    bookId: book.id,
    currencyCode: book.currencyCode,
    bookSequence: book.lastSequence,
    through: input.through,
    balances: balanceFacts,
    movements: movementFacts,
  })
}
