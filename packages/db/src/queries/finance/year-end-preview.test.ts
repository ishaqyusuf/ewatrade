import { expect, test } from "bun:test"
import { getFinanceYearEndPreview } from "./year-end-preview"

const input = { bookId: "book", tenantId: "tenant", actorUserId: "owner" }

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing fixture record")
  return value
}

function fixture() {
  const book = {
    id: "book",
    tenantId: "tenant",
    currencyCode: "NGN",
    startsAt: new Date("2024-03-15T10:30:00.000Z"),
    closedThrough: new Date("2024-06-30T23:59:59.999Z") as Date | null,
    lastSequence: 3n,
  }
  const calendar = {
    id: "calendar",
    bookId: "book",
    revision: 1,
    startMonth: 1,
    startDay: 1,
    retainedEarningsAccountId: "retained",
  }
  const accounts = [
    { id: "cash", kind: "ASSET", purpose: "CASH" },
    { id: "retained", kind: "EQUITY", purpose: "RETAINED_EARNINGS" },
    { id: "sales", kind: "INCOME", purpose: "SALES" },
    { id: "expense", kind: "EXPENSE", purpose: "OPERATING_EXPENSE" },
  ].map((account, index) => ({
    ...account,
    code: `${index}000`,
    name: account.id,
    bookId: "book",
    archivedAt: null as Date | null,
  }))
  const groups = [
    { accountId: "cash", _sum: { debitMinor: 700n, creditMinor: 0n } },
    { accountId: "sales", _sum: { debitMinor: 0n, creditMinor: 1000n } },
    { accountId: "expense", _sum: { debitMinor: 300n, creditMinor: 0n } },
  ]
  const state = {
    authorized: true,
    configured: true,
    history: false,
    accountCount: 4,
  }
  const reads: unknown[] = []
  let options: unknown
  const tx = {
    $queryRaw: async () => [],
    financeReconciliation: { findMany: async () => [] },
    membership: {
      findFirst: async () =>
        state.authorized ? { tenant: { isActive: true } } : null,
    },
    financeBook: {
      findFirst: async (query: unknown) => {
        reads.push(query)
        return book
      },
    },
    financeFiscalCalendar: {
      findUnique: async () => (state.configured ? calendar : null),
    },
    financeFiscalYear: {
      findMany: async () =>
        state.history
          ? [
              {
                id: "year",
                bookId: "book",
                calendarId: "calendar",
                calendarRevision: 1,
                startMonth: 1,
                startDay: 1,
                startsAt: book.startsAt,
                endsAt: new Date("2024-12-31T23:59:59.999Z"),
                firstPeriodStub: true,
                activeCloseId: null,
              },
            ]
          : [],
    },
    financeAccount: {
      count: async () => state.accountCount,
      findMany: async () => accounts,
    },
    financeJournalLine: {
      groupBy: async (query: unknown) => {
        reads.push(query)
        return groups
      },
    },
    financeFiscalCloseEvent: { findMany: async () => [] },
    financeJournalEntry: { findMany: async () => [] },
  }
  const db = {
    $transaction: async (
      action: (value: typeof tx) => unknown,
      suppliedOptions: unknown,
    ) => {
      options = suppliedOptions
      return action(tx)
    },
  }
  return {
    db: db as never,
    state,
    book,
    calendar,
    accounts,
    groups,
    reads,
    options: () => options,
  }
}

test("first-year exact preview uses the original stub and snapshot without granting close authority", async () => {
  const f = fixture()
  const result = await getFinanceYearEndPreview(f.db, input)
  expect(result.fiscalStart).toEqual(f.book.startsAt)
  expect(result.fiscalEnd).toEqual(new Date("2024-12-31T23:59:59.999Z"))
  expect(result.firstPeriodStub).toBe(true)
  expect(result.cutoffCompleted).toBe(true)
  expect(result.snapshotSequence).toBe("3")
  expect(result.earningsMinor).toBe("700")
  expect(result.journalCount).toBe("1")
  expect(
    result.journals.flat().filter((line) => line.accountId === "retained"),
  ).toEqual([{ accountId: "retained", side: "CREDIT", amountMinor: "700" }])
  expect(result.balanceSheet.unclosedEarningsMinor).toBe("700")
  expect(result.balanceSheet.differenceMinor).toBe("0")
  expect(result.closedThrough).toEqual(f.book.closedThrough)
  expect(result.cashEvidence.status).toBe("REVIEW_REQUIRED")
  expect(result.canClose).toBe(false)
  expect(result.operationallyReconciled).toBe(false)
  expect(result.completeness).toBe("INCOMPLETE_SOURCE_COVERAGE")
  expect(result.coverageGaps).toContain("SUPPLIER_DOCUMENTS_AND_SETTLEMENTS")
  expect(result.coverageGaps).toContain("OPENING_BALANCE_RECONCILIATION")
  expect(f.options()).toEqual({
    maxWait: 10000,
    timeout: 30000,
    isolationLevel: "RepeatableRead",
  })
  expect(f.reads).toContainEqual({ where: { id: "book", tenantId: "tenant" } })
})

