import { expect, test } from "bun:test"
import type { PrismaClient } from "../../../generated/prisma/client"
import { getFinancePeriodCloseChecklist as checklist } from "./period-close-checklist"
import { getFinanceReports } from "./reports"
import { financePayloadHash } from "./rules"

const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  through: new Date("2025-12-31T23:59:59.999Z"),
}

function fixture() {
  const book = {
    id: "book",
    currencyCode: "NGN",
    startsAt: new Date("2025-01-01T00:00:00Z"),
    closedThrough: null as Date | null,
    lastSequence: 7n,
  }
  const accounts = [
    { id: "cash", code: "1000", name: "Till", kind: "ASSET", purpose: "CASH" },
    { id: "bank", code: "1100", name: "Bank", kind: "ASSET", purpose: "BANK" },
    {
      id: "capital",
      code: "3000",
      name: "Capital",
      kind: "EQUITY",
      purpose: "CAPITAL",
    },
    {
      id: "sales",
      code: "4000",
      name: "Sales",
      kind: "INCOME",
      purpose: "SALES",
    },
    {
      id: "expense",
      code: "6000",
      name: "Expenses",
      kind: "EXPENSE",
      purpose: "OPERATING_EXPENSE",
    },
  ]
  const groups = [
    { accountId: "cash", _sum: { debitMinor: 100000n, creditMinor: 0n } },
    { accountId: "bank", _sum: { debitMinor: 50000n, creditMinor: 0n } },
    { accountId: "capital", _sum: { debitMinor: 0n, creditMinor: 100000n } },
    { accountId: "sales", _sum: { debitMinor: 0n, creditMinor: 100000n } },
    { accountId: "expense", _sum: { debitMinor: 50000n, creditMinor: 0n } },
  ]
  const count = {
    id: "count",
    bookId: "book",
    accountId: "cash",
    asOf: input.through,
    snapshotSequence: 7n,
    observedBalanceMinor: 100000n,
    expectedBalanceMinor: 100000n,
    actorUserId: "owner",
    reference: "Closing count",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }
  const state = {
    authorized: true,
    accountCount: accounts.length,
    counts: [count],
    existing: null as null | {
      id: string
      endsAt: Date
      reopenedAt: Date | null
    },
  }
  const calls = { options: null as unknown, reads: [] as unknown[] }
  const tx = {
    $queryRaw: async (query: { sql?: string }) =>
      query.sql?.includes('"FinanceReconciliation"')
        ? state.counts
            .slice(0, 1)
            .map((row) => ({ id: row.id, expectedMinor: "100000" }))
        : [],
    financeCommand: {
      findMany: async () =>
        state.counts.slice(0, 1).map((row) => ({
          id: `command-${row.id}`,
          bookId: "book",
          kind: "CASH_COUNT",
          actorUserId: row.actorUserId,
          result: { id: row.id },
          payloadHash: financePayloadHash({
            accountId: row.accountId,
            asOf: row.asOf,
            observedBalanceMinor: row.observedBalanceMinor,
            reference: row.reference,
          }),
        })),
    },
    financeFiscalCloseEvent: { findMany: async () => [] },
    financeJournalEntry: { findMany: async () => [] },
    financeFiscalCalendar: { findUnique: async () => null },
    membership: {
      findFirst: async () =>
        state.authorized ? { tenant: { id: "tenant", isActive: true } } : null,
    },
    financeBook: {
      findFirst: async (query: unknown) => {
        calls.reads.push(query)
        return book
      },
    },
    financeAccount: {
      count: async (query: unknown) => {
        calls.reads.push(query)
        return state.accountCount
      },
      findMany: async (query: unknown) => {
        calls.reads.push(query)
        return accounts
      },
    },
    financeJournalLine: {
      groupBy: async (query: unknown) => {
        calls.reads.push(query)
        return groups
      },
    },
    financePeriod: {
      findUnique: async (query: unknown) => {
        calls.reads.push(query)
        return state.existing
      },
    },
    financeReconciliation: {
      findMany: async (query: unknown) => {
        calls.reads.push(query)
        return state.counts
      },
    },
  }
  const db = {
    $transaction: async (
      action: (value: typeof tx) => Promise<unknown>,
      options: unknown,
    ) => {
      calls.options = options
      return action(tx)
    },
  }
  return {
    db: db as unknown as PrismaClient,
    book,
    accounts,
    groups,
    count,
    state,
    calls,
  }
}

