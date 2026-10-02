import { expect, test } from "bun:test"
import { calculateFinancialPosition } from "./financial-position"
import { MAX_FINANCE_AMOUNT, validateFinanceLines } from "./rules"
import { composeFinanceYearEndPostings } from "./year-end-postings"

const retainedEarnings = {
  accountId: "retained",
  bookId: "book",
  kind: "EQUITY",
  purpose: "RETAINED_EARNINGS",
  archivedAt: null,
}
function account(
  accountId: string,
  kind: string,
  net: bigint,
): Parameters<
  typeof composeFinanceYearEndPostings
>[0]["temporaryAccounts"][number] {
  return {
    accountId,
    bookId: "book",
    kind,
    archivedAt: null,
    closingDebitMinor: (net > 0n ? net : 0n).toString(),
    closingCreditMinor: (net < 0n ? -net : 0n).toString(),
  }
}
function input(temporaryAccounts: ReturnType<typeof account>[]) {
  return { bookId: "book", retainedEarnings, temporaryAccounts }
}
function proveCleared(temporaryAccounts: ReturnType<typeof account>[]) {
  const prepared = composeFinanceYearEndPostings(input(temporaryAccounts))
  const balances = new Map(
    temporaryAccounts.map((row) => [
      row.accountId,
      BigInt(row.closingDebitMinor) - BigInt(row.closingCreditMinor),
    ]),
  )
  let retainedNet = 0n
  const journals = [...prepared.journals]
  for (const lines of journals) {
    expect(lines.length).toBeLessThanOrEqual(100)
    const normalized = validateFinanceLines(lines)
    expect(
      normalized.reduce(
        (sum, line) => sum + line.debitMinor - line.creditMinor,
        0n,
      ),
    ).toBe(0n)
    for (const line of normalized) {
      if (line.accountId === "retained")
        retainedNet += line.debitMinor - line.creditMinor
      else {
        expect(balances.has(line.accountId)).toBe(true)
        balances.set(
          line.accountId,
          (balances.get(line.accountId) ?? 0n) +
            line.debitMinor -
            line.creditMinor,
        )
      }
      expect(
        line.debitMinor <= MAX_FINANCE_AMOUNT &&
          line.creditMinor <= MAX_FINANCE_AMOUNT,
      ).toBe(true)
    }
  }
  expect([...balances.values()].every((balance) => balance === 0n)).toBe(true)
  expect(retainedNet).toBe(-BigInt(prepared.earningsMinor))
  return { ...prepared, journals }
}

test("year-end clears profit, loss, zero-net and abnormal temporary balances without cash movements", () => {
  for (const fixture of [
    {
      rows: [
        account("sales", "INCOME", -10000n),
        account("cost", "EXPENSE", 6000n),
      ],
      earnings: "4000",
    },
    {
      rows: [
        account("sales", "INCOME", -1000n),
        account("cost", "EXPENSE", 2500n),
      ],
      earnings: "-1500",
    },
    {
      rows: [
        account("sales", "INCOME", -1000n),
        account("cost", "EXPENSE", 1000n),
      ],
      earnings: "0",
    },
    {
      rows: [
        account("sales-correction", "INCOME", 300n),
        account("expense-credit", "EXPENSE", -700n),
      ],
      earnings: "400",
    },
  ])
    expect(proveCleared(fixture.rows).earningsMinor).toBe(fixture.earnings)
  expect(proveCleared([account("zero-sales", "INCOME", 0n)]).journals).toEqual(
    [],
  )
})

test("year-end deterministically splits large balances into valid bounded balanced journals", () => {
  const rows = Array.from({ length: 100 }, (_, index) =>
    account(
      String(index).padStart(3, "0"),
      index % 2 === 0 ? "INCOME" : "EXPENSE",
      index % 2 === 0 ? -MAX_FINANCE_AMOUNT * 3n : MAX_FINANCE_AMOUNT * 2n,
    ),
  )
  const prepared = proveCleared(rows)
  expect(prepared.journals.length).toBeGreaterThan(1)
  expect(prepared.journals).toEqual([
    ...composeFinanceYearEndPostings(input([...rows].reverse())).journals,
  ])
})

