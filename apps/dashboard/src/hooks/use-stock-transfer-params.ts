"use client"
import { useCallback } from "react"
import { usePathname } from "next/navigation"
import { parseAsString, useQueryStates } from "nuqs"
export function useStockTransferParams() {
  const pathname = usePathname()
  const [params, setParams] = useQueryStates(
    { stockTransfer: parseAsString, record: parseAsString },
    { history: "push" },
  )
  const legacy = pathname === "/inventory/transfers"
  const open = useCallback(
    (id: string) =>
      setParams({ stockTransfer: id, ...(legacy ? { record: null } : {}) }),
    [setParams, legacy],
  )
  return {
    transferId: params.stockTransfer ?? (legacy ? params.record : null),
    open,
    close: () =>
      setParams({ stockTransfer: null, ...(legacy ? { record: null } : {}) }),
  }
}
