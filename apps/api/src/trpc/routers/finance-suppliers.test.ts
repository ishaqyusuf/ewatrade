import { expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { financeRouter } from "./finance"

const createCaller = createCallerFactory(financeRouter)

function context(db: unknown, role: string) {
  return {
    db,
    requestHeaders: new Headers(),
    requestId: "finance-suppliers-test",
    session: {
      session: { id: "session-1", token: "session-token" },
      user: { id: "session-actor" },
    },
    tenantContext: {
      tenant: { id: "tenant-from-session", qaPurgeStartedAt: null },
      membership: { id: "membership-1", role },
    },
  }
}

test("all supplier procedures deny Manager before database access", async () => {
  let effects = 0
  const db = new Proxy(
    {},
    {
      get() {
        return async () => {
          effects += 1
          throw new Error("database should not be reached")
        }
      },
    },
  )
  const caller = createCaller(context(db, "MANAGER") as never)
  const effectiveAt = "2026-10-01T10:00:00.000Z"
  const procedures = [
    () =>
      caller.createSupplier({
        bookId: "book-1",
        clientCommandId: "create-1",
        code: "NORTH",
        name: "North",
      }),
    () =>
      caller.recordSupplierOpening({
        bookId: "book-1",
        clientCommandId: "opening-1",
        supplierId: "supplier-1",
        kind: "PAYABLE",
        amountMinor: "1000",
        description: "Opening payable",
        effectiveAt,
      }),
    () =>
      caller.recordSupplierAdvance({
        bookId: "book-1",
        clientCommandId: "advance-1",
        supplierId: "supplier-1",
        moneyAccountId: "cash-1",
        amountMinor: "1000",
        description: "Supplier advance",
        effectiveAt,
      }),
    () =>
      caller.reverseSupplierEntry({
        bookId: "book-1",
        clientCommandId: "reverse-1",
        entryId: "entry-1",
        reason: "Entered in error",
        effectiveAt,
      }),
    () => caller.suppliers({ bookId: "book-1" }),
    () =>
      caller.supplierStatement({ bookId: "book-1", supplierId: "supplier-1" }),
    () =>
      caller.supplierPayableAging({
        bookId: "book-1",
        supplierId: "supplier-1",
        asOfDate: "2026-10-01",
      }),
  ]
  for (const procedure of procedures) {
    await expect(procedure()).rejects.toMatchObject({ code: "FORBIDDEN" })
  }
  expect(effects).toBe(0)
})

test("supplier list uses the protected actor and exact book scope", async () => {
  const rawLockValues: unknown[][] = []
  let bookQuery: unknown
  let suppliersQuery: unknown
  const tx = {
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      rawLockValues.push(values)
      return []
    },
    membership: {
      findFirst: async () => ({
        tenant: {
          id: "tenant-from-session",
          currencyCode: "NGN",
          timezone: "Africa/Lagos",
          isActive: true,
        },
      }),
    },
    financeBook: {
      findFirst: async (query: unknown) => {
        bookQuery = query
        return { id: "book-1" }
      },
    },
    financeSupplierAccount: {
      findFirst: async () => null,
      findMany: async (query: unknown) => {
        suppliersQuery = query
        return [
          { id: "supplier-1", bookId: "book-1", code: "NORTH", name: "North" },
        ]
      },
    },
  }
  const db = {
    $transaction: async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
  }
  const caller = createCaller(context(db, "OWNER") as never)
  const result = await caller.suppliers({ bookId: "book-1", query: "north" })

  expect(result).toEqual({
    data: [
      { id: "supplier-1", bookId: "book-1", code: "NORTH", name: "North" },
    ],
    nextCursor: null,
  })
  expect(rawLockValues).toEqual([["tenant-from-session", "session-actor"]])
  expect(bookQuery).toMatchObject({
    where: { id: "book-1", tenantId: "tenant-from-session" },
  })
  expect(suppliersQuery).toMatchObject({
    where: {
      bookId: "book-1",
      OR: [
        { code: { contains: "north", mode: "insensitive" } },
        { name: { contains: "north", mode: "insensitive" } },
      ],
    },
    orderBy: [{ code: "asc" }, { id: "asc" }],
    take: 31,
  })
})

test("payable aging uses the protected actor and original UTC cutoff", async () => {
  let membershipQuery: unknown
  let bookQuery: unknown
  let supplierQuery: unknown
  let sourceQuery: unknown
  const controls: unknown[] = []
  const tx = {
    $queryRaw: async () => [],
    membership: {
      findFirst: async (query: unknown) => {
        membershipQuery = query
        return {
          tenant: {
            id: "tenant-from-session",
            isActive: true,
            currencyCode: "NGN",
          },
        }
      },
    },
    financeBook: {
      findFirst: async (query: unknown) => {
        bookQuery = query
        return {
          id: "book-1",
          currencyCode: "NGN",
          startsAt: new Date("2026-01-01"),
          lastSequence: BigInt(8),
        }
      },
    },
    financeSupplierAccount: {
      findFirst: async (query: unknown) => {
        supplierQuery = query
        return {
          id: "supplier-1",
          bookId: "book-1",
          name: "Supplier",
          code: "S1",
        }
      },
    },
    financeSupplierEntry: {
      findMany: async (query: unknown) => {
        sourceQuery = query
        return []
      },
    },
    financeJournalLine: {
      aggregate: async (query: unknown) => {
        controls.push(query)
        return { _sum: { debitMinor: null, creditMinor: null } }
      },
    },
  }
  const db = {
    $transaction: async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
  }
  const caller = createCaller(context(db, "OWNER") as never)
  const result = await caller.supplierPayableAging({
    bookId: "book-1",
    supplierId: "supplier-1",
    asOfDate: "2026-10-01",
  })
  expect(membershipQuery).toMatchObject({
    where: { tenantId: "tenant-from-session", userId: "session-actor" },
  })
  expect(bookQuery).toMatchObject({
    where: { id: "book-1", tenantId: "tenant-from-session" },
  })
  expect(supplierQuery).toMatchObject({
    where: { id: "supplier-1", bookId: "book-1" },
  })
  expect(sourceQuery).toMatchObject({
    where: {
      bookId: "book-1",
      supplierId: "supplier-1",
      journalEntry: {
        sequence: { lte: BigInt(8) },
        effectiveAt: { lt: new Date("2026-10-02T00:00:00.000Z") },
      },
    },
    take: 1001,
  })
  expect(controls).toHaveLength(2)
  expect(result).toMatchObject({
    payableMinor: "0",
    advanceMinor: "0",
    snapshotSequence: "8",
    asOfDate: "2026-10-01",
    dateBasis: "UTC",
    controlScope: "SUPPLIER_ALL_STORES",
    data: [],
    nextCursor: null,
  })
})

test("supplier procedures reject actor and Tenant overrides at the API boundary", async () => {
  let effects = 0
  const db = new Proxy(
    {},
    {
      get() {
        return async () => {
          effects += 1
          throw new Error("database should not be reached")
        }
      },
    },
  )
  const caller = createCaller(context(db, "OWNER") as never)
  await expect(
    caller.suppliers({
      bookId: "book-1",
      tenantId: "foreign-tenant",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    caller.createSupplier({
      bookId: "book-1",
      clientCommandId: "cmd-1",
      code: "NORTH",
      name: "North",
      actorUserId: "foreign-actor",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(effects).toBe(0)
})
