"use client"
import { parseAsString, useQueryStates } from "nuqs"
export function useInventoryLedgerParams() {
  const [params, setParams] = useQueryStates({
    q: parseAsString,
    filter: parseAsString,
    record: parseAsString,
  })
  return { params, setParams }
}
