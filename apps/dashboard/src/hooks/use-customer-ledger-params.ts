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
    /** Leave an undo view for the entry it belongs to. */
    backToEntry: () =>
      setParams({
        ledgerAction: "entry",
        ledgerAllocation: null,
        ledgerAllocationAfter: null,
      }),
    close: () =>
      setParams({
        ledgerAction: null,
        ledgerEntry: null,
        ledgerAllocation: null,
        ledgerAllocationAfter: null,
      }),
  }
}
