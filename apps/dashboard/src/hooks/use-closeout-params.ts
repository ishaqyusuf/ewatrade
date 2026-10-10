"use client"
import { parseAsString, useQueryStates } from "nuqs"
export function useCloseoutParams() {
  const [params, setParams] = useQueryStates(
    { inventoryCloseout: parseAsString },
    { history: "push" },
  )
  return {
    closeoutId: params.inventoryCloseout,
    close: () => setParams({ inventoryCloseout: null }),
  }
}
