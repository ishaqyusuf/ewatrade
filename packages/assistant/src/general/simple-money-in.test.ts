import { expect, test } from "bun:test"
import {
  isSimpleMoneyInIntent,
  moneyInFactsFromText,
  simpleMoneyInAction,
  simpleMoneyInStep,
} from "./simple-money-in"
import { canonicalStatedMoneyDraft } from "./stated-money"
test("common money-in captions parse exact amount and account", () => {
  for (const [text, amountMinor, accountName] of [
    ["Put 20k into Shop cash", 2000000, "Shop cash"],
    ["drop 50 thousand in Ishaq PalmPay account", 5000000, "Ishaq PalmPay"],
    ["add 1.5m to Bank 02 today", 150000000, "Bank 02"],
  ] as const) {
    expect(isSimpleMoneyInIntent(text)).toBe(true)
    expect(moneyInFactsFromText(text)).toMatchObject({
      amountMinor,
      accountName,
    })
  }
  expect(moneyInFactsFromText("amount 20k")).toEqual({ amountMinor: 2000000 })
  expect(
    moneyInFactsFromText("put 20,00 into cash").amountMinor,
  ).toBeUndefined()
  expect(moneyInFactsFromText("put -20k into cash").amountMinor).toBeUndefined()
})
test("other money owners are not silently capital contributions", () => {
  for (const text of [
    "order 20k paid to cash",
    "customer deposit 20k in cash",
    "loan 20k into cash",
    "transfer between accounts",
    "opening balance 20k into cash",
    "refund 20k into cash",
  ])
    expect(isSimpleMoneyInIntent(text)).toBe(false)
  expect(isSimpleMoneyInIntent("put 20k into cash, no sale")).toBe(true)
})
test("amount/account first, description optional, schema blocks extracted money", () => {
  const empty = simpleMoneyInAction.parse({ action: "money_in_record" })
  expect(simpleMoneyInStep(empty)).toBe("amount")
  expect(empty.description).toBe("")
  expect(simpleMoneyInStep({ ...empty, amountMinor: 2000000 })).toBe("account")
  expect(
    simpleMoneyInStep({
      ...empty,
      amountMinor: 2000000,
      accountName: "New Bank",
      createAccount: true,
    }),
  ).toBe("review")
  expect(
    simpleMoneyInAction.safeParse({ ...empty, amountMinor: 0 }).success,
  ).toBe(false)
  expect(
    simpleMoneyInAction.safeParse({
      ...empty,
      amountMinor: 2000000,
      extraction: { amount: 5 },
    }).success,
  ).toBe(false)
  expect(
    canonicalStatedMoneyDraft({ action: "money_in_record", amount: "20000" }),
  ).toMatchObject({ amountMinor: 2000000 })
})
