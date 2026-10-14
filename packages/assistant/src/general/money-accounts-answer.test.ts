import { expect, test } from "bun:test"
import { generalAnswerSchema } from "./contracts"
import { generalMoneyAccountsAnswer } from "./money-accounts-answer"

const shopCash = {
  name: "Shop cash",
  purpose: "CASH",
  paymentMethods: ["cash" as const],
  availableForPayments: true,
}
const page = {
  book: { currencyCode: "NGN" },
  accounts: [
    shopCash,
    {
      name: "palmpay 02",
      purpose: "BANK",
      paymentMethods: ["bank_transfer" as const],
      availableForPayments: false,
    },
    {
      name: "Payments awaiting settlement",
      purpose: "CLEARING",
      paymentMethods: ["pos" as const, "card" as const, "other" as const],
      availableForPayments: true,
    },
  ],
  nextCursor: null,
}

test("account rows come from the read, with plain kinds and defaults marked", () => {
  const answer = generalAnswerSchema.parse(generalMoneyAccountsAnswer(page))
  expect(answer.title).toBe("Money accounts")
  expect(answer.value).toBe("3 accounts")
  expect(answer.accounts).toEqual({
    rows: [
      {
        name: "Shop cash",
        kind: "cash",
        methods: ["cash"],
        defaultMethods: true,
        paused: false,
      },
      {
        name: "palmpay 02",
        kind: "bank",
        methods: ["bank_transfer"],
        defaultMethods: false,
        paused: true,
      },
      {
        name: "Payments awaiting settlement",
        kind: "settlement",
        methods: ["pos", "card", "other"],
        defaultMethods: true,
        paused: false,
      },
    ],
    more: false,
  })
  expect(answer.detail).not.toContain("CLEARING")
  expect(answer.detail).not.toContain("on this page")
})

test("a further page is flagged without guessing a total", () => {
  const answer = generalMoneyAccountsAnswer({ ...page, nextCursor: "1020" })
  expect(answer.value).toBe("3 accounts shown")
  expect(answer.accounts.more).toBe(true)
  expect(answer.detail).toContain("More accounts not shown.")
})

test("no accounts reads plainly and unknown purposes are left out", () => {
  const empty = generalMoneyAccountsAnswer({ ...page, accounts: [] })
  expect(empty.value).toBe("0 accounts")
  expect(empty.accounts.rows).toEqual([])
  expect(empty.detail).toContain("No money accounts yet.")
  const odd = generalMoneyAccountsAnswer({
    ...page,
    accounts: [{ ...shopCash, purpose: "EQUITY" }],
  })
  expect(odd.accounts.rows).toEqual([])
})

test("answers without rows still parse and oversize pages are refused", () => {
  const { accounts: _, ...plain } = generalMoneyAccountsAnswer(page)
  expect(generalAnswerSchema.safeParse(plain).success).toBe(true)
  const [row] = generalMoneyAccountsAnswer(page).accounts.rows
  expect(
    generalAnswerSchema.safeParse({
      ...plain,
      accounts: { rows: Array(11).fill(row), more: false },
    }).success,
  ).toBe(false)
  expect(
    generalAnswerSchema.safeParse({
      ...plain,
      accounts: { rows: [{ ...row, balanceMinor: 100 }], more: false },
    }).success,
  ).toBe(false)
})