test("actual posted report and cutoff count pass only their stated checks, never full close", async () => {
  const f = fixture()
  const result = await checklist(f.db, input)
  expect(result.snapshotSequence).toBe("7")
  expect(result.trialBalance.debitMinor).toBe("200000")
  expect(result.balanceSheet.assetsMinor).toBe("150000")
  expect(result.balanceSheet.unclosedEarningsMinor).toBe("50000")
  expect(result.dateLockEligible).toBe(true)
  expect(result.operationallyReconciled).toBe(false)
  expect(result.cash[0]?.status).toBe("PASS")
  expect(
    result.checks.find((check) => check.id === "BANK_RECONCILIATION")?.status,
  ).toBe("REVIEW_REQUIRED")
  expect(result.completeness).toBe("INCOMPLETE_SOURCE_COVERAGE")
  expect(f.calls.options).toEqual({
    maxWait: 10000,
    timeout: 30000,
    isolationLevel: "RepeatableRead",
  })
  expect(f.calls.reads).toContainEqual({
    where: { id: "book", tenantId: "tenant" },
    select: {
      id: true,
      currencyCode: true,
      startsAt: true,
      closedThrough: true,
      lastSequence: true,
    },
  })
  const standalone = await getFinanceReports(f.db, {
    ...input,
    from: f.book.startsAt,
    snapshotSequence: "7",
  })
  expect(standalone.trialBalance).toEqual(result.trialBalance)
  expect(standalone.balanceSheet).toEqual(result.balanceSheet)
})

test("a missing or differing latest cutoff cash count cannot pass reconciliation", async () => {
  const f = fixture()
  f.state.counts = [
    { ...f.count, id: "new", observedBalanceMinor: 99999n },
    f.count,
  ]
  let result = await checklist(f.db, input)
  expect(result.cash[0]?.countId).toBe("new")
  expect(result.cash[0]?.status).toBe("BLOCKED")
  expect(
    result.checks.find((check) => check.id === "CASH_RECONCILIATION")?.status,
  ).toBe("BLOCKED")
  f.state.counts = []
  result = await checklist(f.db, input)
  expect(result.cash[0]?.status).toBe("REVIEW_REQUIRED")
  expect(result.operationallyReconciled).toBe(false)
})

test("wrong-source, future snapshot and invalid stored physical counts fail closed", async () => {
  for (const changed of [
    { bookId: "other-book" },
    { accountId: "bank" },
    { asOf: new Date("2025-12-30T23:59:59.999Z") },
    { snapshotSequence: 8n },
    { observedBalanceMinor: -1n },
  ]) {
    const f = fixture()
    f.state.counts = [{ ...f.count, ...changed }]
    await expect(checklist(f.db, input)).rejects.toThrow(
      "Cash review source changed",
    )
  }
})

test("journal imbalance and reopened original cutoff prevent date-lock eligibility", async () => {
  const f = fixture()
  f.groups[0] = {
    accountId: "cash",
    _sum: { debitMinor: 100001n, creditMinor: 0n },
  }
  let result = await checklist(f.db, input)
  expect(result.dateLockEligible).toBe(false)
  expect(
    result.checks.find((check) => check.id === "POSTED_TRIAL_BALANCE")?.status,
  ).toBe("BLOCKED")
  f.groups[0] = {
    accountId: "cash",
    _sum: { debitMinor: 100000n, creditMinor: 0n },
  }
  f.state.existing = {
    id: "reopened",
    endsAt: new Date("2025-11-30T23:59:59.999Z"),
    reopenedAt: new Date(),
  }
  result = await checklist(f.db, input)
  expect(result.dateLockEligible).toBe(false)
  expect(result.checks[0]?.status).toBe("BLOCKED")
})

test("authorization, Book identity, date range and explicit review bounds are enforced", async () => {
  const f = fixture()
  f.state.authorized = false
  await expect(checklist(f.db, input)).rejects.toThrow("Owners and Admins")
  expect(f.calls.reads).toHaveLength(0)
  f.state.authorized = true
  f.book.id = "other-book"
  await expect(checklist(f.db, input)).rejects.toThrow(
    "Financial book not found",
  )
  f.book.id = "book"
  f.state.accountCount = 201
  await expect(checklist(f.db, input)).rejects.toThrow("bounded closing review")
  f.state.accountCount = f.accounts.length
  f.state.counts = Array.from({ length: 201 }, (_, n) => ({
    ...f.count,
    id: `count-${n}`,
  }))
  const bounded = await checklist(f.db, input)
  expect(bounded.cashCountCoverageComplete).toBe(false)
  expect(bounded.cash[0]?.status).toBe("REVIEW_REQUIRED")
  expect(bounded.cash[0]?.countId).toBeNull()
  for (const through of [
    new Date("invalid"),
    new Date("3026-01-01T23:59:59.999Z"),
    new Date("2025-12-31T12:00:00Z"),
    new Date("2024-12-31T23:59:59.999Z"),
  ]) {
    await expect(checklist(f.db, { ...input, through })).rejects.toThrow()
  }
})
