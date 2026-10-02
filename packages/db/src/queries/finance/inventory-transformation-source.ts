import { multiplyExactDecimals } from "@ewatrade/utils/exact-decimal"
import type { Prisma } from "../../../generated/prisma/client"
import { FinanceError } from "./rules"
import {
  addQuantities,
  calculateWeightedAverageIssue,
  normalizeQuantity,
  subtractQuantities,
} from "./valuation-math"
const MAX_DATABASE_MINOR = BigInt("9223372036854775807")
const MIN_DATABASE_MINOR = BigInt("-9223372036854775808")
const ZERO = BigInt(0)
function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}
const scopeStore = {
  select: { id: true, tenantId: true, currencyCode: true },
} as const
export const transformationSourceInclude = {
  store: scopeStore,
  movements: {
    include: {
      balanceSource: { include: { store: scopeStore, inventoryUnit: true } },
      valuationEvent: true,
    },
  },
} satisfies Prisma.StockOperationInclude
export type TransformationSourceOperation = Prisma.StockOperationGetPayload<{
  include: typeof transformationSourceInclude
}>
export function transformationCanonicalQuantity(
  quantity: Prisma.Decimal,
  factor: Prisma.Decimal,
) {
  return normalizeQuantity(
    multiplyExactDecimals(quantity.toFixed(), factor.toFixed(), 18),
  )
}

function signedQuantity(value: Prisma.Decimal) {
  const text = value.toFixed()
  return text.startsWith("-")
    ? `-${normalizeQuantity(text.slice(1))}`
    : normalizeQuantity(text)
}

type ValuationEvent = NonNullable<
  TransformationSourceOperation["movements"][number]["valuationEvent"]
>

function validMinorValue(value: bigint | null) {
  return (
    value === null ||
    (value >= MIN_DATABASE_MINOR && value <= MAX_DATABASE_MINOR)
  )
}

function validExistingEvent(
  event: ValuationEvent,
  expected: {
    tenantId: string
    bookId: string
    balanceSourceId: string
    kind: "TRANSFER_OUT" | "TRANSFER_IN"
    stockOperationId: string
    stockMovementId: string
    sourceId: string
    effect: string
    before: string
    after: string
    effectiveAt: Date
    actorUserId: string
  },
) {
  return (
    event.tenantId === expected.tenantId &&
    event.bookId === expected.bookId &&
    event.poolId.length > 0 &&
    event.balanceSourceId === expected.balanceSourceId &&
    event.sequence > ZERO &&
    event.sequence <= MAX_DATABASE_MINOR &&
    event.kind === expected.kind &&
    event.sourceKind === "PACKAGED_TRANSFORMATION" &&
    event.sourceId === expected.sourceId &&
    event.stockOperationId === expected.stockOperationId &&
    event.stockMovementId === expected.stockMovementId &&
    event.purchaseReceiptId === null &&
    event.productReturnCostId === null &&
    signedQuantity(event.canonicalEffect) === expected.effect &&
    normalizeQuantity(event.quantityBefore.toFixed()) === expected.before &&
    normalizeQuantity(event.quantityAfter.toFixed()) === expected.after &&
    event.effectiveAt.getTime() === expected.effectiveAt.getTime() &&
    event.actorUserId === expected.actorUserId
  )
}

