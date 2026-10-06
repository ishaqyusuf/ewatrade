export function parseReceiptIds(
  value: string | string[] | undefined,
): string[] {
  if (typeof value !== "string") return []
  const ids = value.split(",")
  if (
    ids.length > 20 ||
    ids.some((id) => !id.trim() || id.length > 128) ||
    new Set(ids).size !== ids.length
  )
    return []
  return ids
}

export function toggleReceiptSelection(ids: string[], id: string) {
  if (ids.includes(id)) return ids.filter((value) => value !== id)
  return ids.length < 20 ? [...ids, id] : ids
}
