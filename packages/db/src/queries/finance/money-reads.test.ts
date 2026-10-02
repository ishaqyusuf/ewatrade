import { expect, test } from "bun:test"
import { getFinanceMoneyMovement } from "./money-reads"

function movementEntry(
  sourceKind = "TRANSFER",
  reversalOfId: string | null = null,
) {
  return {
    id: "entry-1",
    bookId: "book-1",
    sourceKind,
    description: "Move funds",
    effectiveAt: new Date("2026-09-01T10:00:00.000Z"),
    recordedAt: new Date("2026-09-01T10:02:00.000Z"),
    actorUserId: "actor-1",
    sequence: 9007199254740993n,
    reversalOfId,
    reversal: {
      id: "reversal-1",
      effectiveAt: new Date("2026-09-02T10:00:00.000Z"),
      recordedAt: new Date("2026-09-02T10:01:00.000Z"),
      description: "Reversal: duplicate transfer",
    },
    lines: [
      {
        accountId: "account-a",
        debitMinor: 9007199254740993n,
        creditMinor: 0n,
        description: "Cash received",
        account: { name: "Cash", kind: "ASSET", purpose: "CASH" },
      },
      {
        accountId: "account-b",
        debitMinor: 0n,
        creditMinor: 9007199254740993n,
        description: null,
        account: { name: "Bank", kind: "ASSET", purpose: "BANK" },
      },
    ],
  }
}

function createDb({
  membership = true,
  book = { id: "book-1", currencyCode: "NGN" },
  entry = movementEntry(),
}: {
  membership?: boolean
  book?: { id: string; currencyCode: string } | null
  entry?: ReturnType<typeof movementEntry> | null
} = {}) {
  const calls: {
    membership?: unknown
    book?: unknown
    entry?: unknown
    transactionOptions?: unknown
  } = {}
  const tx = {
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.membership = values
      return []
    },
    membership: {
      findFirst: async (query: unknown) => {
        calls.membership = query
        return membership
          ? {
              tenant: {
                id: "tenant-1",
                currencyCode: "NGN",
                timezone: "Africa/Lagos",
                isActive: true,
              },
            }
          : null
      },
    },
    financeBook: {
      findFirst: async (query: unknown) => {
        calls.book = query
        return book
      },
    },
    financeJournalEntry: {
      findFirst: async (query: unknown) => {
        calls.entry = query
        return entry
      },
    },
  }
  const db = {
    $transaction: async (
      callback: (transaction: typeof tx) => unknown,
      options: unknown,
    ) => {
      calls.transactionOptions = options
      return callback(tx)
    },
  }
  return { db, calls }
}

const input = {
  tenantId: "tenant-1",
  actorUserId: "actor-1",
  bookId: "book-1",
  entryId: "entry-1",
}

test("money movement detail returns exact source, reversal history and integer strings", async () => {
  const { db, calls } = createDb()

  const result = await getFinanceMoneyMovement(db as never, input)

  expect(calls.book).toMatchObject({
    where: { id: "book-1", tenantId: "tenant-1" },
    select: { id: true, currencyCode: true },
  })
  expect(calls.entry).toMatchObject({
    where: { id: "entry-1", bookId: "book-1" },
  })
  expect(calls.transactionOptions).toMatchObject({
    maxWait: 10_000,
    timeout: 30_000,
    isolationLevel: "RepeatableRead",
  })
  expect(result).toEqual({
    id: "entry-1",
    bookId: "book-1",
    currencyCode: "NGN",
    sourceKind: "TRANSFER",
    description: "Move funds",
    effectiveAt: new Date("2026-09-01T10:00:00.000Z"),
    recordedAt: new Date("2026-09-01T10:02:00.000Z"),
    actorUserId: "actor-1",
    sequence: "9007199254740993",
    reversalOfId: null,
    reversal: {
      id: "reversal-1",
      effectiveAt: new Date("2026-09-02T10:00:00.000Z"),
      recordedAt: new Date("2026-09-02T10:01:00.000Z"),
      description: "Reversal: duplicate transfer",
    },
    lines: [
      {
        accountId: "account-a",
        accountName: "Cash",
        accountKind: "ASSET",
        accountPurpose: "CASH",
        debitMinor: "9007199254740993",
        creditMinor: "0",
        description: "Cash received",
      },
      {
        accountId: "account-b",
        accountName: "Bank",
        accountKind: "ASSET",
        accountPurpose: "BANK",
        debitMinor: "0",
        creditMinor: "9007199254740993",
        description: null,
      },
    ],
  })
})

test("movement detail hides books outside the active Tenant scope", async () => {
  const { db, calls } = createDb({ book: null })

  await expect(
    getFinanceMoneyMovement(db as never, input),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
  })
  expect(calls.entry).toBeUndefined()
})

test("movement detail requires live active Owner/Admin repository authority", async () => {
  const { db, calls } = createDb({ membership: false })

  await expect(
    getFinanceMoneyMovement(db as never, input),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  expect(calls.book).toBeUndefined()
  expect(calls.entry).toBeUndefined()
})

test("movement detail reports unsupported sources and reversal entries as not found", async () => {
  for (const entry of [
    movementEntry("EXPENSE"),
    movementEntry("MONEY_REVERSAL", "entry-0"),
  ]) {
    const { db } = createDb({ entry })
    await expect(
      getFinanceMoneyMovement(db as never, input),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  }
})