function validReplayPair(
  source: ValuationEvent,
  target: ValuationEvent,
  sourceBefore: string,
  sourceAfter: string,
  targetBefore: string,
  targetAfter: string,
) {
  if (
    !validMinorValue(source.valueBeforeMinor) ||
    !validMinorValue(source.valueDeltaMinor) ||
    !validMinorValue(source.valueAfterMinor) ||
    !validMinorValue(target.valueBeforeMinor) ||
    !validMinorValue(target.valueDeltaMinor) ||
    !validMinorValue(target.valueAfterMinor) ||
    [
      source.valueBeforeMinor,
      source.valueAfterMinor,
      target.valueBeforeMinor,
      target.valueAfterMinor,
    ].some((value) => value !== null && value < ZERO)
  ) {
    return false
  }

  if (
    source.sourceCostMinor !== target.sourceCostMinor ||
    (source.sourceCostMinor !== null &&
      (source.sourceCostMinor < ZERO ||
        source.sourceCostMinor > MAX_DATABASE_MINOR))
  ) {
    return false
  }

  const sourceCost = source.sourceCostMinor
  if (source.valueBeforeMinor === null) {
    if (
      source.valueDeltaMinor !== null ||
      source.valueAfterMinor !== null ||
      sourceCost !== null ||
      source.unknownReason === null
    ) {
      return false
    }
  } else {
    let issue: ReturnType<typeof calculateWeightedAverageIssue>
    try {
      issue = calculateWeightedAverageIssue({
        quantityBefore: sourceBefore,
        valueBeforeMinor: source.valueBeforeMinor,
        quantityIssued: subtractQuantities(sourceBefore, sourceAfter),
      })
    } catch {
      return false
    }
    if (
      source.unknownReason !== null ||
      sourceCost !== issue.valueIssuedMinor ||
      source.valueDeltaMinor !== -issue.valueIssuedMinor ||
      source.valueAfterMinor !== issue.valueAfterMinor
    ) {
      return false
    }
  }

  if (target.valueBeforeMinor === null) {
    if (
      target.valueDeltaMinor !== null ||
      target.valueAfterMinor !== null ||
      target.unknownReason === null
    ) {
      return false
    }
  } else if (sourceCost === null) {
    if (
      target.valueDeltaMinor !== null ||
      target.valueAfterMinor !== null ||
      target.unknownReason === null
    ) {
      return false
    }
  } else {
    const expectedAfter = target.valueBeforeMinor + sourceCost
    if (
      expectedAfter > MAX_DATABASE_MINOR ||
      target.valueDeltaMinor !== sourceCost ||
      target.valueAfterMinor !== expectedAfter ||
      target.unknownReason !== null
    ) {
      return false
    }
  }

  return (
    normalizeQuantity(source.quantityBefore.toFixed()) === sourceBefore &&
    normalizeQuantity(source.quantityAfter.toFixed()) === sourceAfter &&
    normalizeQuantity(target.quantityBefore.toFixed()) === targetBefore &&
    normalizeQuantity(target.quantityAfter.toFixed()) === targetAfter
  )
}

