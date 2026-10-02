export type ListSortDirection = "asc" | "desc"

export type ListSortKey = {
  direction: ListSortDirection
  enumValues?: readonly string[]
  field: string
  value: bigint | Date | number | string
}

function equalClause(field: string, value: ListSortKey["value"]) {
  return { [field]: value }
}

/** Builds a lexicographic keyset predicate, including the supplied tie-breaker. */
export function buildListSortContinuation(keys: ListSortKey[]) {
  const clauses: Array<{ AND: Record<string, unknown>[] }> = []
  for (const [index, key] of keys.entries()) {
    const prefix = keys
      .slice(0, index)
      .map(({ field, value }) => equalClause(field, value))

    if (key.enumValues) {
      const enumIndex = key.enumValues.indexOf(String(key.value))
      if (enumIndex < 0) continue
      const laterValues =
        key.direction === "asc"
          ? key.enumValues.slice(enumIndex + 1)
          : key.enumValues.slice(0, enumIndex)
      if (laterValues.length === 0) continue
      clauses.push({
        AND: [...prefix, { [key.field]: { in: laterValues } }],
      })
      continue
    }

    clauses.push({
      AND: [
        ...prefix,
        {
          [key.field]: {
            [key.direction === "asc" ? "gt" : "lt"]: key.value,
          },
        },
      ],
    })
  }

  return { OR: clauses }
}

/** Keeps both the cursor anchor and its continuation inside the active filters. */
export function buildScopedListCursorWhere<TWhere extends object>(
  filters: TWhere,
  cursorId: string,
) {
  return { AND: [filters, { id: cursorId }] }
}

export function buildScopedListPageWhere<TWhere extends object>(
  filters: TWhere,
  keys: ListSortKey[],
) {
  return { AND: [filters, buildListSortContinuation(keys)] }
}
