import {
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import {
  calculateWeightedAverageIssue,
  normalizeQuantity as normalizeExactQuantity,
  subtractQuantities,
} from "./valuation-math"

const ZERO = BigInt(0)
const MAX_MINOR = BigInt("9223372036854775807")
export const reservationCommitSourceInclude = {
  store: { select: { id: true, tenantId: true, currencyCode: true } },
  committedReservation: {
    include: {
      offering: {
        select: {
          id: true,
          tenantId: true,
          variantId: true,
          productUnitOffering: { select: { inventoryUnitId: true } },
        },
      },
      _count: { select: { productFulfillments: true } },
    },
  },
  movements: {
    include: {
      balanceSource: {
        include: {
          store: { select: { id: true, tenantId: true, currencyCode: true } },
          product: {
            select: {
              id: true,
              catalogItemId: true,
              catalogItem: { select: { id: true, tenantId: true } },
            },
          },
          variant: { select: { id: true, catalogItemId: true } },
          inventoryUnit: { include: { configurationVersion: true } },
        },
      },
      enteredInventoryUnit: { include: { configurationVersion: true } },
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
} satisfies Prisma.StockOperationInclude

export type ReservationCommitSourceOperation = Prisma.StockOperationGetPayload<{
  include: typeof reservationCommitSourceInclude
}>
type Operation = ReservationCommitSourceOperation
type Movement = Operation["movements"][number]
type Balance = Movement["balanceSource"]
type Event = NonNullable<Movement["valuationEvent"]>

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

function normalizeQuantity(value: string) {
  try {
    return normalizeExactQuantity(value)
  } catch {
    conflict("Reservation quantity is outside the exact supported bounds.")
  }
}

export function reservationCanonicalQuantity(
  value: Prisma.Decimal,
  balance: Balance,
) {
  try {
    return normalizeQuantity(
      balance.kind === "PACKAGED_STOCK"
        ? multiplyExactDecimals(
            value.toFixed(),
            balance.inventoryUnit.factor.toFixed(),
            18,
          )
        : value.toFixed(),
    )
  } catch {
    conflict("Reservation canonical quantity is invalid.")
  }
}

function savedCostIsValid(
  event: Event,
  before: string,
  after: string,
  quantity: string,
) {
  if (
    [event.sourceCostMinor, event.valueBeforeMinor, event.valueAfterMinor].some(
      (value) => value !== null && (value < ZERO || value > MAX_MINOR),
    ) ||
    (event.valueDeltaMinor !== null &&
      (event.valueDeltaMinor < -MAX_MINOR ||
        event.valueDeltaMinor > MAX_MINOR)) ||
    (after === "0" &&
      event.valueAfterMinor !== null &&
      event.valueAfterMinor !== ZERO)
  )
    return false
  if (event.valueBeforeMinor === null)
    return (
      event.sourceCostMinor === null &&
      event.valueDeltaMinor === null &&
      event.valueAfterMinor === null &&
      event.unknownReason !== null
    )
  const issue = calculateWeightedAverageIssue({
    quantityBefore: before,
    valueBeforeMinor: event.valueBeforeMinor,
    quantityIssued: quantity,
  })
  return (
    event.unknownReason === null &&
    event.sourceCostMinor === issue.valueIssuedMinor &&
    event.valueDeltaMinor === -issue.valueIssuedMinor &&
    event.valueAfterMinor === issue.valueAfterMinor
  )
}

/** Immutable original standalone owner proof, shared by fresh writer and private reader. */
export function resolveLoadedReservationCommitSource(
  operation: ReservationCommitSourceOperation,
  tenantId: string,
  book: { id: string; tenantId: string; currencyCode: string },
) {
  const reservation = operation.committedReservation
  const movement = operation.movements[0]
  const { corrections, ...otherOwners } = operation._count
  if (
    !reservation ||
    !movement ||
    operation.movements.length !== 1 ||
    Object.values(otherOwners).some((count) => count !== 0) ||
    operation.type !== "RESERVATION_COMMIT" ||
    operation.correctionOfOperationId !== null ||
    operation.tenantId !== tenantId ||
    operation.storeId !== operation.store.id ||
    operation.store.tenantId !== tenantId ||
    book.tenantId !== tenantId ||
    book.currencyCode !== operation.store.currencyCode ||
    !operation.actorUserId.trim() ||
    !Number.isFinite(operation.effectiveAt.getTime()) ||
    reservation.tenantId !== tenantId ||
    reservation.storeId !== operation.storeId ||
    reservation.committedOperationId !== operation.id ||
    reservation.committedAt?.getTime() !== operation.effectiveAt.getTime() ||
    reservation.commercialOrderLineId !== null ||
    reservation._count.productFulfillments !== 0 ||
    reservation.offeringId !== reservation.offering.id ||
    reservation.offering.tenantId !== tenantId ||
    reservation.offering.productUnitOffering?.inventoryUnitId !==
      reservation.enteredInventoryUnitId
  ) {
    conflict("Reservation commitment is not an owned standalone withdrawal.")
  }
  const balance = movement.balanceSource
  const unit = movement.enteredInventoryUnit
  if (
    movement.operationId !== operation.id ||
    movement.balanceSourceId !== reservation.balanceSourceId ||
    balance.id !== reservation.balanceSourceId ||
    balance.tenantId !== tenantId ||
    balance.storeId !== operation.storeId ||
    balance.store.id !== operation.storeId ||
    balance.store.tenantId !== tenantId ||
    balance.store.currencyCode !== book.currencyCode ||
    balance.custodyType !== "STORE" ||
    balance.custodyReferenceId !== "" ||
    balance.parentBalanceSourceId !== null ||
    balance.product.id !== balance.productId ||
    balance.product.catalogItemId !== balance.product.catalogItem.id ||
    balance.product.catalogItem.tenantId !== tenantId ||
    balance.variant.id !== balance.variantId ||
    balance.variant.catalogItemId !== balance.product.catalogItemId ||
    reservation.offering.variantId !== balance.variantId ||
    (balance.kind !== "PACKAGED_STOCK" && balance.kind !== "SHARED_POOL") ||
    balance.inventoryUnitId !== balance.inventoryUnit.id ||
    balance.inventoryUnit.configurationVersion.id !==
      balance.inventoryUnit.configurationVersionId ||
    balance.inventoryUnit.configurationVersion.productId !==
      balance.productId ||
    movement.enteredInventoryUnitId !== reservation.enteredInventoryUnitId ||
    unit.id !== reservation.enteredInventoryUnitId ||
    movement.configurationVersionId !== reservation.configurationVersionId ||
    unit.configurationVersionId !== reservation.configurationVersionId ||
    unit.configurationVersion.id !== reservation.configurationVersionId ||
    unit.configurationVersion.productId !== balance.productId ||
    balance.inventoryUnit.configurationVersionId !==
      reservation.configurationVersionId ||
    !Number.isSafeInteger(unit.transactionScale) ||
    unit.transactionScale < 0 ||
    unit.transactionScale > 18 ||
    movement.transactionScaleSnapshot !== unit.transactionScale ||
    movement.enteredQuantity.toFixed() !==
      reservation.enteredQuantity.toFixed() ||
    movement.unitFactorSnapshot.toFixed() !==
      reservation.unitFactorSnapshot.toFixed() ||
    unit.factor.toFixed() !== reservation.unitFactorSnapshot.toFixed() ||
    movement.reversalOfMovementId !== null ||
    movement.purchaseReceipt !== null ||
    (balance.kind === "PACKAGED_STOCK" &&
      (unit.stockBehavior !== "PACKAGED_STOCK" ||
        unit.id !== balance.inventoryUnitId)) ||
    (balance.kind === "SHARED_POOL" &&
      (unit.stockBehavior === "PACKAGED_STOCK" ||
        balance.inventoryUnit.stockBehavior !== "CANONICAL_SHARED" ||
        balance.inventoryUnit.factor.toFixed() !== "1"))
  ) {
    conflict("Reservation commitment stock or immutable unit proof changed.")
  }
  let quantity: string
  try {
    const factor = normalizeQuantity(reservation.unitFactorSnapshot.toFixed())
    if (factor === "0") conflict("Reservation unit factor must be positive.")
    const entered = parseExactDecimal(reservation.enteredQuantity.toFixed(), {
      allowZero: false,
      maxScale: unit.transactionScale,
    })
    quantity = normalizeQuantity(multiplyExactDecimals(entered, factor, 18))
  } catch {
    conflict("Reservation entered quantity or factor is invalid.")
  }
  const before = reservationCanonicalQuantity(
    movement.previousOnHandQuantity,
    balance,
  )
  const after = reservationCanonicalQuantity(
    movement.resultingOnHandQuantity,
    balance,
  )
  if (
    quantity === "0" ||
    quantity !== normalizeQuantity(reservation.canonicalQuantity.toFixed()) ||
    movement.signedCanonicalEffect.toFixed() !== `-${quantity}` ||
    before === "0" ||
    !matchesWithdrawal(before, quantity, after)
  )
    conflict("Reservation commitment quantity snapshots do not match.")

  return {
    operation,
    reservation,
    movement,
    balance,
    unit,
    corrections,
    book,
    quantity,
    before,
    after,
  }
}

export function assertSavedReservationCommitSource(
  source: ReturnType<typeof resolveLoadedReservationCommitSource>,
) {
  const {
    operation,
    reservation,
    movement,
    balance,
    book,
    quantity,
    before,
    after,
  } = source
  const event = movement.valuationEvent
  if (!event) conflict("Saved reservation cost is missing.")
  if (
    event.tenantId !== book.tenantId ||
    event.bookId !== book.id ||
    event.balanceSourceId !== balance.id ||
    event.poolId !== event.pool.id ||
    event.pool.tenantId !== book.tenantId ||
    event.pool.bookId !== book.id ||
    event.pool.balanceSourceId !== balance.id ||
    event.kind !== "ISSUE" ||
    event.sourceKind !== "STOCK_RESERVATION_COMMIT" ||
    event.sourceId !== reservation.id ||
    event.stockOperationId !== operation.id ||
    event.stockMovementId !== movement.id ||
    event.purchaseReceiptId !== null ||
    event.productReturnCostId !== null ||
    event.actorUserId !== operation.actorUserId ||
    event.effectiveAt.getTime() !== operation.effectiveAt.getTime() ||
    event.sequence <= ZERO ||
    event.sequence > MAX_MINOR ||
    event.canonicalEffect.toFixed() !== `-${quantity}` ||
    normalizeQuantity(event.quantityBefore.toFixed()) !== before ||
    normalizeQuantity(event.quantityAfter.toFixed()) !== after ||
    !savedCostIsValid(event, before, after, quantity)
  )
    conflict("Saved reservation cost differs from its immutable source.")
  return event
}

function matchesWithdrawal(before: string, quantity: string, after: string) {
  try {
    return subtractQuantities(before, quantity) === after
  } catch {
    return false
  }
}