/** Complete original paired quantity/source proof, shared by fresh writer and private reader. */
export function resolveLoadedPackagedTransformationSource(
  operation: TransformationSourceOperation,
  tenantId: string,
  book: { id: string; tenantId: string; currencyCode: string },
) {
  try {
    return resolveOriginal(operation, tenantId, book)
  } catch (error) {
    if (error instanceof FinanceError) throw error
    conflict("Transformation retained quantities or factors are invalid.")
  }
}
function resolveOriginal(
  operation: TransformationSourceOperation,
  tenantId: string,
  book: { id: string; tenantId: string; currencyCode: string },
) {
  const store = operation.store
  if (
    book.tenantId !== tenantId ||
    book.currencyCode !== store.currencyCode ||
    operation.tenantId !== tenantId ||
    store.tenantId !== tenantId ||
    operation.storeId !== store.id ||
    operation.type !== "TRANSFORMATION" ||
    operation.movements.length !== 2
  ) {
    conflict("Packaged transformation scope or movement count changed.")
  }

  const [first, second] = operation.movements
  if (!first || !second || first.balanceSourceId === second.balanceSourceId) {
    conflict("Packaged transformation requires two distinct balances.")
  }
  const firstEffect = signedQuantity(first.signedCanonicalEffect)
  const sourceMovement = firstEffect.startsWith("-") ? first : second
  const targetMovement = sourceMovement === first ? second : first
  const sourceEffect = signedQuantity(sourceMovement.signedCanonicalEffect)
  const targetEffect = signedQuantity(targetMovement.signedCanonicalEffect)
  if (!sourceEffect.startsWith("-") || targetEffect.startsWith("-")) {
    conflict(
      "Transformation movements must have opposite source and target signs.",
    )
  }

  const sourceBalance = sourceMovement.balanceSource
  const targetBalance = targetMovement.balanceSource
  if (
    sourceMovement.operationId !== operation.id ||
    targetMovement.operationId !== operation.id ||
    sourceMovement.balanceSourceId !== sourceBalance.id ||
    targetMovement.balanceSourceId !== targetBalance.id ||
    sourceBalance.id === targetBalance.id ||
    sourceBalance.tenantId !== tenantId ||
    targetBalance.tenantId !== tenantId ||
    sourceBalance.storeId !== store.id ||
    targetBalance.storeId !== store.id ||
    sourceBalance.store.tenantId !== tenantId ||
    targetBalance.store.tenantId !== tenantId ||
    sourceBalance.store.currencyCode !== store.currencyCode ||
    targetBalance.store.currencyCode !== store.currencyCode ||
    sourceBalance.kind !== "PACKAGED_STOCK" ||
    targetBalance.kind !== "PACKAGED_STOCK" ||
    sourceBalance.productId !== targetBalance.productId ||
    sourceBalance.variantId !== targetBalance.variantId ||
    sourceMovement.configurationVersionId !==
      targetMovement.configurationVersionId ||
    sourceMovement.configurationVersionId !==
      sourceBalance.inventoryUnit.configurationVersionId ||
    targetMovement.configurationVersionId !==
      targetBalance.inventoryUnit.configurationVersionId ||
    sourceMovement.enteredInventoryUnitId !== sourceBalance.inventoryUnitId ||
    targetMovement.enteredInventoryUnitId !== targetBalance.inventoryUnitId ||
    sourceMovement.transactionScaleSnapshot !==
      sourceBalance.inventoryUnit.transactionScale ||
    targetMovement.transactionScaleSnapshot !==
      targetBalance.inventoryUnit.transactionScale ||
    sourceMovement.unitFactorSnapshot.toFixed() !==
      sourceBalance.inventoryUnit.factor.toFixed() ||
    targetMovement.unitFactorSnapshot.toFixed() !==
      targetBalance.inventoryUnit.factor.toFixed() ||
    sourceMovement.reversalOfMovementId !== null ||
    targetMovement.reversalOfMovementId !== null
  ) {
    conflict("Transformation balances, units or ownership do not match.")
  }

  const sourceBefore = transformationCanonicalQuantity(
    sourceMovement.previousOnHandQuantity,
    sourceMovement.unitFactorSnapshot,
  )
  const sourceAfter = transformationCanonicalQuantity(
    sourceMovement.resultingOnHandQuantity,
    sourceMovement.unitFactorSnapshot,
  )
  const sourceCanonical = transformationCanonicalQuantity(
    sourceMovement.enteredQuantity,
    sourceMovement.unitFactorSnapshot,
  )
  const targetBefore = transformationCanonicalQuantity(
    targetMovement.previousOnHandQuantity,
    targetMovement.unitFactorSnapshot,
  )
  const targetAfter = transformationCanonicalQuantity(
    targetMovement.resultingOnHandQuantity,
    targetMovement.unitFactorSnapshot,
  )
  const targetCanonical = transformationCanonicalQuantity(
    targetMovement.enteredQuantity,
    targetMovement.unitFactorSnapshot,
  )
  if (
    sourceCanonical === "0" ||
    sourceCanonical !== targetCanonical ||
    sourceEffect !== `-${sourceCanonical}` ||
    targetEffect !== targetCanonical ||
    subtractQuantities(sourceBefore, sourceCanonical) !== sourceAfter ||
    targetAfter !== addQuantities(targetBefore, targetCanonical)
  ) {
    conflict("Transformation movement quantities are inconsistent.")
  }

  return {
    operation,
    book,
    sourceMovement,
    targetMovement,
    sourceBalance,
    targetBalance,
    sourceEffect,
    targetEffect,
    sourceBefore,
    sourceAfter,
    sourceCanonical,
    targetBefore,
    targetAfter,
    targetCanonical,
  }
}
export function readSavedPackagedTransformationSource(
  source: ReturnType<typeof resolveLoadedPackagedTransformationSource>,
) {
  const {
    operation,
    book,
    sourceMovement,
    targetMovement,
    sourceBalance,
    targetBalance,
    sourceEffect,
    targetEffect,
    sourceBefore,
    sourceAfter,
    targetBefore,
    targetAfter,
  } = source
  const effectiveAt = operation.effectiveAt
  const existingSource = sourceMovement.valuationEvent
  const existingTarget = targetMovement.valuationEvent
  if (Boolean(existingSource) !== Boolean(existingTarget)) {
    conflict("Transformation valuation is only partially registered.")
  }
  if (existingSource && existingTarget) {
    if (
      !validExistingEvent(existingSource, {
        tenantId: book.tenantId,
        bookId: book.id,
        balanceSourceId: sourceBalance.id,
        kind: "TRANSFER_OUT",
        stockOperationId: operation.id,
        stockMovementId: sourceMovement.id,
        sourceId: operation.id,
        effect: sourceEffect,
        before: sourceBefore,
        after: sourceAfter,
        effectiveAt,
        actorUserId: operation.actorUserId,
      }) ||
      !validExistingEvent(existingTarget, {
        tenantId: book.tenantId,
        bookId: book.id,
        balanceSourceId: targetBalance.id,
        kind: "TRANSFER_IN",
        stockOperationId: operation.id,
        stockMovementId: targetMovement.id,
        sourceId: operation.id,
        effect: targetEffect,
        before: targetBefore,
        after: targetAfter,
        effectiveAt,
        actorUserId: operation.actorUserId,
      }) ||
      !validReplayPair(
        existingSource,
        existingTarget,
        sourceBefore,
        sourceAfter,
        targetBefore,
        targetAfter,
      )
    ) {
      conflict("Saved transformation valuation pair differs from its source.")
    }
    return { sourceEvent: existingSource, targetEvent: existingTarget }
  }

  return null
}
