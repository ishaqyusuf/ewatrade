import { formatFinanceMoney } from "@ewatrade/utils/finance-money"

export function paymentDay(value: Date | string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}
export function paymentTint(method: string) {
  return method === "CASH"
    ? "mint"
    : method === "BANK_TRANSFER"
      ? "sky"
      : "amber"
}
export function loadedPaymentTotals(
  rows: Array<{ amountMinor: number; order: { currencyCode: string } }>,
) {
  const totals = new Map<string, bigint>()
  for (const row of rows)
    totals.set(
      row.order.currencyCode,
      (totals.get(row.order.currencyCode) ?? 0n) + BigInt(row.amountMinor),
    )
  return [...totals].map(([currency, amount]) =>
    formatFinanceMoney(amount.toString(), currency),
  )
}
