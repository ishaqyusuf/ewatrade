import { rememberRecordedProductReturn } from "./product-return-journal-source-snapshot"
import { consumeProductReturnSource } from "./product-return-source-snapshot"
import {
  compareExactDecimals,
  multiplyExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import { readHeldCommerceFinanceBook } from "../customer-ledger/commerce-locks"
import { FinanceError, assertFinancePostingDate } from "./rules"
import { productReturnValuationInclude } from "./product-return-evidence"
import { productReturnDestinationImpact } from "./product-return-destination-impact"
import { reviewOriginalProductReturnCost } from "./product-return-cost-source"
import {
  addQuantities,
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

export { allocateOriginalIssueReturnCost } from "./product-return-cost-plan"

async function loadReturnEvidence(tx: Prisma.TransactionClient, input: {
  tenantId: string; productReturnId: string; costSourceToken?: object
}, heldOrder?: HeldOrder) {
  if (input.costSourceToken) {
    const current = await tx.productReturn.findFirst({
      where: { id: input.productReturnId, tenantId: input.tenantId },
      include: { stockOperation: productReturnValuationInclude.stockOperation, financeCost: productReturnValuationInclude.financeCost },
    })
    if (!current) throw new FinanceError("NOT_FOUND", "Product return not found.")
    const source = consumeProductReturnSource(input.costSourceToken, tx, current)
    return { productReturn: { ...current, order: source.order, orderLine: source.line }, sourceBook: source.book }
  }
  const productReturn = await tx.productReturn.findFirst({
    where: { id: input.productReturnId, tenantId: input.tenantId },
    include: productReturnValuationInclude,
  })
  if (!productReturn) throw new FinanceError("NOT_FOUND", "Product return not found.")
  const sourceBook = heldOrder
    ? await readHeldCommerceFinanceBook(tx, heldOrder, { tenantId: input.tenantId, orderId: productReturn.orderId })
    : null
  return { productReturn, sourceBook }
}

type HeldOrder = Parameters<typeof readHeldCommerceFinanceBook>[1]

/**
 * Private Product return adapter. The owning Commerce transaction already
 * holds the FinanceBook, Order and destination-balance locks before calling.
 * Passing that held Order lock reuses its Book and hands this evidence to the
 * immediately following journal (`recordedValuation`).
 */
export async function recordProductReturnValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; productReturnId: string; costSourceToken?: object },
  heldOrder?: HeldOrder,
) {
  const { productReturn, sourceBook } = await loadReturnEvidence(tx, input, heldOrder)
  const result = await recordLoadedProductReturnValuation(tx, input, productReturn, sourceBook)
  // Valuation only writes cost/allocation/pool/event rows. Its Order, sold snapshot
  // and current movement remain unchanged until the immediately following journal.
  if (sourceBook && result) rememberRecordedProductReturn(result, tx, { book: sourceBook, productReturn })
  return result
}

