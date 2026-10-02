import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { FinanceError, assertFinancePostingDate } from "./rules"
import {
  calculateWeightedAverageIssue,
  normalizeQuantity,
  subtractQuantities,
} from "./valuation-math"

const MAX_DATABASE_MINOR = BigInt("9223372036854775807")

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

/**
 * Internal Product fulfillment adapter. The Commerce caller has already
 * acquired the existing FinanceBook lock before committing stock.
 */
export async function recordProductFulfillmentValuationInTransaction(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; fulfillmentId: string },
) {
  const fulfillment = await tx.productFulfillment.findFirst({
    where: {
      id: input.fulfillmentId,
      orderLine: { order: { tenantId: input.tenantId } },
    },
    include: {
      orderLine: {
        include: {
          order: { include: { store: true } },
          snapshot: true,
        },
      },
      reservation: { include: { balanceSource: true } },
      stockOperation: {
        include: {
          movements: {
            include: {
              balanceSource: { include: { store: true } },
              valuationEvent: true,
            },
          },
        },
      },
    },
  })
  if (!fulfillment) {
    throw new FinanceError("NOT_FOUND", "Product fulfillment not found.")
  }

  const { orderLine, reservation, stockOperation: operation } = fulfillment
  const { order, snapshot } = orderLine
  const book = await tx.financeBook.findUnique({
    where: {
      tenantId_currencyCode: {
        tenantId: input.tenantId,
        currencyCode: order.currencyCode,
      },
    },
  })
  // Existing Commerce stock operations remain supported where no FinanceBook
  // exists. In that mode this private adapter adds no costing requirements.
  if (!book) return null
  if (
    book.tenantId !== input.tenantId ||
    book.currencyCode !== order.currencyCode
  ) {
    conflict("Product fulfillment FinanceBook scope changed.")
  }
  if (!snapshot)
    conflict("Product fulfillment is missing its sold-unit snapshot.")

  if (
    orderLine.kind !== "PRODUCT_UNIT" ||
    order.tenantId !== input.tenantId ||
    order.store.tenantId !== input.tenantId ||
    snapshot.currencyCode !== order.currencyCode ||
    order.store.currencyCode !== order.currencyCode ||
    reservation.tenantId !== input.tenantId ||
    reservation.storeId !== order.storeId ||
    reservation.commercialOrderLineId !== orderLine.id ||
    reservation.status !== "COMMITTED" ||
    reservation.offeringId !== orderLine.offeringId ||
    reservation.offeringId !== snapshot.offeringId ||
    normalizeQuantity(fulfillment.quantity.toFixed()) !==
      normalizeQuantity(orderLine.quantity.toFixed()) ||
    normalizeQuantity(reservation.enteredQuantity.toFixed()) !==
      normalizeQuantity(orderLine.quantity.toFixed()) ||
    reservation.balanceSourceId !== snapshot.balanceSourceId ||
    reservation.configurationVersionId !== snapshot.configurationVersionId ||
    reservation.enteredInventoryUnitId !== snapshot.inventoryUnitId ||
    !snapshot.unitFactor ||
    reservation.unitFactorSnapshot.toFixed() !==
      snapshot.unitFactor.toFixed() ||
    !["CANONICAL_SHARED", "ALTERNATE_TRANSACTION", "PACKAGED_STOCK"].includes(
      snapshot.stockBehavior ?? "",
    ) ||
    normalizeQuantity(snapshot.unitFactor.toFixed()) === "0"
  ) {
    conflict("Product fulfillment linkage or scope changed.")
  }

  if (
    operation.id !== fulfillment.stockOperationId ||
    operation.tenantId !== input.tenantId ||
    operation.storeId !== order.storeId ||
    operation.type !== "SALE_FULFILLMENT" ||
    operation.source !== "commercial_order"
  ) {
    conflict("Product fulfillment stock provenance changed.")
  }

  const movement = operation.movements.find(
    (candidate) => candidate.balanceSourceId === reservation.balanceSourceId,
  )
  if (
    operation.movements.length !== 1 ||
    !movement ||
    movement.configurationVersionId !== reservation.configurationVersionId ||
    movement.enteredInventoryUnitId !== reservation.enteredInventoryUnitId ||
    normalizeQuantity(movement.enteredQuantity.toFixed()) !==
      normalizeQuantity(reservation.enteredQuantity.toFixed()) ||
    movement.unitFactorSnapshot.toFixed() !==
      reservation.unitFactorSnapshot.toFixed() ||
    movement.balanceSource.id !== reservation.balanceSourceId ||
    movement.balanceSource.tenantId !== input.tenantId ||
    movement.balanceSource.storeId !== order.storeId ||
    movement.balanceSource.store.tenantId !== input.tenantId ||
    movement.balanceSource.store.currencyCode !== order.currencyCode ||
    movement.balanceSource.variantId !== snapshot.variantId ||
    (movement.balanceSource.kind === "PACKAGED_STOCK" &&
      movement.balanceSource.inventoryUnitId !== snapshot.inventoryUnitId) ||
    (snapshot.stockBehavior === "PACKAGED_STOCK"
      ? movement.balanceSource.kind !== "PACKAGED_STOCK"
      : movement.balanceSource.kind !== "SHARED_POOL")
  ) {
    conflict("Product fulfillment movement does not match its reservation.")
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
  const issued = normalizeQuantity(reservation.canonicalQuantity.toFixed())
  if (
    issued === "0" ||
    effect !== `-${issued}` ||
    subtractQuantities(before, issued) !== after ||
    normalizeQuantity(
      multiplyExactDecimals(
        reservation.enteredQuantity.toFixed(),
        reservation.unitFactorSnapshot.toFixed(),
        18,
      ),
    ) !== issued
  ) {
    conflict("Product fulfillment quantity snapshots are inconsistent.")
  }

  const previous = movement.valuationEvent
  if (previous) {
    if (
      previous.tenantId !== input.tenantId ||
      previous.bookId !== book.id ||
      previous.balanceSourceId !== balance.id ||
      previous.kind !== "ISSUE" ||
      previous.sourceKind !== "PRODUCT_FULFILLMENT" ||
      previous.sourceId !== fulfillment.id ||
      previous.stockOperationId !== operation.id ||
      previous.stockMovementId !== movement.id ||
      previous.effectiveAt.getTime() !== operation.effectiveAt.getTime() ||
      previous.actorUserId !== operation.actorUserId ||
      signedQuantity(previous.canonicalEffect) !== effect ||
      normalizeQuantity(previous.quantityBefore.toFixed()) !== before ||
      normalizeQuantity(previous.quantityAfter.toFixed()) !== after
    ) {
      conflict("Product fulfillment valuation source already differs.")
    }
    return previous
  }

  const effectiveAt = operation.effectiveAt
  assertFinancePostingDate({
    effectiveAt,
    startsAt: book.startsAt,
    closedThrough: book.closedThrough,
    now: new Date(),
  })

  const pool = await tx.financeInventoryPool.findUnique({
    where: {
      bookId_balanceSourceId: {
        bookId: book.id,
        balanceSourceId: balance.id,
      },
    },
  })
  if (pool && effectiveAt < pool.latestEffectiveAt) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "A Product issue cannot precede its latest valuation event.",
    )
  }

  const movementCount = await tx.stockMovement.count({
    where: { balanceSourceId: balance.id },
  })
  if (!Number.isSafeInteger(movementCount) || movementCount < 1) {
    conflict("Inventory movement history cannot be counted.")
  }
  const movementCountExact = BigInt(movementCount)
  // Do not infer movement ownership from timestamps or IDs: multiple Order
  // lines can commit at the same DB timestamp. Current quantity plus the pool's
  // movement-count continuity determine whether prior history is covered.
  if (
    canonicalQuantity(
      balance.onHandQuantity,
      balance.kind,
      movement.unitFactorSnapshot,
    ) !== after
  ) {
    conflict("Product fulfillment is no longer the current stock quantity.")
  }

  let valueBeforeMinor: bigint | null = null
  let unknownReason: FinanceInventoryUnknownReason | null = null
  if (!pool) {
    if (before !== "0") unknownReason = "MISSING_OPENING_COST"
    else if (movementCountExact !== BigInt(1)) {
      unknownReason = "UNCAPTURED_MOVEMENTS"
    } else valueBeforeMinor = BigInt(0)
  } else if (
    normalizeQuantity(pool.quantity.toFixed()) !== before ||
    pool.lastMovementCount + BigInt(1) !== movementCountExact
  ) {
    unknownReason = "UNCAPTURED_MOVEMENTS"
  } else if (pool.valueMinor === null) {
    unknownReason = pool.unknownReason ?? "PRIOR_UNKNOWN_COST"
  } else {
    if (
      pool.valueMinor < BigInt(0) ||
      pool.valueMinor > MAX_DATABASE_MINOR ||
      pool.unknownReason !== null
    ) {
      conflict("The inventory valuation pool is inconsistent.")
    }
    valueBeforeMinor = pool.valueMinor
  }

  let quantityAfter = subtractQuantities(before, issued)
  let valueDeltaMinor: bigint | null = null
  let valueAfterMinor: bigint | null = null
  if (valueBeforeMinor !== null) {
    const issue = calculateWeightedAverageIssue({
      quantityBefore: before,
      valueBeforeMinor,
      quantityIssued: issued,
    })
    quantityAfter = issue.quantityAfter
    valueDeltaMinor = -issue.valueIssuedMinor
    valueAfterMinor = issue.valueAfterMinor
  }

  const sequence = (pool?.lastSequence ?? BigInt(0)) + BigInt(1)
  if (sequence > MAX_DATABASE_MINOR) {
    conflict("Inventory valuation sequence exceeds its limit.")
  }
  const data = {
    quantity: quantityAfter,
    valueMinor: valueAfterMinor,
    unknownReason,
    lastStockRevision: balance.revision,
    lastMovementCount: movementCountExact,
    lastSequence: sequence,
    latestEffectiveAt: effectiveAt,
  }
  const currentPool = pool
    ? await tx.financeInventoryPool.update({ where: { id: pool.id }, data })
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
      kind: "ISSUE",
      sourceKind: "PRODUCT_FULFILLMENT",
      sourceId: fulfillment.id,
      stockOperationId: operation.id,
      stockMovementId: movement.id,
      canonicalEffect: effect,
      quantityBefore: before,
      quantityAfter: after,
      valueBeforeMinor,
      valueDeltaMinor,
      valueAfterMinor,
      sourceCostMinor: valueDeltaMinor === null ? null : -valueDeltaMinor,
      unknownReason,
      effectiveAt,
      actorUserId: operation.actorUserId,
    },
  })
}
