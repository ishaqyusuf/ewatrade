/** Ways a customer pays an order, in the order the dashboard lists them. */
export const ORDER_PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "pos",
  "card",
  "other",
] as const
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number]

export const ORDER_PAYMENT_METHOD_LABELS: Record<OrderPaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  pos: "POS",
  card: "Card",
  other: "Other",
}

export type MoneyAccountPurpose = "CASH" | "BANK" | "CLEARING"

/** What an account takes until an owner picks its methods. */
export const DEFAULT_MONEY_ACCOUNT_PAYMENT_METHODS: Record<
  MoneyAccountPurpose,
  readonly OrderPaymentMethod[]
> = {
  CASH: ["cash"],
  BANK: ["bank_transfer", "pos", "card"],
  CLEARING: ["pos", "card", "other"],
}

function isOrderPaymentMethod(value: string): value is OrderPaymentMethod {
  return (ORDER_PAYMENT_METHODS as readonly string[]).includes(value)
}

/** Cash only lands in cash accounts, and cash accounts only take cash. */
export function moneyAccountCanTake(
  purpose: MoneyAccountPurpose,
  method: OrderPaymentMethod,
) {
  return (purpose === "CASH") === (method === "cash")
}

/**
 * The methods an account takes. Stored values may be the database enum
 * (`BANK_TRANSFER`); an empty list means the account type's defaults.
 */
export function moneyAccountPaymentMethods(account: {
  purpose: MoneyAccountPurpose
  paymentMethods: readonly string[]
}): OrderPaymentMethod[] {
  const stored = account.paymentMethods.map((value) => value.toLowerCase())
  const chosen = stored.length
    ? stored
    : DEFAULT_MONEY_ACCOUNT_PAYMENT_METHODS[account.purpose]
  return ORDER_PAYMENT_METHODS.filter(
    (method) =>
      chosen.includes(method) && moneyAccountCanTake(account.purpose, method),
  )
}

/** Returns why a method list can't be saved for an account, or null. */
export function moneyAccountPaymentMethodsProblem(
  purpose: MoneyAccountPurpose,
  methods: readonly string[],
) {
  if (!methods.length) return "Choose at least one payment method."
  if (new Set(methods).size !== methods.length)
    return "Choose each payment method once."
  for (const method of methods) {
    if (!isOrderPaymentMethod(method)) return "Choose a valid payment method."
    if (!moneyAccountCanTake(purpose, method))
      return purpose === "CASH"
        ? "Cash accounts only take cash."
        : "Cash payments go into a cash account."
  }
  return null
}
