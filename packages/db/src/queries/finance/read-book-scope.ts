import type { FinanceActor } from "./access"
import { FinanceError } from "./rules"

export type FinanceReadBookScope =
  | { bookId: string }
  | { currentCurrency: string }

/** Current-book inputs never select another currency or replace fresh admission. */
export function financeReadBookWhere(
  input: FinanceActor & FinanceReadBookScope,
  currencyCode: string,
) {
  if ("bookId" in input && !("currentCurrency" in input))
    return { id: input.bookId, tenantId: input.tenantId }
  if (
    !("bookId" in input) &&
    "currentCurrency" in input &&
    input.currentCurrency === currencyCode
  )
    return { tenantId: input.tenantId, currencyCode }
  throw new FinanceError("NOT_FOUND", "Financial book not found.")
}

export function financeReadBookIdentity(
  input: FinanceReadBookScope,
  bookId: string,
) {
  return "currentCurrency" in input ? { resolvedBookId: bookId } : {}
}
