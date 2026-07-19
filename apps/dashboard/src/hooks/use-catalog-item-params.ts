"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

const CATALOG_ITEM_PARAM = "catalogItem"
const CATALOG_KIND_PARAM = "catalogKind"
const CATALOG_QUERY_PARAM = "catalogQuery"
const PRODUCT_UNITS_PARAM = "productUnits"

export function useCatalogItemParams() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const catalogItemMode =
    searchParams.get(CATALOG_ITEM_PARAM) === "create" ? "create" : null
  const catalogKindValue = searchParams.get(CATALOG_KIND_PARAM)
  const catalogKind: "product" | "service" | null =
    catalogKindValue === "product" || catalogKindValue === "service"
      ? catalogKindValue
      : null
  const catalogQuery = searchParams.get(CATALOG_QUERY_PARAM) ?? ""
  const productUnitsId = searchParams.get(PRODUCT_UNITS_PARAM)

  function setParams(
    values: {
      catalogItem?: "create" | null
      catalogKind?: "product" | "service" | null
      catalogQuery?: string | null
      productUnits?: string | null
    } | null,
  ) {
    const next = new URLSearchParams(searchParams.toString())

    if (values === null) {
      next.delete(CATALOG_ITEM_PARAM)
      next.delete(PRODUCT_UNITS_PARAM)
    } else {
      for (const [key, value] of Object.entries(values)) {
        const param =
          key === "catalogItem"
            ? CATALOG_ITEM_PARAM
            : key === "catalogKind"
              ? CATALOG_KIND_PARAM
              : key === "catalogQuery"
                ? CATALOG_QUERY_PARAM
                : PRODUCT_UNITS_PARAM
        if (value) next.set(param, value)
        else next.delete(param)
      }
    }

    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return {
    catalogKind,
    catalogItemMode,
    catalogQuery,
    productUnitsId,
    setCatalogItemMode: (mode: "create" | null) =>
      setParams({ catalogItem: mode }),
    setParams,
  }
}
