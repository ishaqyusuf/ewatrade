import { expect, test } from "bun:test"
import { collectedDetailsText } from "./collected-details"
import { expenseFactsFromText } from "./simple-expense"
import { moneyInFactsFromText } from "./simple-money-in"
import { saleFactsFromText } from "./simple-sale"
import { transferFactsFromText } from "./simple-transfer"

test("numbered bundled expense answers preserve amount, purpose, unpaid status, account and category", () => {
  expect(
    expenseFactsFromText(
      "1. Amount: 5k\n2. Purpose: Feed\n3. Paid: no\n4. Account: Shop cash\n5. Category: Materials",
    ),
  ).toEqual({
    amountMinor: 500000,
    description: "Feed",
    paid: false,
    accountName: "Shop cash",
    categoryName: "Materials",
  })
})

test("one bundled message supplies both transfer accounts and amount", () => {
  expect(
    transferFactsFromText(
      "1. Amount: 5000\n2. Source account: Shop cash\n3. Destination account: PalmPay",
    ),
  ).toEqual({
    amountMinor: 500000,
    fromAccountName: "Shop cash",
    toAccountName: "PalmPay",
  })
  expect(
    moneyInFactsFromText("1. Amount: 5000\n2. Account: Shop cash"),
  ).toEqual({ amountMinor: 500000, accountName: "Shop cash" })
})

test("bundled sale answers retain the received amount, total, account and explicit description", () => {
  expect(
    saleFactsFromText(
      "1. Received: 5k\n2. Total: 8k\n3. Account: Shop cash\n4. Description: Eggs",
    ),
  ).toEqual({
    receivedMinor: 500000,
    totalMinor: 800000,
    accountName: "Shop cash",
    description: "Eggs",
    partial: true,
  })
})

test("list numbering never changes decimal amounts or unit facts", () => {
  const text = "1.5 crates\n1.50 naira\n1.2.3\n1. Amount: 1.50"
  expect(collectedDetailsText(text)).toBe(
    "1.5 crates\n1.50 naira\n1.2.3\nAmount: 1.50",
  )
  expect(
    moneyInFactsFromText("Amount: 1.50\nAccount: Shop cash").amountMinor,
  ).toBe(150)
})
