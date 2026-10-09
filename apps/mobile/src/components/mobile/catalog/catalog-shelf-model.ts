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

/**
 * A to Z, ignoring case and accents. The server already pages by name; this
 * evens out its case-sensitive collation ("QA bird" before "QA Test").
 */
export function sortCatalogRows(rows: CatalogRow[]) {
  return [...rows].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  )
}

export type CatalogAvatarTint = "mint" | "amber" | "sky" | "lilac" | "rose"

const PRODUCT_TINTS: CatalogAvatarTint[] = [
  "mint",
  "amber",
  "sky",
  "lilac",
  "rose",
]

/** Services are sky; products get a stable tint from their name. */
export function catalogAvatarTint(
  name: string,
  kind: CatalogRow["kind"],
): CatalogAvatarTint {
  if (kind === "service") return "sky"
  let hash = 0
  for (const char of name.trim().toLocaleLowerCase())
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return PRODUCT_TINTS[hash % PRODUCT_TINTS.length] as CatalogAvatarTint
}

/**
 * Counts for the title, type switch and problem chips. They are exact only when
 * every item is loaded; otherwise null so the screen never shows a partial count
 * as a total.
 */
export function catalogShelfCounts(rows: CatalogRow[], totalCount: number) {
  if (rows.length < totalCount) return null
  const count = (test: (row: CatalogRow) => boolean) => rows.filter(test).length
  return {
    all: rows.length,
    product: count((row) => row.kind === "product"),
    service: count((row) => row.kind === "service"),
    out_of_stock: count((row) => row.problem === "out_of_stock"),
    no_price: count((row) => row.problem === "no_price"),
    not_counted: count((row) => row.problem === "not_counted"),
  }
}

export function catalogCountLabel(
  counts: NonNullable<ReturnType<typeof catalogShelfCounts>>,
) {
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`
  if (!counts.service) return plural(counts.product, "product")
  if (!counts.product) return plural(counts.service, "service")
  return `${plural(counts.all, "item")} · ${plural(counts.product, "product")}, ${plural(counts.service, "service")}`
}

export function catalogShelfTitle(
  hasProducts?: boolean,
  hasServices?: boolean,
) {
  if (hasServices && hasProducts === false) return "Services"
  return hasProducts && hasServices === false ? "Products" : "Catalog"
}
