import { expect, test } from "bun:test"
import { FinanceError, getCustomerLedgerStatement } from "@ewatrade/db/queries"
import { createCallerFactory } from "../init"
import type { RouterInputs } from "./_app"
import { customerLedgerRouter } from "./customer-ledger"

const createCaller = createCallerFactory(customerLedgerRouter)
type Caller = ReturnType<typeof createCaller>

test("ledger router loads implemented repository procedures", () => {
  expect(Object.keys(customerLedgerRouter._def.procedures).sort()).toEqual([
    "accountDetail",
    "accounts",
    "allocationHistory",
    "applyCredit",
    "commandStatus",
    "ensureAccount",
    "entryDetail",
    "receivables",
    "recordOpening",
    "recordReceipt",
    "refundUnusedCredit",
    "releaseAllocation",
    "reverseEntry",
    "sources",
    "statement",
  ])
})

const inputs = {
  allocationHistory: {
    accountId: "account-1",
    allocationId: "allocation-1",
    expectedRevision: "1",
  },
  ensureAccount: { customerId: "customer-1", currencyCode: "NGN" },
  recordOpening: {
    bookId: "book-1",
    clientCommandId: "opening-1",
    accountId: "account-1",
    direction: "DEBT",
    amountMinor: "1000",
    reason: "Opening debt",
  },
  recordReceipt: {
    bookId: "book-1",
    clientCommandId: "receipt-1",
    accountId: "account-1",
    moneyAccountId: "cash-1",
    amountMinor: "1000",
    method: "CASH",
    description: "Customer deposit",
  },
  applyCredit: {
    bookId: "book-1",
    clientCommandId: "apply-1",
    accountId: "account-1",
    expectedRevision: "1",
    creditEntryId: "credit-1",
    chargeEntryId: "charge-1",
    amountMinor: "1000",
  },
  releaseAllocation: {
    bookId: "book-1",
    clientCommandId: "release-1",
    accountId: "account-1",
    expectedRevision: "1",
    allocationId: "allocation-1",
    amountMinor: "1000",
    reason: "Release allocation",
  },
  refundUnusedCredit: {
    bookId: "book-1",
    clientCommandId: "refund-1",
    accountId: "account-1",
    expectedRevision: "1",
    creditEntryId: "credit-1",
    amountMinor: "1000",
    moneyAccountId: "cash-1",
    method: "CASH",
    reason: "Return unused credit",
    effectiveAt: new Date("2026-10-01T10:00:00.000Z"),
  },
  reverseEntry: {
    bookId: "book-1",
    clientCommandId: "reverse-1",
    accountId: "account-1",
    entryId: "entry-1",
    expectedRevision: "1",
    reason: "Correct duplicate entry",
    effectiveAt: new Date("2026-10-01T10:00:00.000Z"),
  },
  statement: { accountId: "account-1" },
  commandStatus: { accountId: "account-1", clientCommandId: "receipt-1" },
  accounts: { customerId: "customer-1" },
  accountDetail: { accountId: "account-1" },
  sources: { accountId: "account-1", side: "CREDIT" },
  entryDetail: { accountId: "account-1", entryId: "entry-1" },
} satisfies RouterInputs["customerLedger"]

function callEveryProcedure(caller: Caller) {
  return [
    caller.ensureAccount(inputs.ensureAccount),
    caller.recordOpening(inputs.recordOpening),
    caller.recordReceipt(inputs.recordReceipt),
    caller.applyCredit(inputs.applyCredit),
    caller.releaseAllocation(inputs.releaseAllocation),
    caller.refundUnusedCredit(inputs.refundUnusedCredit),
    caller.reverseEntry(inputs.reverseEntry),
    caller.statement(inputs.statement),
    caller.commandStatus(inputs.commandStatus),
    caller.accounts(inputs.accounts),
    caller.accountDetail(inputs.accountDetail),
    caller.sources(inputs.sources),
    caller.entryDetail(inputs.entryDetail),
    caller.allocationHistory(inputs.allocationHistory),
  ]
}

