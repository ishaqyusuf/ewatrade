import { expect, test } from "bun:test"
import {
  ledgerDayHeaders,
  ledgerDayLabel,
  ledgerDayPositions,
  ledgerFulfillmentLine,
  ledgerItemsLabel,
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
test("unpaid is red and part-paid amber", () => {
  expect(ledgerPayment("PENDING")).toEqual({ label: "Unpaid", tone: "danger" })
  expect(ledgerPayment("PARTIALLY_PAID")).toEqual({
    label: "Part paid",
    tone: "warn",
  })
})
test("days read Today and Yesterday, then dates", () => {
  const now = new Date(2026, 9, 9, 15)
  expect(ledgerDayLabel(new Date(2026, 9, 9, 8), now)).toBe("Today")
  expect(ledgerDayLabel(new Date(2026, 9, 8, 23), now)).toBe("Yesterday")
  expect(ledgerDayLabel(new Date(2026, 9, 1), now)).not.toBe("Yesterday")
})
test("each day's card rounds its first and last row", () => {
  const positions = ledgerDayPositions([
    order,
    { ...order, id: "b" },
    { ...order, id: "c", createdAt: new Date(2026, 9, 7, 12) },
  ])
  expect(positions.get("a")).toEqual({ first: true, last: false })
  expect(positions.get("b")).toEqual({ first: false, last: true })
  expect(positions.get("c")).toEqual({ first: true, last: true })
})
test("rows summarise items and show open fulfilment only", () => {
  expect(
    ledgerItemsLabel({
      lines: [
        { quantity: "10", snapshot: { catalogItemName: "Broilers" } },
        { quantity: "1", snapshot: { catalogItemName: "Feed" } },
      ],
    }),
  ).toBe("10 × Broilers +1 more")
  expect(ledgerFulfillmentLine("READY_FOR_PICKUP")?.label).toBe(
    "Ready for pickup",
  )
  expect(ledgerFulfillmentLine("COMPLETED")).toBeNull()
})
