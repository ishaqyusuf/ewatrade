import { expect, test } from "bun:test"
import {
  getFinanceSupplierStatement,
  listFinanceSuppliers,
  supplierStatementRunningBalances,
} from "./supplier-reads"

const actor = { tenantId: "tenant-1", actorUserId: "owner-1" }

test("supplier list pages by code and scopes a filtered cursor to the book", async () => {
  let cursorQuery: unknown
  let pageQuery: unknown
  const tx = {
    $queryRaw: async () => [],
    membership: { findFirst: async () => ({ tenant: { isActive: true } }) },
    financeBook: { findFirst: async () => ({ id: "book-1" }) },
    financeSupplierAccount: {
      findFirst: async (query: unknown) => {
        cursorQuery = query
        return { id: "supplier-a", code: "ACME" }
      },
      findMany: async (query: unknown) => {
        pageQuery = query
        return [
          { id: "supplier-b", bookId: "book-1", code: "BETA", name: "Beta" },
        ]
      },
    },
  }
  const db = {
    $transaction: async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
  }

  const result = await listFinanceSuppliers(db as never, {
    ...actor,
    bookId: "book-1",
    query: "  supplier  ",
    cursor: "supplier-a",
  })

  expect(result.data).toHaveLength(1)
  expect(cursorQuery).toMatchObject({
    where: {
      AND: [
        {
          bookId: "book-1",
          OR: [
            { code: { contains: "supplier", mode: "insensitive" } },
            { name: { contains: "supplier", mode: "insensitive" } },
          ],
        },
        { id: "supplier-a" },
      ],
    },
  })
  expect(pageQuery).toMatchObject({
    orderBy: [{ code: "asc" }, { id: "asc" }],
    take: 31,
  })
})

test("supplier statement keeps exact large totals and hides later reversals", async () => {
  const snapshot = "9007199254740993"
  let reversalFilter: unknown
  let payableAggregateWhere: unknown
  let advanceAggregateWhere: unknown
  const tx = {
    $queryRaw: async () => [],
    membership: { findFirst: async () => ({ tenant: { isActive: true } }) },
    financeBook: {
      findFirst: async () => ({
        id: "book-1",
        currencyCode: "NGN",
        lastSequence: BigInt("9007199254740995"),
      }),
    },
    financeSupplierAccount: {
      findFirst: async () => ({
        id: "supplier-1",
        bookId: "book-1",
        code: "NORTH",
        name: "North",
      }),
    },
    financeSupplierEntry: {
      findFirst: async () => null,
      findMany: async (query: {
        select: { reversals: { where: unknown } }
      }) => {
        reversalFilter = query.select.reversals.where
        return [
          {
            id: "source-entry",
            kind: "ADVANCE",
            side: "DEBIT",
            amountMinor: BigInt("2750"),
            description: "Supplier advance",
            effectiveAt: new Date("2026-10-01T10:00:00.000Z"),
            recordedAt: new Date("2026-10-01T10:01:00.000Z"),
            actorUserId: "owner-1",
            journalEntryId: "journal-1",
            moneyAccountId: "cash-1",
            reversalOfId: null,
            journalEntry: { sequence: BigInt(snapshot) },
            reversals: [],
          },
        ]
      },
    },
    financeAccount: {
      findMany: async () => [
        { id: "payable-control", purpose: "PAYABLE" },
        { id: "advance-control", purpose: "SUPPLIER_ADVANCE" },
      ],
    },
    financeJournalLine: {
      aggregate: async (query: { where: unknown; _sum?: unknown }) => {
        const accountWhere = query.where as { accountId: { in: string[] } }
        if (accountWhere.accountId.in[0] === "payable-control") {
          payableAggregateWhere = query.where
          return {
            _sum: {
              debitMinor: BigInt("9007199254740994"),
              creditMinor: BigInt("9007199254741004"),
            },
          }
        }
        advanceAggregateWhere = query.where
        return {
          _sum: {
            debitMinor: BigInt("9007199254740995"),
            creditMinor: BigInt("2"),
          },
        }
      },
    },
  }
  const db = {
    $transaction: async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
  }

  const result = await getFinanceSupplierStatement(db as never, {
    ...actor,
    bookId: "book-1",
    supplierId: "supplier-1",
    snapshotSequence: snapshot,
  })

  expect(result.snapshotSequence).toBe(snapshot)
  expect(result.payableMinor).toBe("10")
  expect(result.advanceMinor).toBe("9007199254740993")
  expect(result.data[0]?.amountMinor).toBe("2750")
  expect(reversalFilter).toEqual({
    journalEntry: { sequence: { lte: BigInt(snapshot) } },
  })
  expect(payableAggregateWhere).toMatchObject({
    entry: {
      sequence: { lte: BigInt(snapshot) },
      supplierEntries: { some: { supplierId: "supplier-1", bookId: "book-1" } },
    },
  })
  expect(advanceAggregateWhere).toMatchObject({
    entry: {
      sequence: { lte: BigInt(snapshot) },
      supplierEntries: { some: { supplierId: "supplier-1", bookId: "book-1" } },
    },
  })
})

