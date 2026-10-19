import { CatalogError } from "./catalog-errors"

/**
 * Pure planning for editing a saved Catalog Item. Saved rows are matched by
 * id (option groups, units), by label within a group (option values), by the
 * set of selected values (variants) and by Inventory Unit key (Product
 * offerings). Client keys are positional and never identify saved rows.
 */

export type StockBehaviorValue =
  | "canonical_shared"
  | "alternate_transaction"
  | "packaged_stock"

export type PlannedOptionGroup = { id?: string; name: string; values: string[] }

export type ExistingOptionGroup = {
  id: string
  key: string
  name: string
  values: Array<{ id: string; key: string; label: string }>
}

export type OptionGroupPlan = {
  /** One entry per requested group, in order; `id` is absent for new groups. */
  groups: Array<{
    id?: string
    key: string
    name: string
    values: Array<{ id?: string; key: string; label: string }>
  }>
  deleteGroupIds: string[]
  deleteValueIds: string[]
}

function normalizedLabel(value: string) {
  return value.trim().toLowerCase()
}

function nextKey(prefix: string, used: Set<string>) {
  for (let index = 1; ; index += 1) {
    const key = `${prefix}-${index}`
    if (!used.has(key)) {
      used.add(key)
      return key
    }
  }
}

export function planOptionGroups(
  existing: ExistingOptionGroup[],
  requested: PlannedOptionGroup[],
): OptionGroupPlan {
  const byId = new Map(existing.map((group) => [group.id, group]))
  const usedGroupKeys = new Set(existing.map((group) => group.key))
  const keptGroupIds = new Set<string>()
  const keptValueIds = new Set<string>()

  const groups = requested.map((group) => {
    const name = group.name.trim()
    const labels = group.values.map((value) => value.trim()).filter(Boolean)
    if (!name || labels.length === 0)
      throw new CatalogError(
        "INVALID_CATALOG_ITEM",
        "Every Option Group requires a name and at least one value.",
      )
    if (new Set(labels.map(normalizedLabel)).size !== labels.length)
      throw new CatalogError(
        "INVALID_CATALOG_ITEM",
        `${name} repeats an option value.`,
      )

    const saved = group.id ? byId.get(group.id) : undefined
    if (group.id && !saved)
      throw new CatalogError(
        "REVISION_CONFLICT",
        "An option on this item changed. Reopen it to see the latest version.",
      )
    if (saved) keptGroupIds.add(saved.id)
    const savedValues = new Map(
      (saved?.values ?? []).map((value) => [
        normalizedLabel(value.label),
        value,
      ]),
    )
    const usedValueKeys = new Set(
      (saved?.values ?? []).map((value) => value.key),
    )
    return {
      ...(saved ? { id: saved.id } : {}),
      key: saved?.key ?? nextKey("option", usedGroupKeys),
      name,
      values: labels.map((label) => {
        const match = savedValues.get(normalizedLabel(label))
        if (match) {
          keptValueIds.add(match.id)
          return { id: match.id, key: match.key, label }
        }
        return { key: nextKey("value", usedValueKeys), label }
      }),
    }
  })

  return {
    groups,
    deleteGroupIds: existing
      .filter((group) => !keptGroupIds.has(group.id))
      .map((group) => group.id),
    deleteValueIds: existing
      .filter((group) => keptGroupIds.has(group.id))
      .flatMap((group) => group.values)
      .filter((value) => !keptValueIds.has(value.id))
      .map((value) => value.id),
  }
}

/** A stable identity for a set of option value ids, order-independent. */
export function selectionSignature(valueIds: string[]) {
  return [...valueIds].sort().join("|")
}

export type ExistingVariant = {
  id: string
  key: string
  valueIds: string[]
}

export type VariantMatch = {
  /** Saved variant id per requested variant, or null when it must be created. */
  matches: Array<string | null>
  archiveIds: string[]
}

export function matchVariants(
  existing: ExistingVariant[],
  requestedValueIds: string[][],
): VariantMatch {
  const bySignature = new Map(
    existing.map((variant) => [selectionSignature(variant.valueIds), variant]),
  )
  const seen = new Set<string>()
  const matches = requestedValueIds.map((valueIds) => {
    const signature = selectionSignature(valueIds)
    if (seen.has(signature))
      throw new CatalogError(
        "INVALID_CATALOG_ITEM",
        "Each customer choice must be a different combination.",
      )
    seen.add(signature)
    return bySignature.get(signature)?.id ?? null
  })
  const matched = new Set(matches.filter((id): id is string => id !== null))
  return {
    matches,
    archiveIds: existing
      .filter((variant) => !matched.has(variant.id))
      .map((variant) => variant.id),
  }
}

export type ExistingUnit = {
  id: string
  key: string
  name: string
  factor: string
  stockBehavior: StockBehaviorValue
  transactionScale: number
  symbol: string | null
}

