export type WholeUnitConversionInput = {
  sourceMultiplier: number | null | undefined
  sourceQuantity: number
  targetMultiplier: number | null | undefined
}

export type WholeUnitConversion = {
  sourceBaseQuantity: number
  targetQuantity: number
}

const CONVERSION_EPSILON = 1e-9

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

export function calculateWholeUnitConversion(
  input: WholeUnitConversionInput,
): WholeUnitConversion | null {
  if (
    !Number.isSafeInteger(input.sourceQuantity) ||
    input.sourceQuantity <= 0 ||
    !isPositiveFinite(input.sourceMultiplier) ||
    !isPositiveFinite(input.targetMultiplier)
  ) {
    return null
  }

  const sourceBaseQuantity = input.sourceQuantity * input.sourceMultiplier
  const targetQuantity = sourceBaseQuantity / input.targetMultiplier
  const roundedTargetQuantity = Math.round(targetQuantity)

  if (
    !Number.isSafeInteger(roundedTargetQuantity) ||
    roundedTargetQuantity <= 0 ||
    Math.abs(targetQuantity - roundedTargetQuantity) > CONVERSION_EPSILON
  ) {
    return null
  }

  return {
    sourceBaseQuantity,
    targetQuantity: roundedTargetQuantity,
  }
}
