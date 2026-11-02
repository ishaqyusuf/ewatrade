import { expect, test } from "bun:test"
import {
  exactPaymentTotals,
  loadedPaymentTotals,
  paymentDayWindow,
  paymentTint,
} from "./payment-display"
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

test("server payment totals format per currency", () => {
  expect(
    exactPaymentTotals([
      { currencyCode: "NGN", totalAmountMinor: 1_250_000 },
      { currencyCode: "USD", totalAmountMinor: 2_500 },
    ]),
  ).toEqual(
    loadedPaymentTotals([
      { amountMinor: 1_250_000, order: { currencyCode: "NGN" } },
      { amountMinor: 2_500, order: { currencyCode: "USD" } },
    ]),
  )
})

test("a payment day runs from local midnight to the next", () => {
  const window = paymentDayWindow(new Date(2026, 10, 2, 15, 30))
  expect(window.recordedAfter).toEqual(new Date(2026, 10, 2))
  expect(window.recordedBefore).toEqual(new Date(2026, 10, 3))
})
