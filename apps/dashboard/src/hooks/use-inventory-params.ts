"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

export type InventoryOperationMode =
  | "adjustment"
  | "count"
  | "custody"
  | "receipt"
  | "transfer"
  | "transformation"

const MODES = new Set<InventoryOperationMode>([
  "adjustment",
  "count",
  "custody",
  "receipt",
  "transfer",
  "transformation",
])

export function useInventoryParams() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const operationValue = searchParams.get("inventoryOperation")
  const operation =
    operationValue && MODES.has(operationValue as InventoryOperationMode)
      ? (operationValue as InventoryOperationMode)
      : null
  const query = searchParams.get("inventoryQuery") ?? ""

  function setParams(
    values: {
      inventoryOperation?: InventoryOperationMode | null
      inventoryQuery?: string | null
    } | null,
  ) {
    const next = new URLSearchParams(searchParams.toString())
    if (values === null) {
      next.delete("inventoryOperation")
    } else {
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
    }
    const nextQuery = next.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    })
  }

  return { operation, query, setParams }
}
