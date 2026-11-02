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

/** Server totals, one formatted amount per currency. */
export function exactPaymentTotals(
  totals: Array<{ currencyCode: string; totalAmountMinor: number }>,
) {
  return totals.map((total) =>
    formatFinanceMoney(String(total.totalAmountMinor), total.currencyCode),
  )
}

/** Local midnight to the next midnight around a moment, for day totals. */
export function paymentDayWindow(value: Date | string) {
  const recordedAfter = new Date(value)
  recordedAfter.setHours(0, 0, 0, 0)
  const recordedBefore = new Date(recordedAfter)
  recordedBefore.setDate(recordedBefore.getDate() + 1)
  return { recordedAfter, recordedBefore }
}
