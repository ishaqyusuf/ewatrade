import { expect, test } from "bun:test"
import { getFinanceSupplierPayableAging } from "./supplier-aging"
import { agingSource } from "./supplier-aging-test-fixture"

const input = {
  tenantId: "tenant",
  actorUserId: "owner",
  bookId: "book",
  supplierId: "supplier",
  asOfDate: "2026-05-01",
}
function fixture() {
  const sources = [
    agingSource({
      id: "bill",
      sequence: 1,
      dueAt: new Date("2026-04-01T12:00:00Z"),
    }),
  ]
  const queries: Record<string, unknown> = {}
  const tx = {
    $queryRaw: async () => [],
    membership: {
      findFirst: async (query: unknown) => {
        queries.membership = query
        return { tenant: { id: "tenant", isActive: true, currencyCode: "NGN" } }
      },
    },
    financeBook: {
      findFirst: async (query: unknown) => {
        queries.book = query
        return {
          id: "book",
          currencyCode: "NGN",
          lastSequence: BigInt(10),
          startsAt: new Date("2026-01-01T00:00:00Z"),
        }
      },
    },
    financeSupplierAccount: {
      findFirst: async (query: unknown) => {
        queries.supplier = query
        return { id: "supplier", bookId: "book", code: "SUP", name: "Supplier" }
      },
    },
    financeSupplierEntry: {
      findMany: async (query: unknown) => {
        queries.sources = query
        return sources
      },
    },
    store: {
      findMany: async (query: unknown) => {
        queries.stores = query
        return [{ id: "store" }]
      },
    },
    financeJournalLine: {
      aggregate: async (query: { where: { account: { purpose: string } } }) => {
        const purpose =
          query.where.account.purpose === "PAYABLE" ? "payable" : "advance"
        if (purpose) queries[purpose] = query
        return {
          _sum: {
            debitMinor: BigInt(0),
            creditMinor: purpose === "payable" ? BigInt(1000) : BigInt(0),
          },
        }
      },
    },
  }
  const db = {
    $transaction: async (
      callback: (transaction: typeof tx) => unknown,
      options: unknown,
    ) => {
      queries.transaction = options
      return callback(tx)
    },
  }
  return { tx, db, sources, queries }
}

