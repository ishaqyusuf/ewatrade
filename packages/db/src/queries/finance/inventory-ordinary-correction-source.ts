import {
  compareExactDecimals,
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import type { FinanceInventoryUnknownReason } from "../../../generated/prisma/enums"
import { FinanceError } from "./rules"
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
type CorrectionCost = Pick<
  ValuationEvent,
  | "sourceCostMinor"
  | "valueBeforeMinor"
  | "valueDeltaMinor"
  | "valueAfterMinor"
  | "unknownReason"
>

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

function signedQuantity(value: string) {
  const negative = value.startsWith("-")
  const magnitude = normalizeQuantity(negative ? value.slice(1) : value)
  return negative && magnitude !== "0" ? `-${magnitude}` : magnitude
}

function canonicalQuantity(
  quantity: string,
  factor: string,
  packaged: boolean,
) {
  return normalizeQuantity(
    packaged ? multiplyExactDecimals(quantity, factor, 18) : quantity,
  )
}

function validatedEnteredQuantity(value: string, scale: number) {
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > 6)
    conflict("Ordinary stock unit scale is inconsistent.")
  return parseExactDecimal(value, { allowZero: false, maxScale: scale })
}

function eventCostStateIsValid(event: {
  sourceCostMinor: bigint | null
  valueBeforeMinor: bigint | null
  valueDeltaMinor: bigint | null
  valueAfterMinor: bigint | null
  unknownReason: FinanceInventoryUnknownReason | null
}) {
  for (const value of [
    event.sourceCostMinor,
    event.valueBeforeMinor,
    event.valueDeltaMinor,
    event.valueAfterMinor,
  ]) {
    if (value !== null && (value < MIN_MINOR || value > MAX_MINOR)) return false
  }
  if (
    [event.sourceCostMinor, event.valueBeforeMinor, event.valueAfterMinor].some(
      (value) => value !== null && value < ZERO,
    )
  )
    return false
  const known =
    event.sourceCostMinor !== null &&
    event.valueBeforeMinor !== null &&
    event.valueDeltaMinor !== null &&
    event.valueAfterMinor !== null &&
    event.unknownReason === null
  const unknown =
    event.sourceCostMinor === null &&
    event.valueDeltaMinor === null &&
    event.valueAfterMinor === null &&
    event.unknownReason !== null &&
    (event.valueBeforeMinor === null ||
      (event.valueBeforeMinor >= ZERO && event.valueBeforeMinor <= MAX_MINOR))
  const retainedKnownSourceCost =
    event.sourceCostMinor !== null &&
    event.valueBeforeMinor === null &&
    event.valueDeltaMinor === null &&
    event.valueAfterMinor === null &&
    event.unknownReason !== null
  return known || unknown || retainedKnownSourceCost
}

function requireSourceEvent(
  event: ValuationEvent,
  expected: {
    tenantId: string
    bookId: string
    balanceSourceId: string
    stockOperationId: string
    stockMovementId: string
    sourceKind: "ORDINARY_STOCK_OPERATION" | "ORDINARY_STOCK_CORRECTION"
    sourceId: string
    effect: string
    before: string
    after: string
    effectiveAt: Date
    actorUserId: string
    sequenceAfter?: bigint
  },
) {
  if (
    event.tenantId !== expected.tenantId ||
    event.bookId !== expected.bookId ||
    event.poolId.length === 0 ||
    event.balanceSourceId !== expected.balanceSourceId ||
    event.sequence <= ZERO ||
    event.sequence > MAX_MINOR ||
    (expected.sequenceAfter !== undefined &&
      event.sequence !== expected.sequenceAfter) ||
    event.kind !== "ADJUSTMENT" ||
    event.sourceKind !== expected.sourceKind ||
    event.sourceId !== expected.sourceId ||
    event.stockOperationId !== expected.stockOperationId ||
    event.stockMovementId !== expected.stockMovementId ||
    event.pool.id !== event.poolId ||
    event.pool.tenantId !== expected.tenantId ||
    event.pool.bookId !== expected.bookId ||
    event.pool.balanceSourceId !== expected.balanceSourceId ||
    event.purchaseReceiptId !== null ||
    event.productReturnCostId !== null ||
    signedQuantity(event.canonicalEffect.toFixed()) !== expected.effect ||
    normalizeQuantity(event.quantityBefore.toFixed()) !== expected.before ||
    normalizeQuantity(event.quantityAfter.toFixed()) !== expected.after ||
    event.effectiveAt.getTime() !== expected.effectiveAt.getTime() ||
    event.actorUserId !== expected.actorUserId ||
    !eventCostStateIsValid(event)
  )
    conflict("Ordinary stock correction valuation provenance is inconsistent.")
}

