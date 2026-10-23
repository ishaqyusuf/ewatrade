import { expect, test } from "bun:test"
import { simpleExpenseAction } from "../general/simple-expense"
import { simpleMoneyInAction } from "../general/simple-money-in"
import { simpleSaleAction } from "../general/simple-sale"
import { simpleTransferAction } from "../general/simple-transfer"
import { whatsAppDraftCollectionReply } from "./collection"

test("an incomplete expense asks all known gaps together without asking optional fields", () => {
  const reply = whatsAppDraftCollectionReply(
    simpleExpenseAction.parse({
      action: "expense_record_simple",
    }),
  )
  for (const detail of [
    "Amount",
    "expense was for",
    "already been paid",
    "If already paid",
    "category",
  ])
    expect(reply).toContain(detail)
  expect(reply).not.toMatch(/payee|date|description|bookId|attachment|photo/i)
  const unpaid = whatsAppDraftCollectionReply(
    simpleExpenseAction.parse({
      action: "expense_record_simple",
      amountMinor: 500000,
      description: "Feed",
      paid: false,
      bookId: "book",
      expenseCategoryId: "category",
    }),
  )
  expect(unpaid).toBe("Draft ready for review.")
})

test("owner funds and transfers ask only unresolved requirements, retaining known names as choices", () => {
  const money = whatsAppDraftCollectionReply(
    simpleMoneyInAction.parse({
      action: "money_in_record",
    }),
  )
  expect(money).toContain("1. Amount.")
  expect(money).toContain("2. Account name")
  const transfer = whatsAppDraftCollectionReply(
    simpleTransferAction.parse({
      action: "money_transfer_simple",
      amountMinor: 500000,
      fromMoneyAccountId: "cash",
      fromAccountName: "Shop cash",
      toAccountName: "PalmPay",
    }),
  )
  expect(transfer).toContain("destination matching “PalmPay”")
  expect(transfer).not.toContain("Amount.")
  expect(transfer).not.toContain("Source account")
  expect(transfer).not.toContain("Shop cash")
  expect(
    whatsAppDraftCollectionReply(
      simpleMoneyInAction.parse({
        action: "money_in_record",
        amountMinor: 500000,
        moneyAccountId: "cash",
      }),
    ),
  ).toBe("Draft ready for review.")
})

test("a partially paid sale asks total and description in one reply without repeating resolved customer/account/amount", () => {
  const sale = simpleSaleAction.parse({
    action: "sale_record",
    receivedMinor: 500000,
    partial: true,
    moneyAccountId: "cash",
    accountName: "Shop cash",
    customerId: "ada",
    customerName: "Ada",
  })
  const reply = whatsAppDraftCollectionReply(sale)
  expect(reply).toContain("1. Full sale total")
  expect(reply).toContain("2. What was sold")
  expect(reply).not.toMatch(
    /receiving account|which customer|amount already received for/i,
  )
  expect(
    whatsAppDraftCollectionReply({
      ...sale,
      totalMinor: 800000,
      description: "Egg",
    }),
  ).toBe("Draft ready for review.")
})

test("customer ambiguity remains explicit and optional customer identity is not invented", () => {
  const sale = simpleSaleAction.parse({
    action: "sale_record",
    receivedMinor: 500000,
    moneyAccountId: "cash",
    description: "Egg",
    customerName: "Ada",
  })
  expect(whatsAppDraftCollectionReply(sale)).toContain(
    "Which customer matches “Ada”",
  )
  expect(
    whatsAppDraftCollectionReply({ ...sale, customerName: undefined }),
  ).toBe("Draft ready for review.")
})