test("reader pins source, totals and UTC cutoff together under current Owner/Admin scope", async () => {
  const { db, queries } = fixture()
  const result = await getFinanceSupplierPayableAging(db as never, {
    ...input,
    snapshotSequence: "5",
  })
  expect(result).toMatchObject({
    snapshotSequence: "5",
    asOfDate: "2026-05-01",
    payableMinor: "1000",
    advanceMinor: "0",
    controlScope: "SUPPLIER_ALL_STORES",
    dateBasis: "UTC",
  })
  expect(queries.membership).toMatchObject({
    where: {
      tenantId: "tenant",
      userId: "owner",
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
  })
  expect(queries.book).toMatchObject({
    where: { id: "book", tenantId: "tenant" },
  })
  expect(queries.supplier).toMatchObject({
    where: { id: "supplier", bookId: "book" },
  })
  expect(queries.sources).toMatchObject({
    where: {
      bookId: "book",
      supplierId: "supplier",
      journalEntry: {
        sequence: { lte: BigInt(5) },
        effectiveAt: { lt: new Date("2026-05-02T00:00:00Z") },
      },
    },
    orderBy: { journalEntry: { sequence: "asc" } },
    take: 1001,
  })
  expect(queries.payable).toMatchObject({
    where: {
      bookId: "book",
      entry: {
        sequence: { lte: BigInt(5) },
        effectiveAt: { lt: new Date("2026-05-02T00:00:00Z") },
        supplierEntries: { some: { bookId: "book", supplierId: "supplier" } },
      },
    },
  })
  expect(queries.stores).toMatchObject({
    where: { tenantId: "tenant", currencyCode: "NGN", id: { in: ["store"] } },
  })
  expect(queries.transaction).toEqual({
    maxWait: 10000,
    timeout: 30000,
    isolationLevel: "RepeatableRead",
  })
})

test("stable outstanding source pages retain all-source totals and original sequence watermark", async () => {
  const { db, tx, sources } = fixture()
  sources.push(
    agingSource({ id: "second", sequence: 2 }),
    agingSource({ id: "third", sequence: 3 }),
  )
  tx.financeJournalLine.aggregate = async (query) => ({
    _sum: {
      debitMinor: BigInt(0),
      creditMinor:
        query.where.account.purpose === "PAYABLE" ? BigInt(3000) : BigInt(0),
    },
  })
  const first = await getFinanceSupplierPayableAging(db as never, {
    ...input,
    limit: 1,
  })
  const second = await getFinanceSupplierPayableAging(db as never, {
    ...input,
    limit: 1,
    snapshotSequence: first.snapshotSequence,
    cursor: first.nextCursor ?? undefined,
  })
  expect(first.nextCursor?.sequence).toBe("1")
  expect(second.data[0]?.billId).toBe("second")
  expect(second.nextCursor?.sequence).toBe("2")
  expect(second.payableMinor).toBe("3000")
  expect(second.outstandingSourceCount).toBe(3)
  for (const change of [
    { asOfDate: "2026-05-02" },
    { snapshotSequence: "9" },
    { supplierId: "other" },
    { bookId: "other" },
  ]) {
    await expect(
      getFinanceSupplierPayableAging({} as never, {
        ...input,
        snapshotSequence: first.snapshotSequence,
        cursor: first.nextCursor ?? undefined,
        ...change,
      }),
    ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  }
  expect(
    second.buckets.reduce(
      (sum, bucket) => sum + BigInt(bucket.amountMinor),
      BigInt(0),
    ),
  ).toBe(BigInt(3000))
  await expect(
    getFinanceSupplierPayableAging(db as never, {
      ...input,
      snapshotSequence: "10",
      cursor: {
        sequence: "4",
        bookId: "book",
        supplierId: "supplier",
        asOfDate: input.asOfDate,
        snapshotSequence: "10",
      },
    }),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
})

test("snapshot excludes later/backdated payments, later cancellation and next-day midnight", async () => {
  const { db, tx, queries, sources } = fixture()
  const bill = sources[0]
  if (!bill) throw new Error("Missing fixture bill")
  const payment = agingSource({
    id: "paid",
    sequence: 6,
    kind: "PURCHASE_PAYMENT",
    billId: "bill",
    amount: BigInt(200),
    effectiveAt: new Date("2026-04-02T10:00:00Z"),
  })
  const nextDay = agingSource({
    id: "midnight",
    sequence: 4,
    kind: "PURCHASE_PAYMENT",
    billId: "bill",
    amount: BigInt(100),
    effectiveAt: new Date("2026-05-02T00:00:00Z"),
  })
  const cancellation = agingSource({
    id: "cancel",
    sequence: 7,
    kind: "REVERSAL",
    reversal: bill,
    effectiveAt: new Date("2026-05-03T00:00:00Z"),
  })
  tx.financeSupplierEntry.findMany = async (query) => {
    queries.sources = query
    const scope = (
      query as {
        where: {
          journalEntry: { sequence: { lte: bigint }; effectiveAt: { lt: Date } }
        }
      }
    ).where.journalEntry
    return [bill, payment, nextDay, cancellation].filter(
      (source) =>
        source.journalEntry.sequence <= scope.sequence.lte &&
        source.effectiveAt < scope.effectiveAt.lt,
    )
  }
  const result = await getFinanceSupplierPayableAging(db as never, {
    ...input,
    snapshotSequence: "5",
  })
  expect(result.sourcesRead).toBe(1)
  expect(result.payableMinor).toBe("1000")
})

test("permission, foreign Book/supplier, currency and source Store failures stop the reader", async () => {
  for (const reason of [
    "permission",
    "book",
    "supplier",
    "currency",
    "store",
  ] as const) {
    const { db, tx, queries } = fixture()
    if (reason === "permission")
      tx.membership.findFirst = async () => null as never
    if (reason === "book") tx.financeBook.findFirst = async () => null as never
    if (reason === "supplier")
      tx.financeSupplierAccount.findFirst = async () => null as never
    if (reason === "currency")
      tx.financeBook.findFirst = async () => ({
        id: "book",
        currencyCode: "USD",
        lastSequence: BigInt(10),
        startsAt: new Date("2026-01-01T00:00:00Z"),
      })
    if (reason === "store") tx.store.findMany = async () => []
    await expect(
      getFinanceSupplierPayableAging(db as never, input),
    ).rejects.toMatchObject({
      code:
        reason === "permission"
          ? "FORBIDDEN"
          : reason === "book" || reason === "supplier"
            ? "NOT_FOUND"
            : "CONFLICT",
    })
    expect(queries.payable).toBeUndefined()
    if (reason !== "store") expect(queries.sources).toBeUndefined()
  }
})

test("over-limit history refuses before totals; invalid options never query", async () => {
  const { db, sources, queries } = fixture()
  const bill = sources[0]
  if (!bill) throw new Error("Missing fixture bill")
  sources.push(...Array.from({ length: 1000 }, () => bill))
  await expect(
    getFinanceSupplierPayableAging(db as never, input),
  ).rejects.toThrow("source limit")
  expect(queries.payable).toBeUndefined()
  for (const options of [
    {
      cursor: {
        sequence: "1",
        bookId: "book",
        supplierId: "supplier",
        asOfDate: input.asOfDate,
        snapshotSequence: "10",
      },
    },
    { snapshotSequence: "9223372036854775808" },
    { limit: 51 },
    { asOfDate: "2026-02-29" },
    { bookId: "" },
    { snapshotSequence: "01" },
  ]) {
    await expect(
      getFinanceSupplierPayableAging({} as never, { ...input, ...options }),
    ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  }
  await expect(
    getFinanceSupplierPayableAging(db as never, {
      ...input,
      snapshotSequence: "11",
    }),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
  await expect(
    getFinanceSupplierPayableAging(db as never, {
      ...input,
      asOfDate: "2025-12-31",
    }),
  ).rejects.toMatchObject({ code: "INVALID_JOURNAL" })
})
