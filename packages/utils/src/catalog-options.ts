export type CatalogOptionDraft = {
  key: string
  label: string
}

export type CatalogOptionGroupDraft = {
  key: string
  name: string
  values: CatalogOptionDraft[]
}

export type CatalogVariantCombination = {
  key: string
  name: string
  selections: Array<{
    groupKey: string
    valueKey: string
  }>
}

export function buildCatalogVariantCombinations(
  groups: CatalogOptionGroupDraft[],
): CatalogVariantCombination[] {
  if (
    groups.length === 0 ||
    groups.some((group) => group.values.length === 0)
  ) {
    return []
  }

  const selections: CatalogVariantCombination["selections"][] = [[]]
  for (const group of groups) {
    const previousSelections = selections.splice(0, selections.length)
    for (const previous of previousSelections) {
      for (const value of group.values) {
        selections.push([
          ...previous,
          { groupKey: group.key, valueKey: value.key },
        ])
      }
    }
  }

  const labels = new Map(
    groups.flatMap((group) =>
      group.values.map((value) => [`${group.key}:${value.key}`, value.label]),
    ),
  )

  return selections.map((combination, index) => ({
    key: `variant-${index + 1}`,
    name: combination
      .map(
        (selection) =>
          labels.get(`${selection.groupKey}:${selection.valueKey}`) ??
          selection.valueKey,
      )
      .join(" / "),
    selections: combination,
  }))
}
