import { catalogUnitRelationToFactor } from "@ewatrade/utils"
import type { CatalogUnitRelationDirection } from "@ewatrade/utils"
import {
  EXACT_FACTOR_MAX_SCALE,
  multiplyExactDecimals,
} from "@ewatrade/utils/exact-decimal"

export type CatalogRelatedUnit = {
  id: string
  referenceId: string
  relationCount: string
  relationDirection: CatalogUnitRelationDirection
}

// Reference relationships are draft presentation; the API receives canonical factors.
export function resolveCatalogUnitFactors(
  units: readonly CatalogRelatedUnit[],
) {
  const factors = new Map<string, string>([["canonical", "1"]])
  const visiting = new Set<string>()
  function resolve(id: string): string {
    const existing = factors.get(id)
    if (existing) return existing
    const unit = units.find((candidate) => candidate.id === id)
    if (!unit) throw new Error("Choose an existing reference unit.")
    if (visiting.has(id))
      throw new Error("Selling units cannot refer back to each other.")
    visiting.add(id)
    const factor = multiplyExactDecimals(
      resolve(unit.referenceId),
      catalogUnitRelationToFactor({
        count: unit.relationCount,
        direction: unit.relationDirection,
      }),
      EXACT_FACTOR_MAX_SCALE,
    )
    visiting.delete(id)
    factors.set(id, factor)
    return factor
  }
  for (const unit of units) resolve(unit.id)
  return factors
}

export function availableCatalogUnitReferences(
  units: readonly CatalogRelatedUnit[],
  unitId: string,
) {
  const descendants = new Set([unitId])
  let changed = true
  while (changed) {
    changed = false
    for (const unit of units) {
      if (descendants.has(unit.referenceId) && !descendants.has(unit.id)) {
        descendants.add(unit.id)
        changed = true
      }
    }
  }
  return units.filter((unit) => !descendants.has(unit.id))
}
