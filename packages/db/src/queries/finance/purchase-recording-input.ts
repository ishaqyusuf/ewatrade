import {
  type StockCategorySelector,
  normalizeStockCategorySelectors,
} from "@ewatrade/utils/inventory-categories"
import { FinanceError, MAX_FINANCE_AMOUNT, financeAmount } from "./rules"
import type { FinancePurchaseInput } from "./purchases"
function validateText(value: string, label: string, maximum: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new FinanceError("INVALID_JOURNAL", `Enter a valid ${label}.`)
  }
}

export function normalizeFinancePurchase(input: FinancePurchaseInput) {
  validateText(input.description, "purchase description", 400)
  if (
    (input.reference !== undefined &&
      (typeof input.reference !== "string" || input.reference.length > 160)) ||
    !Number.isFinite(input.incurredAt.getTime()) ||
    (input.dueAt !== undefined &&
      (!Number.isFinite(input.dueAt.getTime()) ||
        input.dueAt < input.incurredAt))
  ) {
    throw new FinanceError(
      "INVALID_JOURNAL",
      "Check the purchase dates and reference.",
    )
  }
  if (
    !Array.isArray(input.lines) ||
    input.lines.length < 1 ||
    input.lines.length > 10
  ) {
    throw new FinanceError("INVALID_JOURNAL", "A purchase requires 1–10 lines.")
  }
  const seenBalances = new Set<string>()
  const lines = input.lines.map((line, position) => {
    validateText(line.balanceSourceId, "Balance Source", 128)
    validateText(line.description, "line description", 200)
    validateText(line.enteredInventoryUnitId, "Inventory Unit", 128)
    validateText(
      line.expectedConfigurationVersionId,
      "configuration version",
      128,
    )
    if (
      !Number.isInteger(line.expectedBalanceRevision) ||
      line.expectedBalanceRevision < 0 ||
      line.expectedBalanceRevision > 2_147_483_647 ||
      !Array.isArray(line.categories) ||
      line.categories.length === 0 ||
      typeof line.enteredQuantity !== "string" ||
      !line.enteredQuantity.trim()
    ) {
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Check the purchase line details.",
      )
    }
    if (seenBalances.has(line.balanceSourceId)) {
      throw new FinanceError(
        "INVALID_JOURNAL",
        "Each purchase line must use a distinct Balance Source.",
      )
    }
    seenBalances.add(line.balanceSourceId)
    let categories: StockCategorySelector[]
    try {
      categories = normalizeStockCategorySelectors(line.categories)
    } catch (error) {
      throw new FinanceError(
        "INVALID_JOURNAL",
        error instanceof Error ? error.message : "Invalid stock categories.",
      )
    }
    return {
      ...line,
      categories,
      description: line.description.trim(),
      amount: financeAmount(line.amountMinor),
      position,
    }
  })
  const totalMinor = lines.reduce(
    (total, line) => total + line.amount,
    BigInt(0),
  )
  if (totalMinor > MAX_FINANCE_AMOUNT) {
    throw new FinanceError(
      "INVALID_AMOUNT",
      "Purchase total exceeds the transaction limit.",
    )
  }
  return { lines, totalMinor }
}