function validateOrdinaryOriginalEvent(
  event: ValuationEvent,
  input: {
    effect: string
    before: string
    after: string
  },
) {
  const negative = input.effect.startsWith("-")
  if (
    !eventCostStateIsValid(event) ||
    (!negative && event.sourceCostMinor !== null) ||
    (!negative && event.unknownReason !== "UNCAPTURED_MOVEMENTS") ||
    (negative &&
      event.sourceCostMinor === null &&
      event.valueBeforeMinor !== null)
  )
    conflict("The original ordinary movement has an invalid saved cost state.")

  if (event.sourceCostMinor !== null) {
    if (
      event.valueBeforeMinor === null ||
      event.valueDeltaMinor === null ||
      event.valueAfterMinor === null ||
      event.valueBeforeMinor + event.valueDeltaMinor !== event.valueAfterMinor
    )
      conflict("The original ordinary movement cost does not conserve value.")
    let issue: ReturnType<typeof calculateWeightedAverageIssue>
    try {
      issue = calculateWeightedAverageIssue({
        quantityBefore: input.before,
        valueBeforeMinor: event.valueBeforeMinor,
        quantityIssued: subtractQuantities(input.before, input.after),
      })
    } catch {
      conflict("The original ordinary withdrawal cost cannot be verified.")
    }
    if (
      !negative ||
      event.sourceCostMinor !== issue.valueIssuedMinor ||
      event.valueDeltaMinor !== -issue.valueIssuedMinor ||
      event.valueAfterMinor !== issue.valueAfterMinor
    )
      conflict("The original ordinary withdrawal allocation is inconsistent.")
  }
}

function validateCorrectionLegCost(
  event: ValuationEvent,
  input: {
    quantityBefore: string
    quantityAfter: string
    effect: string
    requiredSourceCost?: bigint | null
    gainSourceCost?: bigint | null
  },
) {
  const negative = input.effect.startsWith("-")
  if (!negative) {
    const sourceCost = input.gainSourceCost ?? null
    if (sourceCost !== null) {
      if (event.valueBeforeMinor === null) {
        if (
          event.sourceCostMinor !== sourceCost ||
          event.valueDeltaMinor !== null ||
          event.valueAfterMinor !== null ||
          event.unknownReason === null
        )
          conflict("The original-cost correction restoration is inconsistent.")
        return
      }
      if (
        event.sourceCostMinor !== sourceCost ||
        event.valueDeltaMinor !== sourceCost ||
        event.valueAfterMinor !== event.valueBeforeMinor + sourceCost ||
        event.unknownReason !== null
      )
        conflict("The original-cost correction restoration is inconsistent.")
      return
    }
    if (
      event.sourceCostMinor !== null ||
      event.valueDeltaMinor !== null ||
      event.valueAfterMinor !== null ||
      event.unknownReason === null
    )
      conflict("An unsupported correction gain cannot acquire cost.")
    return
  }

  if (event.valueBeforeMinor === null) {
    if (
      event.valueDeltaMinor !== null ||
      event.valueAfterMinor !== null ||
      event.unknownReason === null ||
      (input.requiredSourceCost !== undefined &&
        event.sourceCostMinor !== input.requiredSourceCost) ||
      (input.requiredSourceCost === undefined && event.sourceCostMinor !== null)
    )
      conflict("Unknown correction value cannot be replayed consistently.")
    return
  }
  let issue: ReturnType<typeof calculateWeightedAverageIssue>
  try {
    issue = calculateWeightedAverageIssue({
      quantityBefore: input.quantityBefore,
      valueBeforeMinor: event.valueBeforeMinor,
      quantityIssued: subtractQuantities(
        input.quantityBefore,
        input.quantityAfter,
      ),
    })
  } catch {
    conflict("Correction withdrawal cost cannot be derived from its pool.")
  }
  if (
    event.sourceCostMinor !== issue.valueIssuedMinor ||
    event.valueDeltaMinor !== -issue.valueIssuedMinor ||
    event.valueAfterMinor !== issue.valueAfterMinor ||
    event.unknownReason !== null ||
    (input.requiredSourceCost !== undefined &&
      event.sourceCostMinor !== input.requiredSourceCost)
  )
    conflict("Correction withdrawal allocation is inconsistent.")
}

