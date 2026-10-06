"use client"
import { useQueryStates } from "nuqs"
import { createLoader, parseAsArrayOf, parseAsString } from "nuqs/server"

const receiptParams = { receiptIds: parseAsArrayOf(parseAsString) }
export const loadReceiptParams = createLoader(receiptParams)
export function useReceiptParams() {
  const [params, setParams] = useQueryStates(receiptParams, { history: "push" })
  return { ...params, setParams }
}
