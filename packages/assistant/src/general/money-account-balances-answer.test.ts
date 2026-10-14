import { expect, test } from "bun:test"
import { generalAnswerSchema } from "./contracts"
import { generalMoneyAccountBalancesPage } from "./money-account-balances-answer"
const account = {
  id: "cash",
  code: "1000",
  name: "Shop cash",
  purpose: "CASH",
  kind: "ASSET",
  archivedAt: null,
  paymentsPausedAt: null,
  paymentMethods: [],
  balanceMinor: "0",
}
const source = {
  currencyCode: "NGN",
  startsAt: new Date("2026-10-13T12:00:00Z"),
  snapshotSequence: "7",
  accounts: [
    { ...account, balanceMinor: "1500000" },
    {
      ...account,
      id: "bank",
      code: "1100",
      name: "Bank",
      purpose: "BANK",
      balanceMinor: "-12345",
    },
    {
      ...account,
      id: "expense",
      code: "6000",
      name: "Expenses",
      purpose: "OPERATING_EXPENSE",
      kind: "EXPENSE",
      balanceMinor: "500000",
    },
    {
      ...account,
      id: "archived",
      code: "1110",
      archivedAt: new Date(),
      balanceMinor: "900000",
    },
  ],
}
test("balances are exact recorded signed strings, with only active money accounts", () => {
  const result = generalMoneyAccountBalancesPage(source)
  const answer = generalAnswerSchema.parse(result.answer)
  expect(answer.title).toBe("Account balances")
  expect(answer.accounts?.currencyCode).toBe("NGN")
  expect(answer.accounts?.rows.map((r) => [r.name, r.balanceMinor])).toEqual([
    ["Shop cash", "1500000"],
    ["Bank", "-12345"],
  ])
  expect(answer.scope).toContain("13 Oct 2026")
  expect(answer.scope).toContain("snapshot 7")
  expect(result.page.accounts).toHaveLength(2)
})
test("bounded pages preserve real zero and mark more without inventing totals", () => {
  const many = {
    ...source,
    accounts: Array.from({ length: 11 }, (_, i) => ({
      ...account,
      id: `a${i}`,
      code: `1${String(i).padStart(3, "0")}`,
      name: `Account ${i}`,
    })),
  }
  const first = generalMoneyAccountBalancesPage(many)
  expect(first.answer.accounts.rows).toHaveLength(10)
  expect(first.answer.accounts.rows[0]?.balanceMinor).toBe("0")
  expect(first.answer.accounts.more).toBe(true)
  expect(first.page.nextCursor).toBe("1009")
  expect(
    generalMoneyAccountBalancesPage(many, first.page.nextCursor ?? undefined)
      .answer.accounts.rows,
  ).toHaveLength(1)
  expect(first.answer.accounts).not.toHaveProperty("totalMinor")
})
test("balances require currency and reject fractional or numeric placeholders", () => {
  const result = generalMoneyAccountBalancesPage(source).answer
  const { currencyCode: _, ...noCurrency } = result.accounts
  expect(
    generalAnswerSchema.safeParse({ ...result, accounts: noCurrency }).success,
  ).toBe(false)
  for (const value of [12, "12.5", "NaN", "1e6"])
    expect(
      generalAnswerSchema.safeParse({
        ...result,
        accounts: {
          ...result.accounts,
          rows: [{ ...result.accounts.rows[0], balanceMinor: value }],
        },
      }).success,
    ).toBe(false)
})

test("plain balance requests use the read owner without capturing writes or filtered questions", async () => {
  const { isPlainAccountBalanceRequest } = await import(
    "./money-account-balances-answer"
  )
  for (const text of [
    "show how much in each account",
    "How much is in every account?",
    "Show my account balances",
    "please list all money account balances",
    "balances for my accounts",
  ])
    expect(isPlainAccountBalanceRequest(text)).toBe(true)
  for (const text of [
    "put 20k in each account",
    "show balances as of yesterday",
    "show balance in Shop cash",
    "show receivables",
    "transfer all account balances",
  ])
    expect(isPlainAccountBalanceRequest(text)).toBe(false)
})
