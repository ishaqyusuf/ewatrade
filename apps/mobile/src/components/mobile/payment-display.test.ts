import { expect, test } from "bun:test"
import { loadedPaymentTotals, paymentTint } from "./payment-display"
test("loaded payment totals keep currencies separate and sum exactly", () => {
  expect(
    loadedPaymentTotals([
      { amountMinor: 100, order: { currencyCode: "NGN" } },
      { amountMinor: 250, order: { currencyCode: "NGN" } },
      { amountMinor: 100, order: { currencyCode: "USD" } },
    ]),
  ).toHaveLength(2)
  expect(loadedPaymentTotals([])).toEqual([])
  expect(
    loadedPaymentTotals([
      { amountMinor: 100, order: { currencyCode: "USD" } },
      { amountMinor: 250, order: { currencyCode: "USD" } },
    ])[0],
  ).toContain("3.50")
  expect(paymentTint("CASH")).toBe("mint")
  expect(paymentTint("BANK_TRANSFER")).toBe("sky")
})
