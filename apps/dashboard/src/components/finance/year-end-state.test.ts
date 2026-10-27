import { expect, test } from "bun:test"
import {
  financeFirstFiscalYear,
  financeFiscalMonths,
  financeFiscalStartForYearEnd,
  financeYearEndAccountRows,
  financeYearEndBlockers,
  financeYearEndEntries,
  financeYearEndErrorKind,
  financeYearEndFromStart,
  financeYearEndGapLabel,
  financeYearEndLabel,
} from "./year-end-state"

const day = (value: Date | string) => new Date(value).toISOString().slice(0, 10)

test("year end and recurring start convert both ways", () => {
  expect(financeFiscalStartForYearEnd(12)).toEqual({
    startMonth: 1,
    startDay: 1,
  })
  expect(financeFiscalStartForYearEnd(2)).toEqual({
    startMonth: 3,
    startDay: 1,
  })
  expect(financeYearEndFromStart(1, 1)).toEqual({
    month: 12,
    day: 31,
    lastDayOfMonth: true,
  })
  expect(financeYearEndFromStart(7, 15)).toEqual({
    month: 7,
    day: 14,
    lastDayOfMonth: false,
  })
  expect(financeYearEndLabel(1, 1)).toBe("31 December")
  expect(financeYearEndLabel(10, 1)).toBe("30 September")
  expect(financeYearEndLabel(3, 1)).toBe("Last day of February")
  expect(financeYearEndLabel(7, 15)).toBe("14 July")
})

test("first year runs from the Book start and is disclosed as short", () => {
  const now = new Date("2026-10-27T09:00:00.000Z")
  const december = financeFirstFiscalYear({
    startMonth: 1,
    startDay: 1,
    bookStartsAt: "2026-03-03T00:00:00.000Z",
    now,
  })
  expect(day(december.fiscalStart)).toBe("2026-03-03")
  expect(december.fiscalEnd.toISOString()).toBe("2026-12-31T23:59:59.999Z")
  expect(december.firstPeriodStub).toBe(true)
  expect(december.cutoffCompleted).toBe(false)
  expect(financeFiscalMonths(december.fiscalStart, december.fiscalEnd)).toBe(10)

  const september = financeFirstFiscalYear({
    startMonth: 10,
    startDay: 1,
    bookStartsAt: "2026-03-03T00:00:00.000Z",
    now,
  })
  expect(september.fiscalEnd.toISOString()).toBe("2026-09-30T23:59:59.999Z")
  expect(september.cutoffCompleted).toBe(true)

  // A start before the Book start rolls to next year (February end, 2027).
  const february = financeFirstFiscalYear({
    startMonth: 3,
    startDay: 1,
    bookStartsAt: "2026-03-03T00:00:00.000Z",
    now,
  })
  expect(february.fiscalEnd.toISOString()).toBe("2027-02-28T23:59:59.999Z")

  const exact = financeFirstFiscalYear({
    startMonth: 1,
    startDay: 1,
    bookStartsAt: "2026-01-01T00:00:00.000Z",
    now,
  })
  expect(exact.firstPeriodStub).toBe(false)
  expect(exact.fiscalEnd.toISOString()).toBe("2026-12-31T23:59:59.999Z")
})

test("gap labels use plain words and keep unknown ids readable", () => {
  expect(financeYearEndGapLabel("INVENTORY_COSTS")[0]).toBe("Stock costs")
  expect(financeYearEndGapLabel("NEW_SOURCE_FAMILY")).toEqual([
    "New source family",
    "",
  ])
})

const cash = (
  rows: Array<{ name: string; status: string; observed: string | null }>,
  complete = true,
) => ({
  through: new Date("2026-12-31T23:59:59.999Z"),
  snapshotSequence: "12",
  scope: "REGISTERED_CASH_ACCOUNTS" as const,
  status: "REVIEW_REQUIRED" as const,
  cash: rows.map((row, index) => ({
    accountId: `cash-${index}`,
    name: row.name,
    closingBalanceMinor: "100",
    countId: row.observed ? `count-${index}` : null,
    observedBalanceMinor: row.observed,
    countSnapshotSequence: null,
    originalExpectedBalanceMinor: null,
    basisVerified: Boolean(row.observed),
    status: row.status as "PASS" | "BLOCKED" | "REVIEW_REQUIRED",
  })),
  cutoffCompleted: false,
  countCoverageComplete: complete,
  commandCoverageComplete: true,
  reviewLimit: 50,
})

