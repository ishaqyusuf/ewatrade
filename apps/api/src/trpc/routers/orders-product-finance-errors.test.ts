import { expect, test } from "bun:test"
import { FinanceError } from "@ewatrade/db/queries"
import { createCallerFactory } from "../init"
import { ordersRouter } from "./orders"

const createCaller = createCallerFactory(ordersRouter)
const input = {
  clientReturnId: "return-command-001",
  disposition: "restock",
  orderLineId: "order-line-1",
  quantity: "1",
  reason: "Customer returned an unopened item",
  schemaVersion: 1,
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
    },
  }
}

test("Product return maps finance posting errors while retaining operator access and server scope", async () => {
  const cases = [
    { financeCode: "CLOSED_PERIOD", trpcCode: "CONFLICT" },
    { financeCode: "CONFLICT", trpcCode: "CONFLICT" },
    { financeCode: "INVALID_JOURNAL", trpcCode: "BAD_REQUEST" },
  ] as const

  for (const { financeCode, trpcCode } of cases) {
    const message = `Return finance failure: ${financeCode}`
    let transactionCount = 0
    let scopedTenant: string | undefined
    const db = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        transactionCount += 1
        const tx = {
          commercialOrderLine: {
            findFirst: async (args: {
              where: { order: { tenantId: string } }
            }) => {
              scopedTenant = args.where.order.tenantId
              throw new FinanceError(financeCode, message)
            },
          },
        }
        return callback(tx)
      },
    }
    const caller = createCaller(context("CASHIER", db) as never)

    await expect(caller.returnProductLine(input)).rejects.toMatchObject({
      code: trpcCode,
      message,
    })
    expect(transactionCount).toBe(1)
    expect(scopedTenant).toBe("session-tenant")
  }
})

test("Product return authorization rejects non-operators before database access", async () => {
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
  const caller = createCaller(context("MEMBER", db) as never)

  await expect(caller.returnProductLine(input)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  expect(databaseEffects).toBe(0)
})
