"use client"
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs"
import { useCallback } from "react"
export const customerSheetModes = ["create", "edit"] as const
/** Add customer (`customerSheet=create`) or Edit customer (`edit` + `customerId`). */
export function useCustomerSheetParams() {
  const [params, setParams] = useQueryStates(
    {
      customerSheet: parseAsStringLiteral(customerSheetModes),
      customerId: parseAsString,
    },
    { history: "push" },
  )
  const editing = params.customerSheet === "edit" && Boolean(params.customerId)
  const openCreate = useCallback(
    () => setParams({ customerSheet: "create", customerId: null }),
    [setParams],
  )
  const openEdit = useCallback(
    (customerId: string) => setParams({ customerSheet: "edit", customerId }),
    [setParams],
  )
  const close = useCallback(
    () => setParams({ customerSheet: null, customerId: null }),
    [setParams],
  )
  return {
    open: params.customerSheet === "create" || editing,
    customerId: editing ? params.customerId : null,
    openCreate,
    openEdit,
    close,
  }
}
