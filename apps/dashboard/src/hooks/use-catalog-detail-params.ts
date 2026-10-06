"use client"
import { parseAsString, parseAsStringEnum, useQueryStates } from "nuqs"
import { useCallback } from "react"

export function useCatalogDetailParams() {
  const [params, setParams] = useQueryStates(
    {
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
    },
    { history: "push" },
  )
  const open = useCallback(
    (id: string) =>
      setParams({
        catalogDetail: id,
        catalogDetailTab: null,
        catalogActivity: null,
      }),
    [setParams],
  )
  const close = useCallback(
    () =>
      setParams({
        catalogDetail: null,
        catalogDetailTab: null,
        catalogActivity: null,
      }),
    [setParams],
  )
  return {
    ...params,
    setParams,
    open,
    close,
  }
}
