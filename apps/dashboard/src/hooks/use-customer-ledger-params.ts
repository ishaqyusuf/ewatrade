"use client"
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs"
export const customerLedgerModes = [
  "opening",
  "receipt",
  "apply",
  "entry",
  "release",
  "refund",
  "reverse",
] as const
export type CustomerLedgerMode = (typeof customerLedgerModes)[number]
export function useCustomerLedgerParams() {
  const [params, setParams] = useQueryStates(
    {
      ledgerAccount: parseAsString,
      ledgerSnapshot: parseAsString,
      ledgerAfter: parseAsString,
      ledgerAction: parseAsStringLiteral(customerLedgerModes),
      ledgerEntry: parseAsString,
      ledgerAllocation: parseAsString,
      ledgerAllocationAfter: parseAsString,
    },
    { history: "push" },
  )
  return {
    ...params,
    setParams,
    close: () =>
      setParams({
        ledgerAction: null,
        ledgerEntry: null,
        ledgerAllocation: null,
        ledgerAllocationAfter: null,
      }),
  }
}
