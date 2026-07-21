import {
  EXACT_FACTOR_MAX_SCALE,
  compareExactDecimals,
  divideExactDecimals,
  parseExactDecimal,
} from "./exact-decimal"

export type CatalogUnitRelationDirection =
  | "canonical_per_unit"
  | "units_per_canonical"

export type CatalogUnitRelation = {
  count: string
  direction: CatalogUnitRelationDirection
}

function parsePositiveUnitDecimal(value: string) {
  return parseExactDecimal(value, {
    allowZero: false,
    maxScale: EXACT_FACTOR_MAX_SCALE,
  })
}

export function catalogUnitRelationToFactor({
  count,
  direction,
}: CatalogUnitRelation) {
  const parsedCount = parsePositiveUnitDecimal(count)

  if (direction === "canonical_per_unit") return parsedCount

  try {
    return divideExactDecimals("1", parsedCount, EXACT_FACTOR_MAX_SCALE)
  } catch {
    throw new Error(
      "This count cannot be represented exactly. Use the opposite relationship direction.",
    )
  }
}

export function catalogUnitFactorToRelation(
  factor: string,
  preferredDirection?: CatalogUnitRelationDirection,
): CatalogUnitRelation {
  const parsedFactor = parsePositiveUnitDecimal(factor)

  if (preferredDirection === "canonical_per_unit") {
    return { count: parsedFactor, direction: preferredDirection }
  }

  if (
    preferredDirection === "units_per_canonical" ||
    compareExactDecimals(parsedFactor, "1") <= 0
  ) {
    try {
      return {
        count: divideExactDecimals("1", parsedFactor, EXACT_FACTOR_MAX_SCALE),
        direction: "units_per_canonical",
      }
    } catch (error) {
      if (preferredDirection) throw error
    }
  }

  return {
    count: parsedFactor,
    direction: "canonical_per_unit",
  }
}

export function transposeCatalogUnitRelation(
  relation: CatalogUnitRelation,
  nextDirection: CatalogUnitRelationDirection,
) {
  return catalogUnitFactorToRelation(
    catalogUnitRelationToFactor(relation),
    nextDirection,
  )
}
