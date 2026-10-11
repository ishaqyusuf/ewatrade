import {
  compareExactDecimals,
  multiplyExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { FinanceError, assertFinancePostingDate } from "./rules"
import { productReturnValuationInclude } from "./product-return-evidence"
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

/**
 * Private Product return adapter. The owning Commerce transaction already
 * holds the FinanceBook, Order and destination-balance locks before calling.
 */
export async function recordProductReturnValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; productReturnId: string },
) {
  const productReturn = await tx.productReturn.findFirst({
    where: { id: input.productReturnId, tenantId: input.tenantId },
    include: productReturnValuationInclude,
  })
  if (!productReturn) {
    throw new FinanceError("NOT_FOUND", "Product return not found.")
  }

  const { order, orderLine: line } = productReturn
  const { snapshot } = line
  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: input.tenantId,
        currencyCode: order.currencyCode,
      },
    },
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
  if (pool && operation.effectiveAt < pool.latestEffectiveAt) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A Product return cannot precede its latest valuation event.",
    )
  }
  const movementCount = await tx.stockMovement.count({
    where: { balanceSourceId: balance.id },
  })
  if (!Number.isSafeInteger(movementCount) || movementCount < 1) {
    conflict("Inventory movement history cannot be counted.")
  }
  const movementCountExact = BigInt(movementCount)
  let valueBeforeMinor: bigint | null = null
  let poolUnknown: FinanceInventoryUnknownReason | null = null
  if (!pool) {
    if (before === "0" && movementCountExact === BigInt(1))
      valueBeforeMinor = ZERO
    else
      poolUnknown =
        before === "0" ? "UNCAPTURED_MOVEMENTS" : "MISSING_OPENING_COST"
  } else if (
    normalizeQuantity(pool.quantity.toFixed()) !== before ||
    pool.lastMovementCount + BigInt(1) !== movementCountExact
  ) {
    poolUnknown = "UNCAPTURED_MOVEMENTS"
  } else if (pool.valueMinor === null) {
    poolUnknown = pool.unknownReason ?? "PRIOR_UNKNOWN_COST"
  } else {
    if (
      pool.valueMinor < ZERO ||
      pool.valueMinor > MAX_DATABASE_MINOR ||
      pool.unknownReason !== null
    ) {
      conflict("The inventory valuation pool is inconsistent.")
    }
    valueBeforeMinor = pool.valueMinor
  }
  const valueAfterMinor =
    valueBeforeMinor === null || header.sourceCostMinor === null
      ? null
      : valueBeforeMinor + header.sourceCostMinor
  if (valueAfterMinor !== null && valueAfterMinor > MAX_DATABASE_MINOR) {
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Inventory carrying value exceeds its limit.",
    )
  }
  const sequence = (pool?.lastSequence ?? ZERO) + BigInt(1)
  if (sequence > MAX_DATABASE_MINOR)
    conflict("Inventory valuation sequence exceeds its limit.")
  const resolvedUnknown =
    poolUnknown ??
    (header.sourceCostMinor === null ? header.unknownReason : null)
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