function baseContext({
  db,
  role,
  userId = "owner-1",
}: {
  db: unknown
  role: string
  userId?: string
}) {
  return {
    db,
    requestHeaders: new Headers(),
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "session-token" },
      user: { id: userId },
    },
    tenantContext: {
      tenant: { id: "tenant-server", qaPurgeStartedAt: null },
      membership: { id: "membership-1", role },
    },
  }
}

test("all ledger reads and writes reject unauthenticated callers before DB effects", async () => {
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
  const caller = createCaller({
    ...baseContext({ db, role: "OWNER" }),
    session: null,
    tenantContext: null,
  } as never)

  const results = await Promise.allSettled(callEveryProcedure(caller))
  expect(results).toHaveLength(14)
  for (const result of results) {
    expect(result.status).toBe("rejected")
    if (result.status === "rejected") {
      expect(result.reason).toMatchObject({ code: "UNAUTHORIZED" })
    }
  }
  expect(databaseEffects).toBe(0)
})

test("all ledger reads and writes reject non-owner/admin roles before DB effects", async () => {
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
  const caller = createCaller(baseContext({ db, role: "MANAGER" }) as never)

  const results = await Promise.allSettled(callEveryProcedure(caller))
  expect(results).toHaveLength(14)
  for (const result of results) {
    expect(result.status).toBe("rejected")
    if (result.status === "rejected") {
      expect(result.reason).toMatchObject({ code: "FORBIDDEN" })
    }
  }
  expect(databaseEffects).toBe(0)
})

