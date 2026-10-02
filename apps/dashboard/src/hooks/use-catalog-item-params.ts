"use client"

import { parseAsString, parseAsStringEnum, useQueryStates } from "nuqs"
import {
  CATALOG_KINDS,
  type CATALOG_STATUSES,
  type CatalogFilters,
  catalogFilterParams,
} from "./use-catalog-filter-params"

export function useCatalogItemParams() {
  const [params, updateParams] = useQueryStates({
    catalogItem: parseAsStringEnum(["create"]),
    catalogCreateKind: parseAsStringEnum([...CATALOG_KINDS]),
    ...catalogFilterParams,
    productUnits: parseAsString,
  })
  function setParams(
    values: {
      catalogItem?: "create" | null
      catalogCreateKind?: (typeof CATALOG_KINDS)[number] | null
      catalogKind?: (typeof CATALOG_KINDS)[number] | null
      catalogStatus?: (typeof CATALOG_STATUSES)[number] | null
      catalogQuery?: string | null
      productUnits?: string | null
    } | null,
  ) {
    return updateParams(
      values ?? {
        catalogItem: null,
        catalogCreateKind: null,
        productUnits: null,
      },
    )
  }
  return {
    catalogKind: params.catalogKind,
    catalogStatus: params.catalogStatus,
    catalogCreateKind: params.catalogCreateKind,
    catalogItemMode: params.catalogItem,
    catalogQuery: params.catalogQuery ?? "",
    filter: {
      kind: params.catalogKind,
      query: params.catalogQuery,
      status: params.catalogStatus,
    } satisfies CatalogFilters,
    hasFilters: Boolean(
      params.catalogKind || params.catalogStatus || params.catalogQuery?.trim(),
    ),
    productUnitsId: params.productUnits,
    setCatalogItemMode: (mode: "create" | null) =>
      setParams({
        catalogItem: mode,
        ...(mode === null ? { catalogCreateKind: null } : {}),
      }),
    setFilter: (values: Partial<CatalogFilters> | null) =>
      updateParams(
        values === null
          ? {
              catalogKind: null,
              catalogQuery: null,
              catalogStatus: null,
            }
          : {
              catalogKind: values.kind,
              catalogQuery: values.query,
              catalogStatus: values.status,
            },
      ),
    setParams,
  }
}