export type RequestedUnit = {
  id?: string
  name: string
  factor: string
  stockBehavior: StockBehaviorValue
  transactionScale: number
}

export type UnitPlan =
  | { mode: "unchanged"; keys: string[] }
  | {
      mode: "rename"
      keys: string[]
      renames: Array<{ id: string; name: string }>
    }
  | {
      mode: "republish"
      keys: string[]
      units: Array<{
        key: string
        name: string
        factor: string
        stockBehavior: StockBehaviorValue
        symbol?: string
        transactionScale: number
      }>
    }

/** Factors compare as exact decimals so "30" and "30.000000000000" are equal. */
function sameFactor(left: string, right: string) {
  const trim = (value: string) =>
    value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value
  return trim(left.trim()) === trim(right.trim())
}

export function planUnits(
  existing: ExistingUnit[],
  requested: RequestedUnit[],
): UnitPlan {
  const canonical = requested[0]
  if (
    !canonical ||
    canonical.stockBehavior !== "canonical_shared" ||
    !sameFactor(canonical.factor, "1") ||
    requested.slice(1).some((unit) => unit.stockBehavior === "canonical_shared")
  )
    throw new CatalogError(
      "INVALID_UNIT_CONFIGURATION",
      "A Product requires exactly one main unit first.",
    )
  const savedCanonical = existing.find(
    (unit) => unit.stockBehavior === "canonical_shared",
  )
  if (savedCanonical && canonical.id && canonical.id !== savedCanonical.id)
    throw new CatalogError(
      "INVALID_UNIT_CONFIGURATION",
      "The main unit of a saved Product cannot be swapped. Rename it instead.",
    )

  const byId = new Map(existing.map((unit) => [unit.id, unit]))
  const usedKeys = new Set(existing.map((unit) => unit.key))
  const resolved = requested.map((unit, index) => {
    const saved =
      index === 0 ? savedCanonical : unit.id ? byId.get(unit.id) : undefined
    if (unit.id && !saved)
      throw new CatalogError(
        "REVISION_CONFLICT",
        "A selling unit on this item changed. Reopen it to see the latest version.",
      )
    if (!unit.name.trim())
      throw new CatalogError(
        "INVALID_UNIT_CONFIGURATION",
        "Enter every unit name.",
      )
    return {
      saved,
      key: saved?.key ?? nextKey("unit", usedKeys),
      name: unit.name.trim(),
      factor: unit.factor.trim(),
      stockBehavior: unit.stockBehavior,
      transactionScale: unit.transactionScale,
    }
  })
  const keys = resolved.map((unit) => unit.key)

  const semanticsChanged =
    resolved.length !== existing.length ||
    resolved.some(
      ({ saved, factor, stockBehavior, transactionScale }) =>
        !saved ||
        !sameFactor(saved.factor, factor) ||
        saved.stockBehavior !== stockBehavior ||
        saved.transactionScale !== transactionScale,
    )
  if (semanticsChanged)
    return {
      mode: "republish",
      keys,
      units: resolved.map(({ saved, ...unit }) => ({
        ...unit,
        ...(saved?.symbol ? { symbol: saved.symbol } : {}),
      })),
    }

  const renames = resolved.flatMap(({ saved, name }) =>
    saved && saved.name !== name ? [{ id: saved.id, name }] : [],
  )
  return renames.length
    ? { mode: "rename", keys, renames }
    : { mode: "unchanged", keys }
}

export type ExistingOffering = {
  id: string
  unitKey: string | null
}

export type OfferingMatch<T> = {
  update: Array<{ id: string; requested: T }>
  create: Array<{ requested: T }>
  archiveIds: string[]
}

/** Product offerings match by unit key; a Service variant has one offering. */
export function matchOfferings<T extends { unitKey: string | null }>(
  existing: ExistingOffering[],
  requested: T[],
): OfferingMatch<T> {
  const byUnit = new Map(
    existing.map((offering) => [offering.unitKey, offering]),
  )
  if (
    byUnit.size !== existing.length ||
    new Set(requested.map((r) => r.unitKey)).size !== requested.length
  )
    throw new CatalogError(
      "INVALID_OFFERING",
      "Each selling unit can be offered once per customer choice.",
    )
  const used = new Set<string>()
  const update: OfferingMatch<T>["update"] = []
  const create: OfferingMatch<T>["create"] = []
  for (const offering of requested) {
    const saved = byUnit.get(offering.unitKey)
    if (saved) {
      used.add(saved.id)
      update.push({ id: saved.id, requested: offering })
    } else create.push({ requested: offering })
  }
  return {
    update,
    create,
    archiveIds: existing
      .filter((offering) => !used.has(offering.id))
      .map((offering) => offering.id),
  }
}

export function nextCatalogKey(prefix: string, used: Set<string>) {
  return nextKey(prefix, used)
}