test("strict runtime input rejects actor and tenant overrides before DB effects", async () => {
  let databaseEffects = 0
  const caller = createCaller(
    baseContext({
      db: new Proxy(
        {},
        {
          get() {
            return async () => {
              databaseEffects += 1
              throw new Error("database should not be reached")
            }
          },
        },
      ),
      role: "OWNER",
    }) as never,
  )

  await expect(
    caller.accounts({
      ...inputs.accounts,
      tenantId: "caller-tenant",
      actorUserId: "caller-actor",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    caller.statement({ accountId: "account-1", afterSequence: "10" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    caller.sources({
      accountId: "account-1",
      side: "CREDIT",
      afterSequence: "10",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    caller.recordReceipt({
      ...inputs.recordReceipt,
      tenantId: "caller-tenant",
      actorUserId: "caller-actor",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    caller.reverseEntry({
      ...inputs.reverseEntry,
      tenantId: "caller-tenant",
      actorUserId: "caller-actor",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    caller.entryDetail({
      ...inputs.entryDetail,
      tenantId: "caller-tenant",
      actorUserId: "caller-actor",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    caller.entryDetail({
      accountId: "account-1",
      entryId: "entry-1",
      afterAllocationId: "allocation-1",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(databaseEffects).toBe(0)
})

test("repository refuses a continuation cursor without its pinned snapshot", async () => {
  let transactionCalls = 0
  await expect(
    getCustomerLedgerStatement(
      {
        $transaction: async () => {
          transactionCalls += 1
          return null
        },
      } as never,
      {
        accountId: "account-1",
        tenantId: "tenant-1",
        actorUserId: "actor-1",
        afterSequence: "10",
      },
    ),
  ).rejects.toBeInstanceOf(FinanceError)
  expect(transactionCalls).toBe(0)
})

test("account read derives repository actor and tenant from the authenticated context", async () => {
  const rawValues: unknown[][] = []
  const membershipQueries: unknown[] = []
  const customerQueries: unknown[] = []
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      rawValues.push(values)
      return []
    },
    membership: {
      findFirst: async (query: unknown) => {
        membershipQueries.push(query)
        return {
          tenant: {
            id: "tenant-server",
            currencyCode: "NGN",
            timezone: "Africa/Lagos",
            isActive: true,
          },
        }
      },
    },
    customer: {
      findFirst: async (query: unknown) => {
        customerQueries.push(query)
        return {
          id: "customer-1",
          name: "Amina",
          email: null,
          phone: null,
        }
      },
    },
    customerLedgerAccount: { findMany: async () => [] },
  }
  const db = {
    $transaction: async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
  }
  const caller = createCaller(
    baseContext({ db, role: "ADMIN", userId: "session-actor" }) as never,
  )

  const result = await caller
    .accounts({
      customerId: "customer-1",
      tenantId: "wrong-tenant",
      actorUserId: "wrong-actor",
    } as never)
    .catch(async (error) => {
      expect(error).toMatchObject({ code: "BAD_REQUEST" })
      return null
    })
  expect(result).toBe(null)
  expect(rawValues).toHaveLength(0)

  const actual = await caller.accounts({ customerId: "customer-1" })
  expect(actual.customer.id).toBe("customer-1")
  expect(rawValues[0]).toEqual(["tenant-server", "session-actor"])
  expect(membershipQueries[0]).toMatchObject({
    where: {
      tenantId: "tenant-server",
      userId: "session-actor",
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
  })
  expect(customerQueries[0]).toMatchObject({
    where: { id: "customer-1", tenantId: "tenant-server" },
  })
})

test("repository rechecks active management membership and FinanceError maps to tRPC", async () => {
  let customerReads = 0
  const tx = {
    $queryRaw: async () => [],
    membership: { findFirst: async () => null },
    customer: {
      findFirst: async () => {
        customerReads += 1
        return null
      },
    },
  }
  const caller = createCaller(
    baseContext({
      db: {
        $transaction: async (callback: (transaction: typeof tx) => unknown) =>
          callback(tx),
      },
      role: "OWNER",
    }) as never,
  )

  await expect(
    caller.ensureAccount({ customerId: "customer-1", currencyCode: "NGN" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(customerReads).toBe(0)

  const activeTx = {
    ...tx,
    membership: {
      findFirst: async () => ({
        tenant: {
          id: "tenant-server",
          currencyCode: "NGN",
          timezone: "Africa/Lagos",
          isActive: true,
        },
      }),
    },
    customer: { findFirst: async () => null },
  }
  const activeCaller = createCaller(
    baseContext({
      db: {
        $transaction: async (
          callback: (transaction: typeof activeTx) => unknown,
        ) => callback(activeTx),
      },
      role: "OWNER",
    }) as never,
  )
  await expect(
    activeCaller.ensureAccount({
      customerId: "missing-customer",
      currencyCode: "NGN",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
})

test("Owner reversal derives actor and Tenant then rechecks live membership before effects", async () => {
  const rawValues: unknown[][] = []
  const membershipQueries: unknown[] = []
  let financeWrites = 0
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      rawValues.push(values)
      return []
    },
    membership: {
      findFirst: async (query: unknown) => {
        membershipQueries.push(query)
        return null
      },
    },
    financeBook: {
      findUniqueOrThrow: async () => {
        financeWrites += 1
        throw new Error(
          "finance book should not be read after membership denial",
        )
      },
    },
    customerLedgerAccount: {
      findUniqueOrThrow: async () => {
        financeWrites += 1
        throw new Error(
          "ledger account should not be read after membership denial",
        )
      },
    },
  }
  const caller = createCaller(
    baseContext({
      db: {
        $transaction: async (callback: (transaction: typeof tx) => unknown) =>
          callback(tx),
      },
      role: "OWNER",
      userId: "session-actor",
    }) as never,
  )

  await expect(caller.reverseEntry(inputs.reverseEntry)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  expect(rawValues).toEqual([
    ["book-1", "tenant-server"],
    ["tenant-server", "session-actor"],
  ])
  expect(membershipQueries[0]).toMatchObject({
    where: {
      tenantId: "tenant-server",
      userId: "session-actor",
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
  })
  expect(financeWrites).toBe(0)
})
