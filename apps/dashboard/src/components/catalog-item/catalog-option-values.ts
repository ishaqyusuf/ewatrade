import {
  canAddCatalogOptionValue,
  normalizeCatalogSuggestion,
} from "@ewatrade/utils/business-catalog-guidance"

export function parseCatalogOptionValues(values: readonly string[]) {
  const unique = new Map<string, string>()
  for (const value of values.flatMap((value) => value.split(","))) {
    const label = value.trim()
    const key = normalizeCatalogSuggestion(label)
    if (key && !unique.has(key)) unique.set(key, label)
  }
  return [...unique.values()]
}

export function updateCatalogOptionValues(
  groups: readonly { values: string }[],
  index: number,
  values: readonly string[],
) {
  const group = groups[index]
  if (!group) return ""
  const selected = parseCatalogOptionValues(values)
  const previous = new Set(
    parseCatalogOptionValues([group.values]).map(normalizeCatalogSuggestion),
  )
  const additions = selected.filter(
    (value) => !previous.has(normalizeCatalogSuggestion(value)),
  )
  const retained = selected.filter((value) =>
    previous.has(normalizeCatalogSuggestion(value)),
  )
  const nextGroups = groups.map((group, groupIndex) => ({
    values:
      groupIndex === index
        ? retained
        : parseCatalogOptionValues([group.values]),
  }))
  for (const value of additions) {
    if (!canAddCatalogOptionValue(nextGroups, index)) return group.values
    nextGroups[index]?.values.push(value)
  }
  return selected.join(", ")
}
