"use client"

import { getTableSort, sortParamsSchema } from "@/hooks/sort-params"
import { useQueryStates } from "nuqs"
import { useMemo } from "react"

export function useSortParams<const T extends readonly string[]>({
  fields,
}: { fields: T }) {
  const [params, setParams] = useQueryStates(sortParamsSchema, {
    shallow: true,
  })
  const sort = getTableSort(params.sort, fields)
  const sortField = sort?.field
  const sortDirection = sort?.direction
  // TanStack memoizes sorted rows by the sorting array's identity. Recreating
  // it on every render can repeatedly reset pagination and rerender the table.
  const sorting = useMemo(
    () =>
      sortField && sortDirection
        ? [{ id: sortField, desc: sortDirection === "desc" }]
        : [],
    [sortField, sortDirection],
  )
  function toggleSort(field: T[number]) {
    return setParams({
      sort:
        sort?.field !== field
          ? [field, "asc"]
          : sort.direction === "asc"
            ? [field, "desc"]
            : null,
    })
  }
  return { params, setParams, sort, sorting, toggleSort }
}
