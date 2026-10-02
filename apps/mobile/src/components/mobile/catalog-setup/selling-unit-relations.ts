import { catalogUnitRelationToFactor } from "@ewatrade/utils"
import {
  EXACT_FACTOR_MAX_SCALE,
  multiplyExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import type { MobileUnitDraft } from "./catalog-setup-model"

/** Reference choices are draft conveniences; API factors always target the canonical unit. */
export function resolveSellingUnitFactors(units: readonly MobileUnitDraft[]) {
  const factors = new Map<string, string>()
  const visiting = new Set<string>()
  const byId = new Map(units.map((unit) => [unit.id, unit]))
  function resolve(id: string): string {
    const known = factors.get(id)
    if (known) return known
    if (visiting.has(id))
      throw new Error("Selling units cannot reference one another in a circle.")
    const unit = byId.get(id)
    if (!unit)
      throw new Error(
        "The referenced selling unit no longer exists. Choose another unit.",
      )
    visiting.add(id)
    const local = catalogUnitRelationToFactor({
      count: unit.relationCount,
      direction: unit.relationDirection,
    })
    const factor = unit.referenceUnitId
      ? multiplyExactDecimals(
          local,
          resolve(unit.referenceUnitId),
          EXACT_FACTOR_MAX_SCALE,
        )
      : local
    factors.set(id, factor)
    visiting.delete(id)
    return factor
  }
  for (const unit of units) resolve(unit.id)
  return factors
}

export function removeSellingUnitPreservingFactors(
  units: readonly MobileUnitDraft[],
  removedId: string,
) {
  const factors = resolveSellingUnitFactors(units)
  return units
    .filter((unit) => unit.id !== removedId)
    .map((unit) =>
      unit.referenceUnitId === removedId
        ? {
            ...unit,
            referenceUnitId: undefined,
            relationDirection: "canonical_per_unit" as const,
            relationCount: requireSellingUnitFactor(factors, unit.id),
          }
        : unit,
    )
}

export function requireSellingUnitFactor(
  factors: ReadonlyMap<string, string>,
  id: string,
) {
  const factor = factors.get(id)
  if (!factor) throw new Error("The selling unit relationship is incomplete.")
  return factor
}
