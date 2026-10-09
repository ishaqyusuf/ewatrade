import { expect, test } from "bun:test"
import {
  ledgerDayHeaders,
  ledgerMoney,
  ledgerPayment,
} from "./orders-ledger-model"
const order = {
  id: "a",
  createdAt: new Date(2026, 9, 8, 12),
  totalMinor: 10000,
  balanceDueMinor: 5000,
  currencyCode: "NGN",
  status: "CONFIRMED",
}
test("ledger never combines currencies or presents missing records as zero", () => {
  expect(ledgerMoney([])).toBe("—")
  expect(ledgerMoney([order, { ...order, id: "b", currencyCode: "USD" }])).toBe(
    "Mixed currencies",
  )
  expect(
    ledgerMoney([{ ...order, status: "CANCELLED" }], "balanceDueMinor"),
  ).not.toContain("50")
})
test("only the first record in each local day gets its loaded subtotal", () => {
  const headers = ledgerDayHeaders([
    order,
    { ...order, id: "b" },
    { ...order, id: "c", createdAt: new Date(2026, 9, 7, 12) },
  ])
  expect([...headers.keys()]).toEqual(["a", "c"])
  expect(headers.get("a")?.total).toContain("200")
  expect(headers.get("c")?.total).toContain("100")
})
test("unpaid and part-paid states use warning pills", () => {
  expect(ledgerPayment("PENDING")).toEqual({ label: "Unpaid", tone: "warn" })
  expect(ledgerPayment("PARTIALLY_PAID")).toEqual({
    label: "Part paid",
    tone: "warn",
  })
})
