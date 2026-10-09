/** Outcome codes shared by the setup add step and its record-specific helpers. */

export const OPENING_BALANCE_NEEDS_FINANCE = "OPENING_BALANCE_NEEDS_FINANCE"
export const OPENING_BALANCE_FAILED = "OPENING_BALANCE_FAILED"
/** Set with the customer so an interrupted request still retries the balance. */
export const OPENING_BALANCE_PENDING = "OPENING_BALANCE_PENDING"
/** A money account cannot exist without the business Finance book. */
export const MONEY_ACCOUNT_NEEDS_FINANCE = "MONEY_ACCOUNT_NEEDS_FINANCE"
/** Informational: the cash pocket went onto the book's existing Shop cash account. */
export const MONEY_ACCOUNT_SHOP_CASH = "MONEY_ACCOUNT_SHOP_CASH"

export const isOpeningBalancePending = (code: string | null | undefined) =>
  code === OPENING_BALANCE_NEEDS_FINANCE ||
  code === OPENING_BALANCE_FAILED ||
  code === OPENING_BALANCE_PENDING
