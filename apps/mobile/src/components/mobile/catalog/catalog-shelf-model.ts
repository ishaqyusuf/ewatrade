import type { CatalogKindFilter, CatalogRow } from "./catalog-presentation"

export type CatalogAttention = NonNullable<CatalogRow["problem"]>

/** Offline search runs over saved base pages, never an uncached search key. */
export function filterCatalogShelf(
  rows: CatalogRow[],
  {
    query = "",
    kind = "all",
    attention,
  }: {
    query?: string
    kind?: CatalogKindFilter
    attention?: CatalogAttention | null
  },
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    if (kind !== "all" && row.kind !== kind) return false
    if (attention && row.problem !== attention) return false
    const text = `${row.name} ${row.kind} ${row.unitName}`.toLocaleLowerCase()
    return terms.every((term) => text.includes(term))
  })
}

export function catalogShelfTitle(
  hasProducts?: boolean,
  hasServices?: boolean,
) {
  if (hasServices && hasProducts === false) return "Services"
  return hasProducts && hasServices === false ? "Products" : "Catalog"
}
