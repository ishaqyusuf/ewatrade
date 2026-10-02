// API combination keys are positional; draft identity follows the actual choices.
export function catalogChoiceDraftIdentity(
  selections: readonly { groupKey: string; valueKey: string }[],
  groups: readonly {
    id: string
    key: string
    values: readonly { key: string; label: string }[]
  }[],
) {
  return JSON.stringify(
    selections
      .map((selection) => {
        const group = groups.find(
          (candidate) => candidate.key === selection.groupKey,
        )
        const value = group?.values.find(
          (candidate) => candidate.key === selection.valueKey,
        )
        return [group?.id, value?.label.trim().toLowerCase()]
      })
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
  )
}