export const ordinaryCorrectionSourceInclude = {
  store: { select: { id: true, tenantId: true, currencyCode: true } },
  committedReservation: { select: { id: true } },
  _count: {
    select: {
      purchaseReceipts: true,
      productFulfillments: true,
      productReturns: true,
      finalizedCounts: true,
      dispatchedTransfers: true,
      receivedTransfers: true,
      cancelledTransfers: true,
      finalizedCloseouts: true,
    },
  },
  correctionOf: {
    include: {
      store: { select: { id: true, tenantId: true, currencyCode: true } },
      committedReservation: { select: { id: true } },
      _count: {
        select: {
          purchaseReceipts: true,
          productFulfillments: true,
          productReturns: true,
          finalizedCounts: true,
          dispatchedTransfers: true,
          receivedTransfers: true,
          cancelledTransfers: true,
          finalizedCloseouts: true,
          corrections: true,
        },
      },
      movements: {
        include: {
          balanceSource: {
            include: {
              store: {
                select: { id: true, tenantId: true, currencyCode: true },
              },
              inventoryUnit: {
                include: {
                  configurationVersion: { select: { productId: true } },
                },
              },
            },
          },
          enteredInventoryUnit: {
            include: {
              configurationVersion: { select: { productId: true } },
            },
          },
          purchaseReceipt: { select: { id: true } },
          valuationEvent: { include: { pool: true } },
        },
      },
    },
  },
  movements: {
    include: {
      balanceSource: {
        include: {
          store: { select: { id: true, tenantId: true, currencyCode: true } },
          inventoryUnit: {
            include: {
              configurationVersion: { select: { productId: true } },
            },
          },
        },
      },
      enteredInventoryUnit: {
        include: {
          configurationVersion: { select: { productId: true } },
        },
      },
      purchaseReceipt: { select: { id: true } },
      valuationEvent: { include: { pool: true } },
    },
  },
} satisfies Prisma.StockOperationInclude

export type OrdinaryCorrectionSourceOperation =
  Prisma.StockOperationGetPayload<{
    include: typeof ordinaryCorrectionSourceInclude
  }>

