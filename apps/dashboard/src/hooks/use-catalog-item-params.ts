"use client"

import { parseAsString, parseAsStringEnum, useQueryStates } from "nuqs"
import {
  CATALOG_KINDS,
  type CATALOG_STATUSES,
  type CatalogFilters,
  catalogFilterParams,
} from "./use-catalog-filter-params"

/** Shared with route-contract checks; these are the sheet/form's actual URL parsers. */
export const catalogItemParamParsers = {
  catalogItem: parseAsStringEnum(["create", "edit"]),
  catalogEditItem: parseAsString,
  catalogCreateKind: parseAsStringEnum([...CATALOG_KINDS]),
  catalogCreateMode: parseAsStringEnum(["form", "chat"]),
  catalogCreateName: parseAsString,
  catalogCreatePrice: parseAsString,
  catalogConversation: parseAsString,
  ...catalogFilterParams,
  productUnits: parseAsString,
}

export function useCatalogItemParams() {
  const [params, updateParams] = useQueryStates(catalogItemParamParsers)
  function setParams(
    values: {
      catalogItem?: "create" | "edit" | null
      catalogEditItem?: string | null
      catalogCreateKind?: (typeof CATALOG_KINDS)[number] | null
      catalogCreateMode?: "form" | "chat" | null
      catalogCreateName?: string | null
      /** Starting price in minor units. */
      catalogCreatePrice?: string | null
      catalogConversation?: string | null
      catalogKind?: (typeof CATALOG_KINDS)[number] | null
      catalogStatus?: (typeof CATALOG_STATUSES)[number] | null
      catalogQuery?: string | null
      productUnits?: string | null
    } | null,
  ) {
    return updateParams(
      values ?? {
        catalogItem: null,
        catalogEditItem: null,
        catalogCreateKind: null,
        catalogCreateMode: null,
        catalogCreateName: null,
        catalogCreatePrice: null,
        catalogConversation: null,
        productUnits: null,
      },
      { history: "push" },
    )
  }
  return {
    catalogKind: params.catalogKind,
    catalogStatus: params.catalogStatus,
    catalogCreateKind: params.catalogCreateKind,
    catalogCreateMode: params.catalogCreateMode,
    catalogCreateName: params.catalogCreateName,
    catalogCreatePrice: params.catalogCreatePrice,
    catalogConversation: params.catalogConversation,
    catalogItemMode: params.catalogItem,
    catalogEditItemId: params.catalogEditItem,
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
    /** Opens the item sheet; editing a saved item passes its id. */
    editCatalogItem: (itemId: string) =>
      setParams({ catalogItem: "edit", catalogEditItem: itemId }),
    setCatalogItemMode: (mode: "create" | null) =>
      setParams({
        catalogItem: mode,
        catalogEditItem: null,
        ...(mode === null
          ? {
              catalogCreateKind: null,
              catalogCreateMode: null,
              catalogCreateName: null,
              catalogCreatePrice: null,
              catalogConversation: null,
            }
          : {}),
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
