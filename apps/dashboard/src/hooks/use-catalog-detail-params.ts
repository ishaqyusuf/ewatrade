"use client"
import { parseAsString, parseAsStringEnum, useQueryStates } from "nuqs"
import { useCallback } from "react"

export function useCatalogDetailParams() {
  const [params, setParams] = useQueryStates(catalogDetailParamParsers, {
    history: "push",
  })
  /** Opens the item's details sheet, or one of its views (Images, Units) directly. */
  const open = useCallback(
    (id: string, view?: CatalogDetailView) =>
      setParams({
        catalogDetail: id,
        catalogDetailTab: null,
        catalogActivity: null,
        catalogDetailView: view ?? null,
      }),
    [setParams],
  )
  const close = useCallback(
    () =>
      setParams({
        catalogDetail: null,
        catalogDetailTab: null,
        catalogActivity: null,
        catalogDetailView: null,
      }),
    [setParams],
  )
  const setView = useCallback(
    (view: CatalogDetailView | null) => setParams({ catalogDetailView: view }),
    [setParams],
  )
  return {
    ...params,
    setParams,
    open,
    close,
    setView,
  }
}

export type CatalogDetailView = "images" | "units"

/** The canonical details sheet's query contract, also consumed by handoff regression checks. */
export const catalogDetailParamParsers = {
  catalogDetail: parseAsString,
  catalogDetailTab: parseAsStringEnum([
    "overview",
    "orders",
    "activity",
  ]).withDefault("overview"),
  catalogActivity: parseAsStringEnum([
    "all",
    "catalog",
    "orders",
    "stock",
  ]).withDefault("all"),
  /** A view inside the details sheet that changes the item; it returns to the item. */
  catalogDetailView: parseAsStringEnum<CatalogDetailView>(["images", "units"]),
}
