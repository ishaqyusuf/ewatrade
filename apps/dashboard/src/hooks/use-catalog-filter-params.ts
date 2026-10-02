import { createLoader, parseAsString, parseAsStringEnum } from "nuqs/server"

export const CATALOG_KINDS = ["product", "service"] as const
export const CATALOG_STATUSES = ["active", "draft", "archived"] as const

export const catalogFilterParams = {
  catalogKind: parseAsStringEnum([...CATALOG_KINDS]),
  catalogStatus: parseAsStringEnum([...CATALOG_STATUSES]),
  catalogQuery: parseAsString,
}

export type CatalogFilters = {
  kind: (typeof CATALOG_KINDS)[number] | null
  query: string | null
  status: (typeof CATALOG_STATUSES)[number] | null
}

const loadCatalogFilterState = createLoader(catalogFilterParams)

export async function loadCatalogFilterParams(
  searchParams: Parameters<typeof loadCatalogFilterState>[0],
): Promise<CatalogFilters> {
  const params = await loadCatalogFilterState(searchParams)
  return {
    kind: params.catalogKind,
    query: params.catalogQuery,
    status: params.catalogStatus,
  }
}

export function getCatalogListPageInput(filter: CatalogFilters) {
  return {
    kind: filter.kind ?? undefined,
    query: filter.query?.trim().slice(0, 160) || undefined,
    status: filter.status ?? undefined,
    limit: 25,
  }
}
