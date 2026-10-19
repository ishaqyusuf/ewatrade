import { expect, test } from "bun:test"
import {
  type NativeMoneyAction,
  nativeMoneyCandidate,
} from "./native-money-values"

const income: NativeMoneyAction = {
  action: "money_in_record",
  amountMinor: 5000,
  accountName: "Shop cash",
  moneyAccountId: "cash",
  createAccount: false,
  description: "",
  effectiveAt: "2026-10-15T10:00:00.000Z",
  attachmentIds: ["sent-photo"],
}
const transfer: NativeMoneyAction = {
  action: "money_transfer_simple",
  amountMinor: 10000,
  fromMoneyAccountId: "cash",
  fromAccountName: "Shop cash",
  toMoneyAccountId: "bank",
  toAccountName: "Bank",
  bookId: "book",
  note: "",
  attachmentIds: [],
  effectiveAt: income.effectiveAt,
}
const expense: NativeMoneyAction = {
  action: "expense_record_simple",
  amountMinor: 10000,
  moneyAccountId: "cash",
  accountName: "Shop cash",
  bookId: "book",
  paid: true,
  expenseCategoryId: "category",
  categoryName: "Transport",
  description: "Fuel",
  attachmentIds: [],
  effectiveAt: income.effectiveAt,
}

test("native money edits retain the exact reviewed date and account facts while converting money exactly", () => {
  for (const initial of [income, transfer, expense]) {
    const result = nativeMoneyCandidate(initial, initial, "1,250.01")
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(result.payload).toEqual({ ...initial, amountMinor: 125001 })
  }
})
test("invalid precision, nonpositive and unsafe amounts refuse before re-review", () => {
  for (const amount of [
    "1.001",
    "-1",
    "0",
    "1e3",
    "NaN",
    "1000000000001",
    "1,00",
  ])
    expect(nativeMoneyCandidate(income, income, amount).ok).toBe(false)
  const incomplete = nativeMoneyCandidate(income, income, "")
  expect(
    incomplete.ok &&
      incomplete.payload.action === "money_in_record" &&
      incomplete.payload.amountMinor,
  ).toBeUndefined()
})
test("money edits cannot switch the operation, Book or saved posting instant", () => {
  expect(nativeMoneyCandidate(income, transfer, "20").ok).toBe(false)
  expect(
    nativeMoneyCandidate(transfer, { ...transfer, bookId: "foreign" }, "20").ok,
  ).toBe(false)
  expect(
    nativeMoneyCandidate(expense, { ...expense, effectiveAt: undefined }, "20")
      .ok,
  ).toBe(false)
  const noBook = { ...expense, bookId: undefined }
  expect(
    nativeMoneyCandidate(noBook, { ...noBook, bookId: "injected" }, "20").ok,
  ).toBe(false)
})
test("only original sent attachments may remain, with no duplicates or extra authority fields", () => {
  expect(
    nativeMoneyCandidate(income, { ...income, attachmentIds: [] }, "20").ok,
  ).toBe(true)
  expect(
    nativeMoneyCandidate(
      income,
      { ...income, attachmentIds: ["other-photo"] },
      "20",
    ).ok,
  ).toBe(false)
  expect(
    nativeMoneyCandidate(
      income,
      { ...income, attachmentIds: ["sent-photo", "sent-photo"] },
      "20",
    ).ok,
  ).toBe(false)
  expect(
    nativeMoneyCandidate(
      income,
      { ...income, actorUserId: "other" } as never,
      "20",
    ).ok,
  ).toBe(false)
})
test("an unpaid expense drops funding facts instead of retaining a hidden payment", () => {
  const result = nativeMoneyCandidate(
    expense,
    { ...expense, paid: false },
    "50.25",
  )
  expect(result.ok).toBe(true)
  if (result.ok && result.payload.action === "expense_record_simple") {
    expect(result.payload.moneyAccountId).toBeUndefined()
    expect(result.payload.accountName).toBeUndefined()
    expect(result.payload.expenseCategoryId).toBe("category")
    expect(result.payload.amountMinor).toBe(5025)
  }
})
test("same-account transfers and ambiguous staged destinations are refused", () => {
  expect(
    nativeMoneyCandidate(
      transfer,
      { ...transfer, toMoneyAccountId: "cash" },
      "20",
    ).ok,
  ).toBe(false)
  expect(
    nativeMoneyCandidate(
      transfer,
      { ...transfer, toAccountName: " SHOP cash " },
      "20",
    ).ok,
  ).toBe(false)
  expect(
    nativeMoneyCandidate(
      transfer,
      { ...transfer, newToAccount: { name: "New bank", kind: "BANK" } },
      "20",
    ).ok,
  ).toBe(false)
  expect(
    nativeMoneyCandidate(
      transfer,
      {
        ...transfer,
        toMoneyAccountId: undefined,
        toAccountName: "New bank",
        newToAccount: { name: "Other bank", kind: "BANK" },
      },
      "20",
    ).ok,
  ).toBe(false)
  const staged = {
    ...transfer,
    toMoneyAccountId: undefined,
    toAccountName: "New bank",
    newToAccount: { name: "New bank", kind: "BANK" as const },
  }
  expect(nativeMoneyCandidate(transfer, staged, "20").ok).toBe(true)
})
