import type { HeroStat } from "./green-till/hero-card"
import { exactPaymentTotals } from "./payment-display"

/** Received-payment methods the server filters on, in chip order. */
export const PAYMENT_METHOD_FILTERS = [
  "cash",
  "bank_transfer",
  "pos",
  "card",
  "other",
] as const
export type PaymentMethodFilter = (typeof PAYMENT_METHOD_FILTERS)[number]

const LABELS: Record<PaymentMethodFilter, string> = {
  bank_transfer: "Transfer",
  card: "Card",
  cash: "Cash",
  other: "Other",
  pos: "POS",
}

/** "BANK_TRANSFER" (a payment's method) to its filter key, if it has one. */
export function paymentMethodFilter(method: string) {
  const key = method.toLowerCase()
  return (PAYMENT_METHOD_FILTERS as readonly string[]).includes(key)
    ? (key as PaymentMethodFilter)
    : null
}

export function paymentMethodLabel(method: string) {
  const key = paymentMethodFilter(method)
  return key ? LABELS[key] : method
}

type MethodTotals = Array<{
  currencyCode: string
  totalAmountMinor: number
  byMethod: Array<{ amountMinor: number; count: number; method: string }>
}>

/**
 * "All" plus one chip per method that has payments, with exact counts across
 * currencies. A picked method stays even at 0, so it can always be cleared.
 */
export function paymentMethodChips(
  totals: MethodTotals,
  picked: PaymentMethodFilter | "all" = "all",
) {
  const counts = new Map<PaymentMethodFilter, number>()
  let all = 0
  for (const currency of totals)
    for (const row of currency.byMethod) {
      const key = paymentMethodFilter(row.method)
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + row.count)
      all += row.count
    }
  const methods = PAYMENT_METHOD_FILTERS.filter(
    (key) => (counts.get(key) ?? 0) > 0 || key === picked,
  )
  return {
    labels: {
      all: `All ${all}`,
      ...Object.fromEntries(
        methods.map((key) => [key, `${LABELS[key]} ${counts.get(key) ?? 0}`]),
      ),
    } as Record<PaymentMethodFilter | "all", string>,
    values: ["all", ...methods] as Array<PaymentMethodFilter | "all">,
  }
}

/**
 * The hero's method split for one currency: up to three methods, largest
 * first, with any further methods folded into "Other". Several currencies
 * are never added together, so they get no split.
 */
export function paymentMethodStats(totals: MethodTotals): HeroStat[] {
  const [only, ...rest] = totals
  if (!only || rest.length) return []
  const rows = only.byMethod
    .filter((row) => row.amountMinor > 0)
    .sort((a, b) => b.amountMinor - a.amountMinor)
  if (rows.length < 2) return []
  const shown = rows.length > 3 ? rows.slice(0, 2) : rows
  const folded = rows.slice(shown.length)
  // Same decimals as the hero total and the rows; the hero shrinks a long
  // value to fit its column rather than dropping digits.
  const money = (amountMinor: number) =>
    exactPaymentTotals([
      { currencyCode: only.currencyCode, totalAmountMinor: amountMinor },
    ])[0] ?? ""
  return [
    ...shown.map((row) => ({
      label: paymentMethodLabel(row.method),
      value: money(row.amountMinor),
    })),
    ...(folded.length
      ? [
          {
            label: "Other",
            value: money(folded.reduce((sum, row) => sum + row.amountMinor, 0)),
          },
        ]
      : []),
  ]
}
