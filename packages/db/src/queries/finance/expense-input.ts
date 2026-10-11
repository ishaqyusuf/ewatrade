import type { FinanceExpenseInput } from "./bills"
import { FinanceError, MAX_FINANCE_AMOUNT, financeAmount } from "./rules"

function validateBillText(value: string, label: string, maximum = 500) {
  if (!value.trim() || value.length > maximum) {
    throw new FinanceError("INVALID_JOURNAL", `Enter a valid ${label}.`)
  }
}

export function normalizeFinanceExpense(
  input: Omit<FinanceExpenseInput, "clientCommandId">,
) {
  validateBillText(input.payeeName, "payee", 160)
  validateBillText(input.description, "description")
  if (
    !Number.isFinite(input.incurredAt.getTime()) ||
    (input.reference && input.reference.length > 160) ||
    (input.dueAt &&
      (!Number.isFinite(input.dueAt.getTime()) ||
        input.dueAt < input.incurredAt))
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Check the bill dates and reference.",
    )
  }
  if (!input.lines.length || input.lines.length > 50) {
    throw new FinanceError("INVALID_JOURNAL", "An expense requires 1–50 lines.")
  }
  const lines = input.lines.map((line, position) => {
    validateBillText(line.description, "line description", 200)
    return {
      accountId: line.accountId,
      description: line.description.trim(),
      amountMinor: financeAmount(line.amountMinor),
      position,
    }
  })
  const totalMinor = lines.reduce(
    (total, line) => total + line.amountMinor,
    BigInt(0),
  )
  if (totalMinor > MAX_FINANCE_AMOUNT)
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Bill total exceeds the transaction limit.",
    )
  return { lines, totalMinor }
}