test("blockers always say closing isn't available and list what is open", () => {
  const running = financeYearEndBlockers(
    {
      cutoffCompleted: false,
      fiscalEnd: new Date("2026-12-31T23:59:59.999Z"),
      coverageGaps: [
        "CASH_AND_BANK_RECONCILIATION",
        "COMMERCIAL_SALES_AND_CUSTOMER_PAYMENTS",
        "SUPPLIER_DOCUMENTS_AND_SETTLEMENTS",
        "INVENTORY_COSTS",
        "OPENING_BALANCE_RECONCILIATION",
        "ASSETS_LOANS_ACCRUALS_AND_TAX",
      ],
      cashEvidence: cash([
        { name: "Shop till", status: "REVIEW_REQUIRED", observed: null },
        { name: "Cash safe", status: "REVIEW_REQUIRED", observed: null },
      ]),
    } as Parameters<typeof financeYearEndBlockers>[0],
    day,
  )
  expect(running.map((item) => item.id)).toEqual([
    "YEAR_NOT_ENDED",
    "CLOSE_NOT_AVAILABLE",
    "SOURCE_GAPS",
    "CASH_NOT_COUNTED",
  ])
  expect(running[0]?.detail).toContain("2026-12-31")
  expect(running[2]?.detail).toContain("6 kinds")
  expect(running[3]?.detail).toBe(
    "Count Shop till and Cash safe on 2026-12-31.",
  )

  const ended = financeYearEndBlockers(
    {
      cutoffCompleted: true,
      fiscalEnd: new Date("2026-09-30T23:59:59.999Z"),
      coverageGaps: [],
      cashEvidence: cash(
        [
          { name: "Shop till", status: "PASS", observed: "100" },
          { name: "Cash safe", status: "BLOCKED", observed: "90" },
        ],
        false,
      ),
    } as Parameters<typeof financeYearEndBlockers>[0],
    day,
  )
  expect(ended.map((item) => item.id)).toEqual([
    "CLOSE_NOT_AVAILABLE",
    "CASH_DIFFERENT",
    "CASH_REVIEW_LIMIT",
  ])
})

const account = (
  accountId: string,
  kind: string,
  closingBalanceMinor: string,
  name = accountId,
) => ({
  accountId,
  code: accountId.toUpperCase(),
  name,
  kind,
  purpose: kind === "EQUITY" ? "RETAINED_EARNINGS" : "GENERAL",
  closingDebitMinor: "0",
  closingCreditMinor: "0",
  closingBalanceMinor,
  periodDebitMinor: "0",
  periodCreditMinor: "0",
  periodBalanceMinor: closingBalanceMinor,
})

test("account rows clear income and expenses into retained earnings", () => {
  const sales = account("sales", "INCOME", "1000000", "Sales")
  const rent = account("rent", "EXPENSE", "250000", "Rent")
  const idle = account("idle", "EXPENSE", "0")
  const retained = account("re", "EQUITY", "50000", "Retained earnings")
  const rows = financeYearEndAccountRows({
    temporaryAccounts: [sales, rent, idle],
    trialBalance: { accounts: [sales, rent, idle, retained] },
    retainedEarningsAccountId: "re",
    earningsMinor: "750000",
  } as unknown as Parameters<typeof financeYearEndAccountRows>[0])
  expect(rows.hasActivity).toBe(true)
  expect(rows.income.map((row) => row.name)).toEqual(["Sales"])
  expect(rows.expenses.map((row) => [row.name, row.afterMinor])).toEqual([
    ["Rent", "0"],
  ])
  expect(rows.earnedMinor).toBe("1000000")
  expect(rows.costsMinor).toBe("250000")
  expect(rows.retained).toMatchObject({
    name: "Retained earnings",
    nowMinor: "50000",
    afterMinor: "800000",
  })

  const empty = financeYearEndAccountRows({
    temporaryAccounts: [idle],
    trialBalance: { accounts: [idle, retained] },
    retainedEarningsAccountId: "re",
    earningsMinor: "0",
  } as unknown as Parameters<typeof financeYearEndAccountRows>[0])
  expect(empty.hasActivity).toBe(false)
  expect(empty.retained.afterMinor).toBe("50000")
})

test("entries name each account and split debit from credit", () => {
  const sales = account("sales", "INCOME", "1000", "Sales")
  const retained = account("re", "EQUITY", "0", "Retained earnings")
  const entries = financeYearEndEntries({
    journals: [
      [
        { accountId: "sales", side: "DEBIT", amountMinor: "1000" },
        { accountId: "re", side: "CREDIT", amountMinor: "1000" },
      ],
    ],
    trialBalance: { accounts: [sales, retained] },
  } as unknown as Parameters<typeof financeYearEndEntries>[0])
  expect(entries).toEqual([
    [
      {
        key: "0:0",
        name: "Sales",
        code: "SALES",
        debitMinor: "1000",
        creditMinor: null,
      },
      {
        key: "0:1",
        name: "Retained earnings",
        code: "RE",
        debitMinor: null,
        creditMinor: "1000",
      },
    ],
  ])
})

test("error kinds separate access, missing settings and other failures", () => {
  expect(
    financeYearEndErrorKind({ message: "No", data: { code: "FORBIDDEN" } }),
  ).toBe("forbidden")
  expect(
    financeYearEndErrorKind({
      message: "Configure the fiscal calendar before previewing year-end.",
      data: { code: "CONFLICT" },
    }),
  ).toBe("not-configured")
  expect(
    financeYearEndErrorKind({
      message: "Resolve the posted trial balance.",
      data: null,
    }),
  ).toBe("other")
})