test("year-end rejects invalid or incomplete account identity before exposing any posting iterator", () => {
  const valid = account("sales", "INCOME", -1000n)
  for (const rows of [
    [valid, valid],
    [valid, account("retained", "EXPENSE", 100n)],
    [valid, { ...account("last", "EXPENSE", 100n), bookId: "other" }],
    [valid, account("cash", "ASSET", 100n)],
    [
      valid,
      { ...account("archived", "EXPENSE", 100n), archivedAt: new Date() },
    ],
    [valid, { ...account("last", "EXPENSE", 100n), closingDebitMinor: "1.5" }],
    [valid, { ...account("last", "EXPENSE", 100n), closingDebitMinor: "-1" }],
    [valid, { ...account("last", "EXPENSE", 100n), closingDebitMinor: "01" }],
    [valid, { ...account("last", "EXPENSE", 100n), closingCreditMinor: "1" }],
    [
      valid,
      {
        ...account("last", "EXPENSE", 100n),
        closingDebitMinor: "999999999999999999999999999999999999",
      },
    ],
    Array.from({ length: 201 }, (_, index) =>
      account(String(index), "INCOME", 0n),
    ),
  ])
    expect(() => composeFinanceYearEndPostings(input(rows))).toThrow()
  for (const target of [
    { ...retainedEarnings, bookId: "other" },
    { ...retainedEarnings, kind: "ASSET" },
    { ...retainedEarnings, purpose: "CAPITAL" },
    { ...retainedEarnings, archivedAt: new Date() },
  ])
    expect(() =>
      composeFinanceYearEndPostings({
        ...input([valid]),
        retainedEarnings: target,
      }),
    ).toThrow()
})

test("year-end snapshots source balances and target identity before deferred journal consumption", () => {
  const rows = [account("sales", "INCOME", -1000n)]
  const target = { ...retainedEarnings }
  const prepared = composeFinanceYearEndPostings({
    ...input(rows),
    retainedEarnings: target,
  })
  rows[0] = account("changed", "INCOME", -5000n)
  target.accountId = "changed-target"
  expect(prepared.earningsMinor).toBe("1000")
  expect([...prepared.journals]).toEqual([
    [
      { accountId: "sales", side: "DEBIT", amountMinor: "1000" },
      { accountId: "retained", side: "CREDIT", amountMinor: "1000" },
    ],
  ])
})

test("year-end transfer preserves actual balance-sheet equity identity and counts earnings once", () => {
  for (const earnings of [4000n, -1500n, 0n]) {
    const expense = 6000n
    const income = expense + earnings
    const rows = [
      account("income", "INCOME", -income),
      account("expense", "EXPENSE", expense),
    ]
    const base = [
      {
        accountId: "cash",
        code: "1000",
        name: "Cash",
        kind: "ASSET" as const,
        closingBalanceMinor: "10000",
      },
      {
        accountId: "capital",
        code: "3000",
        name: "Capital",
        kind: "EQUITY" as const,
        closingBalanceMinor: (10000n - earnings).toString(),
      },
      {
        accountId: "retained",
        code: "3200",
        name: "Retained earnings",
        kind: "EQUITY" as const,
        closingBalanceMinor: "0",
      },
    ]
    const before = calculateFinancialPosition([
      ...base,
      {
        accountId: "income",
        code: "4000",
        name: "Income",
        kind: "INCOME" as const,
        closingBalanceMinor: income.toString(),
      },
      {
        accountId: "expense",
        code: "6000",
        name: "Expense",
        kind: "EXPENSE" as const,
        closingBalanceMinor: expense.toString(),
      },
    ])
    const transfer = composeFinanceYearEndPostings(input(rows))
    let retained = 0n
    for (const lines of transfer.journals)
      for (const line of lines)
        if (line.accountId === "retained")
          retained +=
            (line.side === "CREDIT" ? 1n : -1n) * BigInt(line.amountMinor)
    const after = calculateFinancialPosition(
      base.map((row) =>
        row.accountId === "retained"
          ? { ...row, closingBalanceMinor: retained.toString() }
          : row,
      ),
    )
    expect(before.balanced && after.balanced).toBe(true)
    expect(after.totalEquityMinor).toBe(before.totalEquityMinor)
    expect(after.postedEquityMinor).toBe(
      (BigInt(before.postedEquityMinor) + earnings).toString(),
    )
    expect(after.unclosedEarningsMinor).toBe("0")
    expect(after.assetsMinor).toBe(before.assetsMinor)
  }
})

test("year-end accepts aggregate balances above a single BIGINT and preflights batches without materializing them", () => {
  const amount = 9223372036854775808n
  const prepared = composeFinanceYearEndPostings(
    input([account("income", "INCOME", -amount)]),
  )
  const lineCount = (amount + MAX_FINANCE_AMOUNT - 1n) / MAX_FINANCE_AMOUNT
  expect(prepared.earningsMinor).toBe(amount.toString())
  expect(prepared.journalCount).toBe(((lineCount + 48n) / 49n).toString())
  expect(prepared.postingLineCountUpperBound).toBe((lineCount * 2n).toString())
  const first = prepared.journals.next()
  expect(first.done).toBe(false)
  if (!first.value) throw new Error("Expected one bounded journal")
  expect(first.value.length).toBeLessThanOrEqual(100)
  expect(
    validateFinanceLines(first.value).reduce(
      (sum, line) => sum + line.debitMinor - line.creditMinor,
      0n,
    ),
  ).toBe(0n)
})