test("current incomplete fiscal year is provisional; an empty ledger still needs source coverage", async () => {
  const f = fixture()
  f.book.startsAt = new Date()
  f.book.closedThrough = null
  f.groups.length = 0
  const result = await getFinanceYearEndPreview(f.db, input)
  expect(result.cutoffCompleted).toBe(false)
  expect(result.earningsMinor).toBe("0")
  expect(result.journals).toEqual([])
  expect(result.canClose).toBe(false)
  expect(result.coverageGaps.length).toBe(6)
})

test("current permission, Book and explicit fiscal settings are required before calculation", async () => {
  const f = fixture()
  f.state.authorized = false
  await expect(getFinanceYearEndPreview(f.db, input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  expect(f.reads).toEqual([])
  f.state.authorized = true
  f.book.id = "foreign"
  await expect(getFinanceYearEndPreview(f.db, input)).rejects.toMatchObject({
    code: "NOT_FOUND",
  })
  f.book.id = "book"
  f.state.configured = false
  await expect(getFinanceYearEndPreview(f.db, input)).rejects.toThrow(
    "Configure the fiscal calendar",
  )
})

test("inconsistent fiscal history refuses; ordinary date locks are not fiscal history", async () => {
  const f = fixture()
  f.state.history = true
  await expect(getFinanceYearEndPreview(f.db, input)).rejects.toThrow(
    "Fiscal history is inconsistent",
  )
  f.state.history = false
  f.calendar.revision = 0
  await expect(getFinanceYearEndPreview(f.db, input)).rejects.toThrow(
    "Fiscal settings are invalid",
  )
})

test("wrong, archived or repeated retained controls and incomplete account scope refuse", async () => {
  for (const fault of ["wrong", "archived", "duplicate", "missing"] as const) {
    const f = fixture()
    if (fault === "wrong") required(f.accounts[1]).kind = "ASSET"
    if (fault === "archived") required(f.accounts[1]).archivedAt = new Date()
    if (fault === "duplicate") {
      f.accounts.push({ ...required(f.accounts[1]), id: "another" })
      f.state.accountCount++
    }
    if (fault === "missing") f.calendar.retainedEarningsAccountId = "absent"
    await expect(getFinanceYearEndPreview(f.db, input)).rejects.toThrow(
      "original active equity",
    )
  }
  const f = fixture()
  f.state.accountCount = 201
  await expect(getFinanceYearEndPreview(f.db, input)).rejects.toThrow(
    "account review exceeds",
  )
  f.state.accountCount = 3
  await expect(getFinanceYearEndPreview(f.db, input)).rejects.toThrow(
    "account scope changed",
  )
})

test("unbalanced books and nonzero archived temporary balances refuse", async () => {
  const f = fixture()
  required(f.groups[0])._sum.debitMinor = 701n
  await expect(getFinanceYearEndPreview(f.db, input)).rejects.toThrow(
    "trial balance",
  )
  required(f.groups[0])._sum.debitMinor = 700n
  required(f.accounts[2]).archivedAt = new Date()
  await expect(getFinanceYearEndPreview(f.db, input)).rejects.toThrow(
    "archived",
  )
})

test("huge valid balances refuse before expanding more than the supported atomic journal batch", async () => {
  const f = fixture()
  const huge = 100_000_000_000_000n * 49n * 65n
  required(f.groups[0])._sum.debitMinor = huge
  required(f.groups[1])._sum.creditMinor = huge
  required(f.groups[2])._sum.debitMinor = 0n
  await expect(getFinanceYearEndPreview(f.db, input)).rejects.toThrow(
    "atomic batch limit",
  )
})
