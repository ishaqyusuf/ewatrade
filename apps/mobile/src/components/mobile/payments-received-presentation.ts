import { formatMinorMoney } from "@ewatrade/utils"

export const PAYMENTS_RECEIVED_COPY = {
  error: "Payments could not be loaded. Check your connection and try again.",
  purpose: "Every payment recorded against an order, in one place.",
  trailDetail:
    "Refunds stay with their orders and are not counted in this received-payments list.",
  trailTitle: "Built for a clear payment trail",
} as const

export function buildPaymentsReceivedPresentation(input: {
  currencyTotals: Array<{ currencyCode: string; totalAmountMinor: number }>
  defaultCurrencyCode: string
  isPending: boolean
  query: string
  totalCount: number
}) {
  const hasQuery = input.query.trim().length > 0
  const amountLabel =
    input.currencyTotals.length > 1
      ? `${input.currencyTotals.length} currencies`
      : formatMinorMoney(
          input.currencyTotals[0]?.totalAmountMinor ?? 0,
          input.currencyTotals[0]?.currencyCode ?? input.defaultCurrencyCode,
        )
  const currencyAmountRows =
    input.currencyTotals.length > 1
      ? input.currencyTotals.map((total) =>
          formatMinorMoney(total.totalAmountMinor, total.currencyCode),
        )
      : []

  return {
    amountLabel,
    currencyAmountRows,
    emptyMessage: input.isPending
      ? "Reading received payment records."
      : hasQuery
        ? "Try an order number, customer, reference, or receiver."
        : "Payments you record against orders will appear here with the order, method, time, and team member.",
    emptyTitle: input.isPending
      ? "Loading payments"
      : hasQuery
        ? "No matching payments"
        : "No payments yet",
    showSearch: input.totalCount > 0 || hasQuery,
  }
}