/** Immutable source proof shared by fresh correction writer and historical reader. */
export function resolveLoadedOrdinaryCorrectionSource(
  correction: OrdinaryCorrectionSourceOperation,
  tenantId: string,
  book: { id: string; tenantId: string; currencyCode: string },
) {
  try {
    return resolveOriginal(correction, tenantId, book)
  } catch (error) {
    if (error instanceof FinanceError) throw error
    conflict("Ordinary correction retained quantities or factors are invalid.")
  }
}
function resolveOriginal(
  correction: OrdinaryCorrectionSourceOperation,
  tenantId: string,
  book: { id: string; tenantId: string; currencyCode: string },
) {
  if (
    correction.type !== "CORRECTION" ||
    !correction.correctionOf ||
    correction.correctionOfOperationId !== correction.correctionOf.id
  )
    conflict("Stock operation is not a source-owned correction.")
  const original = correction.correctionOf
  const store = correction.store
  if (
    book.tenantId !== tenantId ||
    book.currencyCode !== store.currencyCode ||
    store.tenantId !== tenantId ||
    original.tenantId !== tenantId ||
    original.storeId !== store.id ||
    original.store.tenantId !== tenantId ||
    original.store.currencyCode !== store.currencyCode ||
    correction.tenantId !== tenantId ||
    correction.storeId !== store.id ||
    correction.store.tenantId !== tenantId ||
    (original.type !== "RECEIPT" &&
      original.type !== "RETURN" &&
      original.type !== "ADJUSTMENT") ||
    original.correctionOfOperationId !== null ||
    original.committedReservation != null ||
    correction.committedReservation != null ||
    original.movements.length !== 1 ||
    original._count.purchaseReceipts !== 0 ||
    original._count.productFulfillments !== 0 ||
    original._count.productReturns !== 0 ||
    original._count.finalizedCounts !== 0 ||
    original._count.dispatchedTransfers !== 0 ||
    original._count.receivedTransfers !== 0 ||
    original._count.cancelledTransfers !== 0 ||
    original._count.finalizedCloseouts !== 0 ||
    original._count.corrections !== 1 ||
    correction._count.purchaseReceipts !== 0 ||
    correction._count.productFulfillments !== 0 ||
    correction._count.productReturns !== 0 ||
    correction._count.finalizedCounts !== 0 ||
    correction._count.dispatchedTransfers !== 0 ||
    correction._count.receivedTransfers !== 0 ||
    correction._count.cancelledTransfers !== 0 ||
    correction._count.finalizedCloseouts !== 0 ||
    !Number.isFinite(correction.effectiveAt.getTime()) ||
    !Number.isFinite(original.effectiveAt.getTime()) ||
    correction.effectiveAt < original.effectiveAt
  )
    conflict(
      "Stock correction is not linked to an eligible ordinary operation.",
    )

  const originalMovement = original.movements[0]
  if (!originalMovement)
    conflict("The original ordinary operation has no movement.")
  const targetEvent = originalMovement.valuationEvent
  const balance = originalMovement.balanceSource
  if (
    (balance.kind !== "SHARED_POOL" && balance.kind !== "PACKAGED_STOCK") ||
    originalMovement.purchaseReceipt !== null ||
    originalMovement.reversalOfMovementId !== null ||
    originalMovement.operationId !== original.id ||
    originalMovement.balanceSourceId !== balance.id ||
    originalMovement.balanceSource.id !== balance.id ||
    balance.tenantId !== tenantId ||
    balance.storeId !== store.id ||
    balance.store.tenantId !== tenantId ||
    balance.store.currencyCode !== store.currencyCode ||
    originalMovement.enteredInventoryUnit.configurationVersion.productId !==
      balance.productId ||
    balance.inventoryUnit.configurationVersion.productId !==
      balance.productId ||
    originalMovement.enteredInventoryUnit.id !==
      originalMovement.enteredInventoryUnitId ||
    originalMovement.enteredInventoryUnit.configurationVersion.productId !==
      balance.inventoryUnit.configurationVersion.productId ||
    (targetEvent !== null &&
      (targetEvent.sourceKind !== "ORDINARY_STOCK_OPERATION" ||
        targetEvent.sourceId !== original.id ||
        original.effectiveAt.getTime() !== targetEvent.effectiveAt.getTime()))
  )
    conflict("The target movement is not an ordinary registered source.")

  const factor = normalizeQuantity(
    originalMovement.unitFactorSnapshot.toFixed(),
  )
  const originalEntered = normalizeQuantity(
    originalMovement.enteredQuantity.toFixed(),
  )
  const originalEffect = signedQuantity(
    originalMovement.signedCanonicalEffect.toFixed(),
  )
  const originalCanonical = normalizeQuantity(
    multiplyExactDecimals(originalEntered, factor, 18),
  )
  const originalBefore = canonicalQuantity(
    originalMovement.previousOnHandQuantity.toFixed(),
    factor,
    balance.kind === "PACKAGED_STOCK",
  )
  const originalAfter = canonicalQuantity(
    originalMovement.resultingOnHandQuantity.toFixed(),
    factor,
    balance.kind === "PACKAGED_STOCK",
  )
  validatedEnteredQuantity(
    originalMovement.enteredQuantity.toFixed(),
    originalMovement.transactionScaleSnapshot,
  )
  if (
    originalEntered === "0" ||
    factor === "0" ||
    compareExactDecimals(factor, "0") <= 0 ||
    originalEffect === "0" ||
    signedQuantity(originalEffect).replace(/^-/, "") !== originalCanonical ||
    (originalMovement.enteredInventoryUnitId === balance.inventoryUnitId &&
      originalMovement.unitFactorSnapshot.toFixed() !==
        balance.inventoryUnit.factor.toFixed()) ||
    originalMovement.configurationVersionId !==
      originalMovement.enteredInventoryUnit.configurationVersionId ||
    originalMovement.configurationVersionId !==
      balance.inventoryUnit.configurationVersionId ||
    originalMovement.transactionScaleSnapshot !==
      originalMovement.enteredInventoryUnit.transactionScale ||
    originalMovement.enteredInventoryUnit.factor.toFixed() !==
      originalMovement.unitFactorSnapshot.toFixed() ||
    (balance.kind === "PACKAGED_STOCK" &&
      (originalMovement.enteredInventoryUnitId !== balance.inventoryUnitId ||
        originalMovement.enteredInventoryUnit.stockBehavior !==
          "PACKAGED_STOCK")) ||
    (balance.kind === "SHARED_POOL" &&
      originalMovement.enteredInventoryUnit.stockBehavior === "PACKAGED_STOCK")
  )
    conflict("Original ordinary movement unit or effect is inconsistent.")

  const originalEffectNegative = originalEffect.startsWith("-")
  if (
    originalEffectNegative
      ? subtractQuantities(originalBefore, originalCanonical) !== originalAfter
      : addQuantities(originalBefore, originalCanonical) !== originalAfter
  )
    conflict("Original ordinary movement quantity chain is inconsistent.")

  if (targetEvent) {
    requireSourceEvent(targetEvent, {
      tenantId: tenantId,
      bookId: book.id,
      balanceSourceId: balance.id,
      stockOperationId: original.id,
      stockMovementId: originalMovement.id,
      sourceKind: "ORDINARY_STOCK_OPERATION",
      sourceId: original.id,
      effect: originalEffect,
      before: originalBefore,
      after: originalAfter,
      effectiveAt: original.effectiveAt,
      actorUserId: original.actorUserId,
    })
    validateOrdinaryOriginalEvent(targetEvent, {
      effect: originalEffect,
      before: originalBefore,
      after: originalAfter,
    })
  }

  if (correction.movements.length !== 2)
    conflict("An ordinary stock correction requires a complete movement pair.")
  const inverseMovement = correction.movements.find(
    (movement) => movement.reversalOfMovementId === originalMovement.id,
  )
  const replacementMovement = correction.movements.find(
    (movement) => movement.id !== inverseMovement?.id,
  )
  if (!inverseMovement || !replacementMovement)
    conflict("The stock correction inverse and replacement are incomplete.")

  const inverseEffect = signedQuantity(
    inverseMovement.signedCanonicalEffect.toFixed(),
  )
  const replacementEffect = signedQuantity(
    replacementMovement.signedCanonicalEffect.toFixed(),
  )
  const inverseEntered = normalizeQuantity(
    inverseMovement.enteredQuantity.toFixed(),
  )
  const replacementEntered = normalizeQuantity(
    replacementMovement.enteredQuantity.toFixed(),
  )
  const inverseBeforePhysical = normalizeQuantity(
    inverseMovement.previousOnHandQuantity.toFixed(),
  )
  const inverseAfterPhysical = normalizeQuantity(
    inverseMovement.resultingOnHandQuantity.toFixed(),
  )
  const replacementBeforePhysical = normalizeQuantity(
    replacementMovement.previousOnHandQuantity.toFixed(),
  )
  const replacementAfterPhysical = normalizeQuantity(
    replacementMovement.resultingOnHandQuantity.toFixed(),
  )
  validatedEnteredQuantity(
    inverseMovement.enteredQuantity.toFixed(),
    inverseMovement.transactionScaleSnapshot,
  )
  validatedEnteredQuantity(
    replacementMovement.enteredQuantity.toFixed(),
    replacementMovement.transactionScaleSnapshot,
  )
  const expectedInverseEffect = originalEffectNegative
    ? originalCanonical
    : `-${originalCanonical}`
  const replacementCanonical = normalizeQuantity(
    multiplyExactDecimals(replacementEntered, factor, 18),
  )
  const expectedReplacementEffect = originalEffectNegative
    ? `-${replacementCanonical}`
    : replacementCanonical
  const inverseBalanceDelta =
    balance.kind === "PACKAGED_STOCK" ? inverseEntered : originalCanonical
  const replacementBalanceDelta =
    balance.kind === "PACKAGED_STOCK"
      ? replacementEntered
      : replacementCanonical
  const intermediateCanonical = canonicalQuantity(
    inverseAfterPhysical,
    factor,
    balance.kind === "PACKAGED_STOCK",
  )
  const finalCanonical = canonicalQuantity(
    replacementAfterPhysical,
    factor,
    balance.kind === "PACKAGED_STOCK",
  )
  const inverseCanonicalBefore = canonicalQuantity(
    inverseBeforePhysical,
    factor,
    balance.kind === "PACKAGED_STOCK",
  )
  if (
    inverseMovement.operationId !== correction.id ||
    replacementMovement.operationId !== correction.id ||
    inverseMovement.balanceSourceId !== balance.id ||
    replacementMovement.balanceSourceId !== balance.id ||
    inverseMovement.balanceSource.id !== balance.id ||
    replacementMovement.balanceSource.id !== balance.id ||
    inverseMovement.balanceSource.tenantId !== tenantId ||
    replacementMovement.balanceSource.tenantId !== tenantId ||
    inverseMovement.balanceSource.store.tenantId !== tenantId ||
    replacementMovement.balanceSource.store.tenantId !== tenantId ||
    inverseMovement.balanceSource.storeId !== store.id ||
    replacementMovement.balanceSource.storeId !== store.id ||
    inverseMovement.balanceSource.store.currencyCode !== store.currencyCode ||
    replacementMovement.balanceSource.store.currencyCode !==
      store.currencyCode ||
    inverseMovement.purchaseReceipt !== null ||
    replacementMovement.purchaseReceipt !== null ||
    inverseMovement.enteredInventoryUnit.id !==
      inverseMovement.enteredInventoryUnitId ||
    replacementMovement.enteredInventoryUnit.id !==
      replacementMovement.enteredInventoryUnitId ||
    inverseMovement.enteredInventoryUnit.configurationVersionId !==
      inverseMovement.configurationVersionId ||
    replacementMovement.enteredInventoryUnit.configurationVersionId !==
      replacementMovement.configurationVersionId ||
    inverseMovement.enteredInventoryUnit.configurationVersion.productId !==
      originalMovement.enteredInventoryUnit.configurationVersion.productId ||
    replacementMovement.enteredInventoryUnit.configurationVersion.productId !==
      originalMovement.enteredInventoryUnit.configurationVersion.productId ||
    inverseMovement.configurationVersionId !==
      originalMovement.configurationVersionId ||
    replacementMovement.configurationVersionId !==
      originalMovement.configurationVersionId ||
    inverseMovement.enteredInventoryUnitId !==
      originalMovement.enteredInventoryUnitId ||
    replacementMovement.enteredInventoryUnitId !==
      originalMovement.enteredInventoryUnitId ||
    inverseMovement.transactionScaleSnapshot !==
      originalMovement.transactionScaleSnapshot ||
    replacementMovement.transactionScaleSnapshot !==
      originalMovement.transactionScaleSnapshot ||
    inverseMovement.unitFactorSnapshot.toFixed() !==
      originalMovement.unitFactorSnapshot.toFixed() ||
    replacementMovement.unitFactorSnapshot.toFixed() !==
      originalMovement.unitFactorSnapshot.toFixed() ||
    inverseEffect !== expectedInverseEffect ||
    replacementMovement.reversalOfMovementId !== null ||
    replacementEffect.startsWith("-") !== originalEffectNegative ||
    replacementEffect !== expectedReplacementEffect ||
    inverseEntered !== originalEntered ||
    replacementEntered === "0" ||
    (originalEffectNegative
      ? addQuantities(inverseBeforePhysical, inverseBalanceDelta) !==
        inverseAfterPhysical
      : subtractQuantities(inverseBeforePhysical, inverseBalanceDelta) !==
        inverseAfterPhysical) ||
    replacementBeforePhysical !== inverseAfterPhysical ||
    (originalEffectNegative
      ? subtractQuantities(
          replacementBeforePhysical,
          replacementBalanceDelta,
        ) !== replacementAfterPhysical
      : addQuantities(replacementBeforePhysical, replacementBalanceDelta) !==
        replacementAfterPhysical)
  )
    conflict(
      "Stock correction movement unit or quantity chain is inconsistent.",
    )

  return {
    correction,
    original,
    store,
    book,
    balance,
    originalMovement,
    targetEvent,
    factor,
    originalEffectNegative,
    originalCanonical,
    replacementCanonical,
    inverseMovement,
    replacementMovement,
    inverseEffect,
    replacementEffect,
    inverseBeforePhysical,
    inverseAfterPhysical,
    replacementAfterPhysical,
    intermediateCanonical,
    finalCanonical,
    inverseCanonicalBefore,
  }
}

