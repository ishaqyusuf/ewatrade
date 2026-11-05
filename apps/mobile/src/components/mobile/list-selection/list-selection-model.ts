/** Pure rules for press-and-hold list selection (Orders, Catalog). */

export type SelectionChange = {
  ids: string[]
  /** True when the change was cut short by the cap. */
  capped: boolean
}

/** Adds or removes one id; deselecting always works, adding stops at `max`. */
export function toggleSelectionId(
  ids: readonly string[],
  id: string,
  max: number,
): SelectionChange {
  if (ids.includes(id))
    return { capped: false, ids: ids.filter((value) => value !== id) }
  if (ids.length >= max) return { capped: true, ids: [...ids] }
  return { capped: false, ids: [...ids, id] }
}

/**
 * Select all toggles: when every selectable loaded row (up to the cap) is
 * already selected it clears, otherwise it selects the first `max` rows.
 */
export function selectAllIds(
  ids: readonly string[],
  selectable: readonly string[],
  max: number,
): SelectionChange {
  const target = selectable.slice(0, max)
  if (target.length > 0 && target.every((id) => ids.includes(id)))
    return { capped: false, ids: [] }
  return { capped: selectable.length > max, ids: target }
}

/** True when Select all would clear instead of add. */
export function isAllSelected(
  ids: readonly string[],
  selectable: readonly string[],
  max: number,
) {
  const target = selectable.slice(0, max)
  return target.length > 0 && target.every((id) => ids.includes(id))
}

/** Drops ids whose rows left the list or can no longer be selected. */
export function pruneSelection(
  ids: string[],
  selectable: ReadonlySet<string>,
): string[] {
  return ids.every((id) => selectable.has(id))
    ? ids
    : ids.filter((id) => selectable.has(id))
}

export function selectionCapNotice(max: number, noun: string) {
  return `Up to ${max} ${noun} at a time`
}
