"use client"
import { parseAsString, useQueryStates } from "nuqs"
export function useStockCountParams() {
  const [params, setParams] = useQueryStates(
    { inventoryCount: parseAsString },
    { history: "push" },
  )
  return {
    stockCountId: params.inventoryCount,
    close: () => setParams({ inventoryCount: null }),
  }
}
