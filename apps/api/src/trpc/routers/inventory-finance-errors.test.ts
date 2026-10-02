import { expect, test } from "bun:test"
import { FinanceError } from "@ewatrade/db/queries"
import { createCallerFactory } from "../init"
import { inventoryRouter } from "./inventory"

const createCaller = createCallerFactory(inventoryRouter)
const input = {
  clientOperationId: "transform-command-001",
  expectedConfigurationVersionId: "configuration-1",
  reason: "Repackage returned bulk stock",
  schemaVersion: 1,
  source: "operator",
  sourceBalanceRevision: 3,
  sourceBalanceSourceId: "source-balance",
  sourceQuantity: "2",
  targetBalanceRevision: 5,
  targetBalanceSourceId: "target-balance",
  targetQuantity: "24",
} as const

function context(role: string, db: unknown) {
  return {
    db,
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "session-token" },
      user: { id: "session-actor" },
    },
    tenantContext: {
      tenant: { id: "session-tenant", qaPurgeStartedAt: null },
      membership: { id: "membership-1", role },
      stores: [{ id: "session-store" }],
      activeStore: { id: "session-store" },
    },
  }
}

test("transformation maps FinanceError and uses session Tenant and Store scope", async () => {
  const cases = [
    { financeCode: "CLOSED_PERIOD", trpcCode: "CONFLICT" },
    { financeCode: "CONFLICT", trpcCode: "CONFLICT" },
    { financeCode: "INVALID_AMOUNT", trpcCode: "BAD_REQUEST" },
  ] as const

  for (const { financeCode, trpcCode } of cases) {
    const message = `Transformation finance failure: ${financeCode}`
    let transactionCount = 0
    let receivedScope: { id: string; tenantId: string } | undefined
    const db = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        transactionCount += 1
        const tx = {
          store: {
            findFirst: async (args: {
              where: { id: string; tenantId: string }
            }) => {
              receivedScope = args.where
              throw new FinanceError(financeCode, message)
            },
          },
        }
        return callback(tx)
      },
    }
    const caller = createCaller(context("MANAGER", db) as never)

    await expect(caller.transformPackagedStock(input)).rejects.toMatchObject({
      code: trpcCode,
      message,
    })
    expect(transactionCount).toBe(1)
    expect(receivedScope).toEqual({
      id: "session-store",
      tenantId: "session-tenant",
    })
  }
})

test("transformation manager gate rejects before database access", async () => {
  let databaseEffects = 0
  const db = new Proxy(
    {},
    {
      get() {
        databaseEffects += 1
        throw new Error("database should not be reached")
      },
    },
  )
  const caller = createCaller(context("CASHIER", db) as never)

  await expect(caller.transformPackagedStock(input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  expect(databaseEffects).toBe(0)
})

test("transformation rejects caller-supplied actor or Tenant authority", async () => {
  let databaseEffects = 0
  const db = new Proxy(
    {},
    {
      get() {
        databaseEffects += 1
        throw new Error("database should not be reached")
      },
    },
  )
  const caller = createCaller(context("MANAGER", db) as never)

  await expect(
    caller.transformPackagedStock({
      ...input,
      actorUserId: "caller-actor",
      tenantId: "caller-tenant",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(databaseEffects).toBe(0)
})

const countInput = {
  clientOperationId: "count-command-001",
  reason: "Finalize measured count",
  schemaVersion: 1,
  stockCountId: "count-001",
} as const

test("count finalization retains Manager authority and maps financial rejection", async () => {
  let receivedScope: { id: string; tenantId: string } | undefined
  const db = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        stockCount: {
          findFirst: async (args: {
            where: { id: string; tenantId: string }
          }) => {
            receivedScope = args.where
            throw new FinanceError("CLOSED_PERIOD", "Count date is closed.")
          },
        },
      }),
  }
  const caller = createCaller(context("MANAGER", db) as never)
  await expect(caller.finalizeStockCount(countInput)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Count date is closed.",
  })
  expect(receivedScope).toEqual({
    id: "count-001",
    tenantId: "session-tenant",
  })
})

test("count finalization rejects Cashier and supplied source authority before database access", async () => {
  let databaseEffects = 0
  const db = new Proxy(
    {},
    {
      get() {
        databaseEffects += 1
        throw new Error("database should not be reached")
      },
    },
  )
  await expect(
    createCaller(context("CASHIER", db) as never).finalizeStockCount(
      countInput,
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    createCaller(context("MANAGER", db) as never).finalizeStockCount({
      ...countInput,
      actorUserId: "caller-actor",
      tenantId: "caller-tenant",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(databaseEffects).toBe(0)
})
