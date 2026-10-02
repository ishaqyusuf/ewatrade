import { createLoader, parseAsString, parseAsStringLiteral } from "nuqs/server"

export const financeExpenseFilterParams = {
  expenseQuery: parseAsString.withDefault(""),
  expenseStatus: parseAsStringLiteral([
    "UNPAID",
    "PARTIAL",
    "PAID",
    "VOID",
  ] as const),
}
export const loadFinanceExpenseFilterParams = createLoader(
  financeExpenseFilterParams,
)