export function readSavedOrdinaryCorrectionSource(
  source: ReturnType<typeof resolveLoadedOrdinaryCorrectionSource>,
) {
  const {
    correction,
    original,
    store,
    book,
    balance,
    originalMovement,
    targetEvent,
    factor,
    originalEffectNegative,
    originalCanonical,
    replacementCanonical,
    inverseMovement,
    replacementMovement,
    inverseEffect,
    replacementEffect,
    inverseBeforePhysical,
    inverseAfterPhysical,
    replacementAfterPhysical,
    intermediateCanonical,
    finalCanonical,
    inverseCanonicalBefore,
  } = source
  const tenantId = book.tenantId
  const inverseEvent = inverseMovement.valuationEvent
  const replacementEvent = replacementMovement.valuationEvent
  if (Boolean(inverseEvent) !== Boolean(replacementEvent))
    conflict("Stock correction valuation is only partially registered.")
  const inverseCanonicalEffect = inverseEffect
  const inverseAfterCanonical = intermediateCanonical
  if (inverseEvent && replacementEvent) {
    requireSourceEvent(inverseEvent, {
      tenantId: tenantId,
      bookId: book.id,
      balanceSourceId: balance.id,
      stockOperationId: correction.id,
      stockMovementId: inverseMovement.id,
      sourceKind: "ORDINARY_STOCK_CORRECTION",
      sourceId: correction.id,
      effect: inverseCanonicalEffect,
      before: inverseCanonicalBefore,
      after: inverseAfterCanonical,
      effectiveAt: correction.effectiveAt,
      actorUserId: correction.actorUserId,
    })
    requireSourceEvent(replacementEvent, {
      tenantId: tenantId,
      bookId: book.id,
      balanceSourceId: balance.id,
      stockOperationId: correction.id,
      stockMovementId: replacementMovement.id,
      sourceKind: "ORDINARY_STOCK_CORRECTION",
      sourceId: correction.id,
      effect: replacementEffect,
      before: inverseAfterCanonical,
      after: finalCanonical,
      effectiveAt: correction.effectiveAt,
      actorUserId: correction.actorUserId,
      sequenceAfter: inverseEvent.sequence + BigInt(1),
    })
    if (
      inverseEvent.poolId !== replacementEvent.poolId ||
      (targetEvent !== null &&
        (inverseEvent.poolId !== targetEvent.poolId ||
          inverseEvent.sequence <= targetEvent.sequence))
    )
      conflict("Stock correction valuation legs do not share a pool.")

    validateCorrectionLegCost(inverseEvent, {
      quantityBefore: inverseCanonicalBefore,
      quantityAfter: inverseAfterCanonical,
      effect: inverseEffect,
      gainSourceCost: originalEffectNegative
        ? (targetEvent?.sourceCostMinor ?? null)
        : null,
    })
    if (replacementEvent.valueBeforeMinor !== inverseEvent.valueAfterMinor)
      conflict("Stock correction value chain is inconsistent.")
    validateCorrectionLegCost(replacementEvent, {
      quantityBefore: inverseAfterCanonical,
      quantityAfter: finalCanonical,
      effect: replacementEffect,
    })
    if (
      !replacementEffect.startsWith("-") &&
      replacementEvent.unknownReason !== "UNCAPTURED_MOVEMENTS"
    )
      conflict("An unsupported replacement gain must remain uncosted.")
    if (
      targetEvent === null &&
      [inverseEvent, replacementEvent].some(
        (event) =>
          event.sourceCostMinor !== null ||
          event.valueBeforeMinor !== null ||
          event.valueDeltaMinor !== null ||
          event.valueAfterMinor !== null ||
          event.unknownReason === null,
      )
    )
      conflict(
        "An unregistered original movement cannot acquire correction cost.",
      )
    return { inverseEvent, replacementEvent }
  }

  return null
}
