import { expect, test } from "bun:test"
import {
  paymentMethodChips,
  paymentMethodFilter,
  paymentMethodLabel,
  paymentMethodStats,
} from "./payment-methods"

const ngn = (
  byMethod: Array<{ amountMinor: number; count: number; method: string }>,
) => ({
  byMethod,
  currencyCode: "NGN",
  totalAmountMinor: byMethod.reduce((sum, row) => sum + row.amountMinor, 0),
})

test("method keys and labels follow the server's method names", () => {
  expect(paymentMethodFilter("BANK_TRANSFER")).toBe("bank_transfer")
  expect(paymentMethodFilter("CUSTOMER_CREDIT")).toBeNull()
  expect(paymentMethodLabel("BANK_TRANSFER")).toBe("Transfer")
  expect(paymentMethodLabel("POS")).toBe("POS")
})

test("chips count every currency and skip methods with no payments", () => {
  const chips = paymentMethodChips([
    ngn([
      { amountMinor: 100, count: 3, method: "CASH" },
      { amountMinor: 50, count: 2, method: "POS" },
    ]),
    {
      byMethod: [{ amountMinor: 900, count: 1, method: "CASH" }],
      currencyCode: "USD",
      totalAmountMinor: 900,
    },
  ])
  expect(chips.values).toEqual(["all", "cash", "pos"])
  expect(chips.labels).toEqual({ all: "All 6", cash: "Cash 4", pos: "POS 2" })
})

test("a picked method with no payments stays so it can be cleared", () => {
  const chips = paymentMethodChips(
    [ngn([{ amountMinor: 100, count: 3, method: "CASH" }])],
    "card",
  )
  expect(chips.values).toEqual(["all", "cash", "card"])
  expect(chips.labels.card).toBe("Card 0")
})

test("hero split lists up to three methods, largest first", () => {
  expect(
    paymentMethodStats([
      ngn([
        { amountMinor: 187_000_000, count: 742, method: "CASH" },
        { amountMinor: 231_150_000, count: 618, method: "BANK_TRANSFER" },
        { amountMinor: 50_800_000, count: 171, method: "POS" },
      ]),
    ]),
  ).toEqual([
    { label: "Transfer", value: "₦2,311,500.00" },
    { label: "Cash", value: "₦1,870,000.00" },
    { label: "POS", value: "₦508,000.00" },
  ])
})

test("more than three methods fold into Other", () => {
  const stats = paymentMethodStats([
    ngn([
      { amountMinor: 400, count: 1, method: "CASH" },
      { amountMinor: 300, count: 1, method: "BANK_TRANSFER" },
      { amountMinor: 200, count: 1, method: "POS" },
      { amountMinor: 150, count: 1, method: "CARD" },
    ]),
  ])
  expect(stats.map((stat) => stat.label)).toEqual(["Cash", "Transfer", "Other"])
  expect(stats[2]?.value).toBe("₦3.50")
})

test("no split for one method or several currencies", () => {
  expect(
    paymentMethodStats([ngn([{ amountMinor: 1, count: 1, method: "CASH" }])]),
  ).toEqual([])
  expect(
    paymentMethodStats([
      ngn([
        { amountMinor: 1, count: 1, method: "CASH" },
        { amountMinor: 1, count: 1, method: "POS" },
      ]),
      { byMethod: [], currencyCode: "USD", totalAmountMinor: 0 },
    ]),
  ).toEqual([])
})
