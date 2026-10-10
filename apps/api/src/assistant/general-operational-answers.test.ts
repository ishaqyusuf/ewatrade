import { expect, test } from "bun:test"
import { generalOperationalAnswers } from "./general-operational-answers"

test("exact counts and each currency are presented without rounding or ledger claims", () => {
  const cards = generalOperationalAnswers({
    summary: {
      complete: true,
      orderCount: "9007199254740993",
      outstandingCount: "2",
      currencies: [
        {
          currencyCode: "NGN",
          orderCount: "1",
          orderValueMinor: "9007199254740993123",
          outstandingMinor: "9007199254740993123",
          outstandingCount: "1",
        },
        {
          currencyCode: "USD",
          orderCount: "1",
          orderValueMinor: "1",
          outstandingMinor: "1",
          outstandingCount: "1",
        },
      ],
    },
    storeName: "QA Store",
    ownOrders: true,
    statuses: ["CONFIRMED"],
    createdBefore: "2026-01-02T00:00:00Z",
  })
  expect(cards.map((card) => card.value)).toEqual([
    "9007199254740993",
    "₦90,071,992,547,409,931.23",
    "US$0.01",
  ])
  expect(cards[1]?.detail).toContain("not customer ledger debt")
  expect(cards[0]?.detail).toContain("Statuses: CONFIRMED")
  expect(cards[0]?.scope).toContain("Your orders")
  expect(cards[0]?.scope).toContain("Until Thu 1 Jan")
})
test("known empty aggregate produces an exact zero count without inventing a currency balance", () => {
  const cards = generalOperationalAnswers({
    summary: {
      complete: true,
      orderCount: "0",
      outstandingCount: "0",
      currencies: [],
    },
    storeName: "QA",
    ownOrders: false,
  })
  expect(cards).toHaveLength(1)
  expect(cards[0]?.value).toBe("0")
})
