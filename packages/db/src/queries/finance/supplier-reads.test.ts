import { expect, test } from "bun:test"
import {
  getFinanceSupplierStatement,
  listFinanceSuppliers,
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
