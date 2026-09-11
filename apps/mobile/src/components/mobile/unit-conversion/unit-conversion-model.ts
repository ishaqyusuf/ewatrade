import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import {
  addExactDecimals,
  compareExactDecimals,
  EXACT_QUANTITY_MAX_SCALE,
  multiplyExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"

export type ConversionBalance =
  RouterOutputs["inventory"]["balanceReport"]["rows"][number]
export type ConversionInput =
  RouterInputs["inventory"]["transformPackagedStock"]
export type ConversionProps = {
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}
export type ConversionDraft = {
  sourceId: string
  targetId: string
  sourceQuantity: string
  targetQuantity: string
  reason: string
}
export const EMPTY_CONVERSION: ConversionDraft = {
  sourceId: "",
  targetId: "",
  sourceQuantity: "",
  targetQuantity: "",
  reason: "",
}
export type ConversionProjection = {
  sourceQuantity: string
  targetQuantity: string
  canonicalQuantity: string
  sourceAfter: string
  targetAfter: string
}
export type ConversionReview = {
  source: ConversionBalance
  target: ConversionBalance
  projection: ConversionProjection
  reason: string
  businessId: string
  userId: string
  storeId: string
}

export function compatibleConversionTarget(
  source: ConversionBalance,
  target: ConversionBalance,
) {
  return (
    source.kind === "PACKAGED_STOCK" &&
    target.kind === "PACKAGED_STOCK" &&
    source.balanceSourceId !== target.balanceSourceId &&
    source.storeId === target.storeId &&
    source.productId === target.productId &&
    source.variantId === target.variantId &&
    source.configurationVersionId === target.configurationVersionId
  )
}

export function conversionCustody(balance: ConversionBalance) {
  const labels = {
    STORE: "Central store",
    STAFF: "Staff",
    SESSION: "Session",
    TRANSIT: "In transit",
  }
  return balance.custodyType === "STORE"
    ? labels.STORE
    : `${labels[balance.custodyType]} · ${balance.custodyReferenceId ?? "Unspecified"}`
}

export function projectConversion(
  source: ConversionBalance | undefined,
  target: ConversionBalance | undefined,
  sourceValue: string,
  targetValue: string,
): { value: ConversionProjection | null; error: string | null } {
  if (!source || !target)
    return { value: null, error: "Choose source and target packaged balances." }
  if (!compatibleConversionTarget(source, target))
    return {
      value: null,
      error:
        "Choose different packaged balances for the same Store, Product, variant and configuration.",
    }
  if (sourceValue.length > 40 || targetValue.length > 40)
    return {
      value: null,
      error: "Keep each exact quantity to 40 characters or fewer.",
    }
  try {
    const sourceQuantity = parseExactDecimal(sourceValue.trim(), {
      allowZero: false,
      maxScale: Math.min(
        EXACT_QUANTITY_MAX_SCALE,
        source.inventoryUnitTransactionScale,
      ),
    })
    const targetQuantity = parseExactDecimal(targetValue.trim(), {
      allowZero: false,
      maxScale: Math.min(
        EXACT_QUANTITY_MAX_SCALE,
        target.inventoryUnitTransactionScale,
      ),
    })
    const sourceCanonical = multiplyExactDecimals(
      sourceQuantity,
      source.inventoryUnitFactor,
    )
    const targetCanonical = multiplyExactDecimals(
      targetQuantity,
      target.inventoryUnitFactor,
    )
    if (compareExactDecimals(sourceCanonical, targetCanonical) !== 0)
      return {
        value: null,
        error:
          "The two quantities must conserve the same exact canonical amount. Record any loss separately as an Adjustment.",
      }
    if (compareExactDecimals(sourceQuantity, source.availableQuantity) > 0)
      return {
        value: null,
        error:
          "The source balance does not have enough available stock after reservations.",
      }
    return {
      value: {
        sourceQuantity,
        targetQuantity,
        canonicalQuantity: sourceCanonical,
        sourceAfter: subtractExactDecimals(
          source.onHandQuantity,
          sourceQuantity,
        ),
        targetAfter: addExactDecimals(target.onHandQuantity, targetQuantity),
      },
      error: null,
    }
  } catch (failure) {
    return {
      value: null,
      error:
        failure instanceof Error
          ? failure.message
          : "Enter positive exact quantities at each unit's supported precision.",
    }
  }
}

export function conversionCommand(
  review: ConversionReview,
  clientOperationId: string,
): ConversionInput {
  return {
    clientOperationId,
    expectedConfigurationVersionId: review.source.configurationVersionId,
    reason: review.reason,
    schemaVersion: 1,
    source: "mobile_inventory",
    storeId: review.storeId,
    sourceBalanceRevision: review.source.revision,
    sourceBalanceSourceId: review.source.balanceSourceId,
    sourceQuantity: review.projection.sourceQuantity,
    targetBalanceRevision: review.target.revision,
    targetBalanceSourceId: review.target.balanceSourceId,
    targetQuantity: review.projection.targetQuantity,
  }
}