async function recordLoadedProductReturnValuation(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; productReturnId: string },
  productReturn: Awaited<ReturnType<typeof loadReturnEvidence>>["productReturn"],
  sourceBook: Awaited<ReturnType<typeof loadReturnEvidence>>["sourceBook"],
) {
  const { order, orderLine: line } = productReturn
  const { snapshot } = line
  const book = sourceBook ?? await tx.financeBook.findUnique({
    where: { tenantId_currencyCode: { tenantId: input.tenantId, currencyCode: order.currencyCode } },
  })
  // Product returns remain supported in existing no-Book workspaces.
  if (!book) return null
  if (
    book.tenantId !== input.tenantId ||
    book.currencyCode !== order.currencyCode ||
    order.tenantId !== input.tenantId ||
    order.store.tenantId !== input.tenantId ||
    order.store.currencyCode !== order.currencyCode ||
    productReturn.orderId !== order.id ||
    productReturn.orderLineId !== line.id ||
    line.orderId !== order.id ||
    productReturn.storeId !== order.storeId ||
    line.kind !== "PRODUCT_UNIT" ||
    !snapshot ||
    snapshot.currencyCode !== order.currencyCode ||
    snapshot.offeringId !== line.offeringId ||
    snapshot.offeringKind !== "PRODUCT_UNIT" ||
    !snapshot.balanceSourceId ||
    !snapshot.inventoryUnitId ||
    !snapshot.configurationVersionId ||
    !snapshot.unitFactor ||
    compareExactDecimals(snapshot.unitFactor.toFixed(), "0") <= 0 ||
    !["CANONICAL_SHARED", "ALTERNATE_TRANSACTION", "PACKAGED_STOCK"].includes(
      snapshot.stockBehavior ?? "",
    )
  ) {
    conflict("Product return Order, Store or sold-unit scope changed.")
  }

  const canonicalReturned = normalizeQuantity(
    multiplyExactDecimals(
      productReturn.quantity.toFixed(),
      snapshot.unitFactor.toFixed(),
      18,
    ),
  )
  if (canonicalReturned === "0") {
    conflict("Product return quantity must be positive.")
  }

  const savedCost = productReturn.financeCost
  if (savedCost) {
    if (
      savedCost.tenantId !== input.tenantId ||
      savedCost.bookId !== book.id ||
      savedCost.orderLineId !== line.id ||
      savedCost.productReturnId !== productReturn.id ||
      normalizeQuantity(savedCost.canonicalQuantity.toFixed()) !==
        canonicalReturned ||
      (savedCost.sourceCostMinor === null) !==
        (savedCost.unknownReason !== null)
    ) {
      conflict("Saved Product return cost scope or quantity differs.")
    }
    if (
      productReturn.disposition === "RESTOCK" &&
      savedCost.valuationEvent &&
      (savedCost.valuationEvent.productReturnCostId !== savedCost.id ||
        savedCost.valuationEvent.sourceKind !== "PRODUCT_RETURN" ||
        savedCost.valuationEvent.sourceId !== productReturn.id ||
        savedCost.valuationEvent.kind !== "CUSTOMER_RETURN" ||
        savedCost.valuationEvent.tenantId !== input.tenantId ||
        savedCost.valuationEvent.bookId !== book.id ||
        savedCost.valuationEvent.stockOperationId !==
          productReturn.stockOperationId)
    ) {
      conflict("Saved Product return valuation event scope differs.")
    }
    // Replay returns its immutable saved snapshot; current stock averages are
    // deliberately not consulted or recomputed.
    return savedCost
  }

  const physicalReturnAt = productReturn.disposition === "RESTOCK"
    ? productReturn.stockOperation?.effectiveAt : productReturn.createdAt
  if (!physicalReturnAt) conflict("Product return is missing its physical return date.")
  const costPlan = reviewOriginalProductReturnCost({
    tenantId: input.tenantId, book, order, line, productReturn, physicalReturnAt,
  })

  const header = await tx.financeProductReturnCost.create({
    data: {
      tenantId: input.tenantId,
      bookId: book.id,
      orderLineId: line.id,
      productReturnId: productReturn.id,
      canonicalQuantity: canonicalReturned,
      sourceCostMinor: costPlan.sourceCostMinor,
      unknownReason: costPlan.unknownReason,
    },
  })
  for (const allocation of costPlan.allocations) {
    await tx.financeProductReturnCostAllocation.create({
      data: { ...allocation, returnCostId: header.id },
    })
  }

  if (productReturn.disposition !== "RESTOCK") return header

  const operation = productReturn.stockOperation
  const movement = operation?.movements[0]
  if (
    !operation ||
    !movement ||
    operation.movements.length !== 1 ||
    operation.id !== productReturn.stockOperationId ||
    operation.tenantId !== input.tenantId ||
    operation.storeId !== order.storeId ||
    operation.type !== "RETURN" ||
    operation.source !== "commercial_order_return" ||
    operation.actorUserId !== productReturn.actorUserId ||
    productReturn.destinationBalanceSourceId !== movement.balanceSourceId ||
    movement.reversalOfMovementId !== null ||
    movement.balanceSource.tenantId !== input.tenantId ||
    movement.balanceSource.storeId !== order.storeId ||
    movement.balanceSource.store.tenantId !== input.tenantId ||
    movement.balanceSource.store.currencyCode !== order.currencyCode ||
    movement.balanceSource.variantId !== snapshot.variantId ||
    (movement.balanceSourceId !== snapshot.balanceSourceId &&
      (movement.balanceSource.kind !== "PACKAGED_STOCK" ||
        movement.balanceSource.inventoryUnitId !== snapshot.inventoryUnitId)) ||
    movement.configurationVersionId !==
      (snapshot.configurationVersionId ??
        movement.balanceSource.inventoryUnit.configurationVersionId) ||
    movement.enteredInventoryUnitId !== snapshot.inventoryUnitId ||
    normalizeQuantity(movement.enteredQuantity.toFixed()) !==
      normalizeQuantity(productReturn.quantity.toFixed()) ||
    movement.unitFactorSnapshot.toFixed() !== snapshot.unitFactor.toFixed()
  ) {
    conflict("Product return stock movement does not match its sold unit.")
  }
  const balance = movement.balanceSource
  const before = canonicalQuantity(
    movement.previousOnHandQuantity,
    balance.kind,
    movement.unitFactorSnapshot,
  )
  const after = canonicalQuantity(
    movement.resultingOnHandQuantity,
    balance.kind,
    movement.unitFactorSnapshot,
  )
  const effect = signedQuantity(movement.signedCanonicalEffect)
  if (
    effect !== canonicalReturned ||
    addQuantities(before, canonicalReturned) !== after ||
    canonicalQuantity(
      balance.onHandQuantity,
      balance.kind,
      movement.unitFactorSnapshot,
    ) !== after
  ) {
    conflict("Product return stock movement quantity is inconsistent.")
  }
  const previousEvent = movement.valuationEvent
  if (previousEvent) {
    if (
      previousEvent.tenantId !== input.tenantId ||
      previousEvent.bookId !== book.id ||
      previousEvent.kind !== "CUSTOMER_RETURN" ||
      previousEvent.sourceKind !== "PRODUCT_RETURN" ||
      previousEvent.sourceId !== productReturn.id ||
      previousEvent.productReturnCostId !== header.id ||
      previousEvent.stockOperationId !== operation.id ||
      previousEvent.stockMovementId !== movement.id
    )
      conflict("Product return valuation event already differs.")
    return header
  }
  assertFinancePostingDate({
    effectiveAt: operation.effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })
  const pool = await tx.financeInventoryPool.findUnique({
    where: {
      bookId_balanceSourceId: { bookId: book.id, balanceSourceId: balance.id },
    },
  })
  const movementCount = await tx.stockMovement.count({
    where: { balanceSourceId: balance.id },
  })
  const { valueBeforeMinor, valueAfterMinor, sequence, resolvedUnknown, movementCountExact } =
    productReturnDestinationImpact({
      pool, before, movementCount, effectiveAt: operation.effectiveAt,
      sourceCostMinor: header.sourceCostMinor, sourceUnknownReason: header.unknownReason,
    })
  const poolData = {
    quantity: after,
    valueMinor: valueAfterMinor,
    unknownReason: resolvedUnknown,
    lastStockRevision: balance.revision,
    lastMovementCount: movementCountExact,
    lastSequence: sequence,
    latestEffectiveAt: operation.effectiveAt,
  }
  const currentPool = pool
    ? await tx.financeInventoryPool.update({
        where: { id: pool.id },
        data: poolData,
      })
    : await tx.financeInventoryPool.create({
        data: {
          ...poolData,
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
      kind: "CUSTOMER_RETURN",
      sourceKind: "PRODUCT_RETURN",
      sourceId: productReturn.id,
      stockOperationId: operation.id,
      stockMovementId: movement.id,
      productReturnCostId: header.id,
      canonicalEffect: effect,
      quantityBefore: before,
      quantityAfter: after,
      valueBeforeMinor,
      valueDeltaMinor:
        valueBeforeMinor === null || header.sourceCostMinor === null
          ? null
          : header.sourceCostMinor,
      valueAfterMinor,
      sourceCostMinor: header.sourceCostMinor,
      unknownReason: resolvedUnknown,
      effectiveAt: operation.effectiveAt,
      actorUserId: operation.actorUserId,
    },
  })
}
