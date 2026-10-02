import {
  multiplyExactDecimals,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import { normalizeQuantity } from "./valuation-math"

export const closeoutSourceInclude = {
  store: { select: { id: true, tenantId: true, currencyCode: true } },
  lines: {
    include: {
      balanceSource: {
        include: {
          store: { select: { id: true, tenantId: true, currencyCode: true } },
          inventoryUnit: {
            include: {
              configurationVersion: { select: { id: true, productId: true } },
            },
          },
          product: {
            select: {
              id: true,
              catalogItemId: true,
              catalogItem: { select: { id: true, tenantId: true } },
            },
          },
          variant: { select: { id: true, catalogItemId: true } },
          parentBalanceSource: {
            select: {
              id: true,
              tenantId: true,
              storeId: true,
              custodyType: true,
              custodyReferenceId: true,
              parentBalanceSourceId: true,
              productId: true,
              variantId: true,
              inventoryUnitId: true,
              kind: true,
            },
          },
        },
      },
    },
  },
  finalizedOperation: {
    include: {
      store: { select: { id: true, tenantId: true, currencyCode: true } },
      committedReservation: { select: { id: true } },
      movements: {
        include: {
          enteredInventoryUnit: {
            include: {
              configurationVersion: { select: { id: true, productId: true } },
            },
          },
          purchaseReceipt: { select: { id: true } },
          valuationEvent: { include: { pool: true } },
        },
      },
      _count: {
        select: {
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
    },
  },
} satisfies Prisma.InventoryCloseoutInclude

export type InventoryCloseoutSourceGraph = Prisma.InventoryCloseoutGetPayload<{
  include: typeof closeoutSourceInclude
}>
type Line = InventoryCloseoutSourceGraph["lines"][number]
type Operation = NonNullable<InventoryCloseoutSourceGraph["finalizedOperation"]>
type Movement = Operation["movements"][number]

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

function normalizedSigned(value: string) {
  const negative = value.startsWith("-")
  const magnitude = normalizeQuantity(negative ? value.slice(1) : value)
  return magnitude !== "0" && negative ? `-${magnitude}` : magnitude
}

function quantities(line: Line) {
  try {
    const beforePhysical = normalizeQuantity(line.expectedQuantity.toFixed())
    const afterPhysical = normalizeQuantity(line.declaredQuantity.toFixed())
    const variance = normalizedSigned(line.varianceQuantity.toFixed())
    if (
      normalizedSigned(subtractExactDecimals(afterPhysical, beforePhysical)) !==
      variance
    )
      conflict("Closeout variance differs from its declared quantities.")
    const factor = normalizeQuantity(
      line.balanceSource.inventoryUnit.factor.toFixed(),
    )
    if (factor === "0") conflict("Closeout unit factor must be positive.")
    const canonical = (value: string) =>
      normalizeQuantity(
        line.balanceSource.kind === "PACKAGED_STOCK"
          ? multiplyExactDecimals(value, factor, 18)
          : value,
      )
    const magnitude = canonical(
      variance.startsWith("-") ? variance.slice(1) : variance,
    )
    return {
      before: canonical(beforePhysical),
      after: canonical(afterPhysical),
      beforePhysical,
      afterPhysical,
      variance,
      effect:
        variance.startsWith("-") && magnitude !== "0"
          ? `-${magnitude}`
          : magnitude,
    }
  } catch (error) {
    if (error instanceof FinanceError) throw error
    conflict(
      "Closeout quantities or unit factor exceed exact supported bounds.",
    )
  }
}

/** Pure original custody document/line proof, with no current-stock or Book authority. */
export function resolveLoadedInventoryCloseoutSource(
  closeout: InventoryCloseoutSourceGraph,
  tenantId: string,
) {
  const operation = closeout.finalizedOperation
  if (
    !operation ||
    closeout.tenantId !== tenantId ||
    closeout.finalizedOperationId !== operation.id ||
    !closeout.finalizedAt ||
    closeout.finalizedAt.getTime() !== operation.effectiveAt.getTime() ||
    !Number.isFinite(operation.effectiveAt.getTime()) ||
    operation.effectiveAt < closeout.createdAt ||
    operation.tenantId !== tenantId ||
    operation.storeId !== closeout.storeId ||
    operation.store.id !== closeout.storeId ||
    operation.store.tenantId !== tenantId ||
    closeout.store.id !== closeout.storeId ||
    closeout.store.tenantId !== tenantId ||
    operation.store.currencyCode !== closeout.store.currencyCode ||
    operation.type !== "ADJUSTMENT" ||
    operation.source !== "inventory_closeout" ||
    operation.correctionOfOperationId !== null ||
    operation.committedReservation !== null ||
    !operation.actorUserId.trim() ||
    !closeout.custodyReferenceId.trim() ||
    (closeout.custodyType !== "STAFF" && closeout.custodyType !== "SESSION") ||
    operation._count.finalizedCloseouts !== 1
  )
    conflict("Closeout does not own an immutable custody reconciliation.")
  const {
    corrections,
    finalizedCloseouts: _ownCount,
    ...otherOwners
  } = operation._count
  if (Object.values(otherOwners).some((count) => count !== 0))
    conflict("Closeout operation has a competing source owner.")

  const byBalance = new Map<string, Movement>()
  for (const movement of operation.movements) {
    if (byBalance.has(movement.balanceSourceId))
      conflict("Closeout has duplicate stock movements.")
    byBalance.set(movement.balanceSourceId, movement)
  }
  const lineIds = new Set<string>()
  const balanceIds = new Set<string>()
  const nonzeroLines: Array<{
    line: Line
    movement: Movement
    before: string
    after: string
    effect: string
  }> = []
  for (const line of closeout.lines) {
    const balance = line.balanceSource
    const unit = balance.inventoryUnit
    const parent = balance.parentBalanceSource
    if (
      lineIds.has(line.id) ||
      balanceIds.has(line.balanceSourceId) ||
      line.closeoutId !== closeout.id ||
      balance.id !== line.balanceSourceId ||
      balance.tenantId !== tenantId ||
      balance.storeId !== closeout.storeId ||
      balance.store.id !== closeout.storeId ||
      balance.store.tenantId !== tenantId ||
      balance.store.currencyCode !== closeout.store.currencyCode ||
      balance.custodyType !== closeout.custodyType ||
      balance.custodyReferenceId !== closeout.custodyReferenceId ||
      !parent ||
      parent.id !== balance.parentBalanceSourceId ||
      parent.tenantId !== tenantId ||
      parent.storeId !== closeout.storeId ||
      parent.custodyType !== "STORE" ||
      parent.custodyReferenceId !== "" ||
      parent.parentBalanceSourceId !== null ||
      parent.productId !== balance.productId ||
      parent.variantId !== balance.variantId ||
      parent.inventoryUnitId !== balance.inventoryUnitId ||
      parent.kind !== balance.kind ||
      balance.product.id !== balance.productId ||
      balance.product.catalogItem.id !== balance.product.catalogItemId ||
      balance.product.catalogItem.tenantId !== tenantId ||
      balance.variant.id !== balance.variantId ||
      balance.variant.catalogItemId !== balance.product.catalogItemId ||
      unit.id !== balance.inventoryUnitId ||
      unit.configurationVersion.id !== unit.configurationVersionId ||
      unit.configurationVersion.productId !== balance.productId ||
      !Number.isSafeInteger(unit.transactionScale) ||
      unit.transactionScale < 0 ||
      unit.transactionScale > 18 ||
      !Number.isSafeInteger(line.expectedRevision) ||
      line.expectedRevision < 0 ||
      line.expectedRevision >= Number.MAX_SAFE_INTEGER ||
      (balance.kind === "PACKAGED_STOCK"
        ? unit.stockBehavior !== "PACKAGED_STOCK"
        : balance.kind !== "SHARED_POOL" ||
          unit.stockBehavior !== "CANONICAL_SHARED" ||
          unit.factor.toFixed() !== "1")
    )
      conflict(
        "Closeout line custody, Product or unit ownership is inconsistent.",
      )
    lineIds.add(line.id)
    balanceIds.add(line.balanceSourceId)
    const q = quantities(line)
    const movement = byBalance.get(balance.id)
    if (q.variance === "0") {
      if (movement)
        conflict("A zero closeout line cannot own a stock movement.")
      continue
    }
    if (
      !movement ||
      q.effect === "0" ||
      movement.operationId !== operation.id ||
      movement.configurationVersionId !== unit.configurationVersionId ||
      movement.enteredInventoryUnitId !== unit.id ||
      movement.enteredInventoryUnit.id !== unit.id ||
      movement.enteredInventoryUnit.configurationVersionId !==
        unit.configurationVersionId ||
      movement.enteredInventoryUnit.configurationVersion.id !==
        unit.configurationVersionId ||
      movement.enteredInventoryUnit.configurationVersion.productId !==
        balance.productId ||
      movement.enteredInventoryUnit.stockBehavior !== unit.stockBehavior ||
      movement.enteredInventoryUnit.factor.toFixed() !==
        unit.factor.toFixed() ||
      movement.transactionScaleSnapshot !== unit.transactionScale ||
      movement.enteredInventoryUnit.transactionScale !==
        unit.transactionScale ||
      movement.unitFactorSnapshot.toFixed() !== unit.factor.toFixed() ||
      movement.enteredQuantity.toFixed() !==
        (q.variance.startsWith("-") ? q.variance.slice(1) : q.variance) ||
      movement.previousOnHandQuantity.toFixed() !== q.beforePhysical ||
      movement.resultingOnHandQuantity.toFixed() !== q.afterPhysical ||
      movement.signedCanonicalEffect.toFixed() !== q.effect ||
      movement.reversalOfMovementId !== null ||
      movement.purchaseReceipt !== null
    )
      conflict("Closeout movement differs from its original declared source.")
    byBalance.delete(balance.id)
    nonzeroLines.push({
      line,
      movement,
      before: q.before,
      after: q.after,
      effect: q.effect,
    })
  }
  if (byBalance.size)
    conflict("Closeout operation has a movement without an owning line.")
  return { closeout, operation, nonzeroLines, corrections }
}

/** Private immutable source proof. Caller owns Book/closeout/sorted stock locks. */
export async function resolveInventoryCloseoutSourceInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; closeoutId: string; expectedBookId?: string },
) {
  const closeout = await tx.inventoryCloseout.findFirst({
    where: { id: input.closeoutId, tenantId: input.tenantId },
    include: closeoutSourceInclude,
  })
  if (!closeout)
    throw new FinanceError("NOT_FOUND", "Inventory Closeout not found.")
  const source = resolveLoadedInventoryCloseoutSource(closeout, input.tenantId)
  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: input.tenantId,
        currencyCode: closeout.store.currencyCode,
      },
    },
  })
  if (
    (input.expectedBookId !== undefined && book?.id !== input.expectedBookId) ||
    (book &&
      (book.tenantId !== input.tenantId ||
        book.currencyCode !== closeout.store.currencyCode))
  )
    conflict("Closeout financial Book differs from its held context.")
  return { ...source, book }
}