test("supplier statement validates sequence, cursor pinning and page bounds in repository", async () => {
  const db = { $transaction: async () => null }
  await expect(
    getFinanceSupplierStatement(db as never, {
      ...actor,
      bookId: "book-1",
      supplierId: "supplier-1",
      cursor: "1",
    }),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  await expect(
    getFinanceSupplierStatement(db as never, {
      ...actor,
      bookId: "book-1",
      supplierId: "supplier-1",
      snapshotSequence: "9223372036854775808",
    }),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  await expect(
    getFinanceSupplierStatement(
      db as never,
      {
        ...actor,
        bookId: "book-1",
        supplierId: "supplier-1",
        snapshotSequence: 12,
      } as never,
    ),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  await expect(
    listFinanceSuppliers(
      db as never,
      {
        ...actor,
        bookId: "book-1",
        cursor: 12,
      } as never,
    ),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  await expect(
    getFinanceSupplierStatement(db as never, {
      ...actor,
      bookId: "book-1",
      supplierId: "supplier-1",
      limit: 51,
    }),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
})

// Opening payable 24,000, payment 12,000, the same payment entered twice and
// reversed, a 45,000 bill, a 5,000 advance and 3,000 of it applied.
const ledger = [
  { sequence: "3", payable: "2400000", advance: "0" },
  { sequence: "5", payable: "-1200000", advance: "0" },
  { sequence: "8", payable: "-1200000", advance: "0" },
  { sequence: "9", payable: "1200000", advance: "0" },
  { sequence: "12", payable: "4500000", advance: "0" },
  { sequence: "14", payable: "0", advance: "500000" },
  { sequence: "15", payable: "-300000", advance: "-300000" },
]

/** What the statement's SQL returns for a page: earlier lines folded into a null row. */
function movementsFor(page: string[]) {
  const oldest = BigInt(page.at(-1) ?? "0")
  const newest = BigInt(page[0] ?? "0")
  const inPage = ledger.filter(
    (row) => BigInt(row.sequence) >= oldest && BigInt(row.sequence) <= newest,
  )
  const earlier = ledger.filter((row) => BigInt(row.sequence) < oldest)
  const sum = (key: "payable" | "advance") =>
    earlier
      .reduce((total, row) => total + BigInt(row[key]), BigInt(0))
      .toString()
  return [
    ...(earlier.length
      ? [{ sequence: null, payable: sum("payable"), advance: sum("advance") }]
      : []),
    ...inPage,
  ]
}

test("supplier statement running balance is exact on every page, reversals included", () => {
  const newestFirst = ledger.map((row) => row.sequence).reverse()
  const whole = supplierStatementRunningBalances(
    newestFirst,
    movementsFor(newestFirst),
  )
  expect(whole.get("15")).toEqual({
    payableBalanceMinor: "5400000",
    advanceBalanceMinor: "200000",
  })
  // The duplicate payment lowers the balance and its reversal restores it.
  expect(whole.get("8")?.payableBalanceMinor).toBe("0")
  expect(whole.get("9")?.payableBalanceMinor).toBe("1200000")
  expect(whole.get("3")?.payableBalanceMinor).toBe("2400000")

  for (const size of [1, 2, 3]) {
    for (let start = 0; start < newestFirst.length; start += size) {
      const page = newestFirst.slice(start, start + size)
      const paged = supplierStatementRunningBalances(page, movementsFor(page))
      for (const sequence of page)
        expect(paged.get(sequence)).toEqual(whole.get(sequence))
    }
  }
})

test("supplier statement asks for balances up to its newest line and attaches them", async () => {
  let rawQuery: { strings: readonly string[]; values: unknown[] } | undefined
  const entry = (sequence: string, id: string) => ({
    id,
    kind: "PURCHASE_PAYMENT",
    side: "DEBIT",
    amountMinor: BigInt("1200000"),
    description: "Payment",
    effectiveAt: new Date("2026-09-12T10:00:00.000Z"),
    recordedAt: new Date("2026-09-12T10:00:00.000Z"),
    actorUserId: "owner-1",
    journalEntryId: `journal-${sequence}`,
    moneyAccountId: "cash-1",
    reversalOfId: null,
    journalEntry: { sequence: BigInt(sequence) },
    reversals: [],
  })
  const tx = {
    $queryRaw: async (query: {
      strings: readonly string[]
      values: unknown[]
    }) => {
      rawQuery = query
      return [
        { sequence: null, payable: "2400000", advance: "0" },
        { sequence: "5", payable: "-1200000", advance: "0" },
        { sequence: "8", payable: "-1200000", advance: "0" },
      ]
    },
    membership: { findFirst: async () => ({ tenant: { isActive: true } }) },
    financeBook: {
      findFirst: async () => ({
        id: "book-1",
        currencyCode: "NGN",
        lastSequence: BigInt(20),
      }),
    },
    financeSupplierAccount: {
      findFirst: async () => ({
        id: "supplier-1",
        bookId: "book-1",
        code: "NORTH",
        name: "North",
      }),
    },
    financeSupplierEntry: {
      findFirst: async () => ({ id: "cursor-entry" }),
      findMany: async () => [
        entry("8", "e8"),
        entry("5", "e5"),
        entry("3", "e3"),
      ],
    },
    financeAccount: { findMany: async () => [] },
    financeJournalLine: { aggregate: async () => ({ _sum: {} }) },
  }
  const db = {
    $transaction: async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
  }

  const result = await getFinanceSupplierStatement(db as never, {
    ...actor,
    bookId: "book-1",
    supplierId: "supplier-1",
    snapshotSequence: "20",
    cursor: "9",
    limit: 2,
  })

  expect(result.nextCursor).toBe("5")
  expect(result.data.map((row) => row.payableBalanceMinor)).toEqual([
    "0",
    "1200000",
  ])
  expect(rawQuery?.values).toEqual([
    BigInt(5),
    "book-1",
    "supplier-1",
    BigInt(8),
  ])
})
