import { expect, test } from "bun:test"
import {
  expenseFactsFromText,
  isSimpleExpenseIntent,
  simpleExpenseAction,
  simpleExpenseStep,
} from "./simple-expense"
test("spent captions derive exact money, purpose and paid-from account from text", () => {
  for (const text of [
    "spent 5k on feed from Shop cash",
    "paid 5,000 for feed using Shop cash",
    "spent ₦5,000 on feed from Shop cash account",
  ]) {
    expect(isSimpleExpenseIntent(text)).toBe(true)
    expect(expenseFactsFromText(text)).toMatchObject({
      amountMinor: 500000,
      description: "feed",
      accountName: "Shop cash",
      paid: true,
    })
  }
  expect(
    expenseFactsFromText("spent 2500.50 on transport from bank 1").amountMinor,
  ).toBe(250050)
  expect(expenseFactsFromText("amount 6k")).toEqual({ amountMinor: 600000 })
})
test("unpaid is explicit; planned spending, stock and existing bill payments stay with their owners", () => {
  expect(expenseFactsFromText("expense 5k for feed unpaid").paid).toBe(false)
  expect(expenseFactsFromText("expense 5k for feed").paid).toBeUndefined()
  for (const text of [
    "expense 10k for feed paid 5k from cash",
    "partially paid 5k for feed",
    "will spend 5k on feed",
    "spend 5k on feed",
    "pay the bill 5k from cash",
    "supplier invoice for feed",
    "stock receipt 5k",
    "inventory purchase 5k",
    "put 5k into cash",
    "order 5k paid to cash",
  ]) {
    expect(isSimpleExpenseIntent(text)).toBe(false)
  }
})
test("incomplete drafts stay unsigned steps; receipt metadata cannot supply money", () => {
  let d = simpleExpenseAction.parse({ action: "expense_record_simple" })
  expect(simpleExpenseStep(d)).toBe("amount")
  d = { ...d, amountMinor: 500000 }
  expect(simpleExpenseStep(d)).toBe("description")
  d = { ...d, description: "feed" }
  expect(simpleExpenseStep(d)).toBe("paid")
  d = { ...d, paid: true }
  expect(simpleExpenseStep(d)).toBe("account")
  d = { ...d, moneyAccountId: "cash" }
  expect(simpleExpenseStep(d)).toBe("category")
  d = { ...d, bookId: "book", expenseCategoryId: "expense" }
  expect(simpleExpenseStep(d)).toBe("review")
  expect(
    simpleExpenseStep({ ...d, paid: false, moneyAccountId: undefined }),
  ).toBe("review")
  for (const change of [
    { amountMinor: 0 },
    { amountMinor: -1 },
    { amountMinor: 1.5 },
    { amountMinor: 100_000_000_000_001 },
    { extractedAmount: 5000 },
    { attachmentIds: Array(8).fill("file") },
  ])
    expect(simpleExpenseAction.safeParse({ ...d, ...change }).success).toBe(
      false,
    )
})
