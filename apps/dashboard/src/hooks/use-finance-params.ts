"use client"

import { useQueryStates } from "nuqs"
import { parseAsString, parseAsStringLiteral } from "nuqs/server"
import { useCallback } from "react"
import { financeExpenseFilterParams } from "./finance-expense-filter-params"
import { financeSupplierFilterParams } from "./finance-supplier-filter-params"

export const financeSheetModes = [
  "setup",
  "period",
  "expense",
  "bill",
  "pay-bill",
  "money",
  "money-reversal",
  "account",
  "category",
  "cash-count",
  "cash-count-detail",
  "supplier",
  "supplier-statement",
  "supplier-opening",
  "supplier-advance",
] as const
export type FinanceSheetMode = (typeof financeSheetModes)[number]

export function useFinanceParams() {
  const [params, setParams] = useQueryStates({
    financeSheet: parseAsStringLiteral(financeSheetModes),
    billId: parseAsString,
    moneyEntryId: parseAsString,
    countId: parseAsString,
    supplierId: parseAsString,
    financeAccountId: parseAsString,
    reportAccountId: parseAsString,
    reportFrom: parseAsString,
    reportThrough: parseAsString,
    reportSnapshot: parseAsString,
    ...financeExpenseFilterParams,
    ...financeSupplierFilterParams,
  })
  const close = useCallback(
    () =>
      setParams({
        financeSheet: null,
        billId: null,
        countId: null,
        moneyEntryId: null,
        supplierId: null,
      }),
    [setParams],
  )
  return {
    ...params,
    setParams,
    close,
  }
}
