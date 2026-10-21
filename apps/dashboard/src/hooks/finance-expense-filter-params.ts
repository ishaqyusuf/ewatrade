import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server"

export const financeExpenseFilterParams = {
  expenseQuery: parseAsString.withDefault(""),
  expenseStatus: parseAsStringLiteral([
    "UNPAID",
    "PARTIAL",
    "PAID",
    "VOID",
    "OPEN",
    "NO_RECEIPT",
  ] as const),
}
export const loadFinanceExpenseFilterParams = createLoader(
  financeExpenseFilterParams,
)
