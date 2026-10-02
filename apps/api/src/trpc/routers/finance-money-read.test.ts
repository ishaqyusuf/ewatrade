import { expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { financeRouter } from "./finance"

const createCaller = createCallerFactory(financeRouter)

function callerContext({
  db,
  role,
  userId = "session-actor",
}: {
  db: unknown
  role: string
  userId?: string
}) {
  return {
    db,
    requestHeaders: new Headers(),
    requestId: "finance-read-test",
    session: {
      session: { id: "session-1", token: "session-token" },
      user: { id: userId },
    },
    tenantContext: {
      tenant: { id: "tenant-from-session", qaPurgeStartedAt: null },
      membership: { id: "membership-1", role },
    },
  }
}

test("money movement detail denies Manager before database access", async () => {
  let databaseEffects = 0
  const db = new Proxy(
    {},
    {
      get() {
        return async () => {
          databaseEffects += 1
          throw new Error("database should not be reached")
        }
      },
    },
  )
  const caller = createCaller(callerContext({ db, role: "MANAGER" }) as never)

  await expect(
    caller.moneyMovement({ bookId: "book-1", entryId: "entry-1" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(databaseEffects).toBe(0)
})

test("money movement detail rejects actor and Tenant overrides", async () => {
  let databaseEffects = 0
  const db = new Proxy(
    {},
    {
      get() {
        return async () => {
          databaseEffects += 1
          throw new Error("database should not be reached")
        }
      },
    },
  )
  const caller = createCaller(callerContext({ db, role: "OWNER" }) as never)

  await expect(
    caller.moneyMovement({
      bookId: "book-1",
      entryId: "entry-1",
      tenantId: "foreign-tenant",
      actorUserId: "foreign-actor",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(databaseEffects).toBe(0)
})

test("Owner money movement query supplies actor and Tenant from protected context", async () => {
  const lockValues: unknown[][] = []
  let bookQuery: unknown
  let entryQuery: unknown
  const tx = {
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      lockValues.push(values)
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
        return { id: "book-1", currencyCode: "NGN" }
      },
    },
    financeJournalEntry: {
      findFirst: async (query: unknown) => {
        entryQuery = query
        return {
          id: "entry-1",
          bookId: "book-1",
          sourceKind: "OWNER_WITHDRAWAL",
          description: "Owner withdrawal",
          effectiveAt: new Date("2026-09-01T00:00:00Z"),
          recordedAt: new Date("2026-09-01T00:01:00Z"),
          actorUserId: "session-actor",
          sequence: BigInt(1),
          reversalOfId: null,
          reversal: null,
          lines: [],
        }
      },
    },
  }
  const db = {
    $transaction: async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
  }
  const caller = createCaller(
    callerContext({ db, role: "OWNER", userId: "session-actor" }) as never,
  )

  const result = await caller.moneyMovement({
    bookId: "book-1",
    entryId: "entry-1",
  })

  expect(result.actorUserId).toBe("session-actor")
  expect(lockValues).toEqual([["tenant-from-session", "session-actor"]])
  expect(bookQuery).toMatchObject({
    where: { id: "book-1", tenantId: "tenant-from-session" },
  })
  expect(entryQuery).toMatchObject({
    where: { id: "entry-1", bookId: "book-1" },
  })
})
