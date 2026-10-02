import { expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { ordersRouter } from "./orders"

const createCaller = createCallerFactory(ordersRouter)
const command = {
  clientOperationId: "fulfill-service-001",
  orderLineId: "order-line-1",
  reason: "Service completed and authorized",
  schemaVersion: 1,
} as const

function context(role: string, db: unknown) {
  return {
    db,
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "session-token" },
      user: { id: "operator-1" },
    },
    tenantContext: {
      tenant: { id: "tenant-server", qaPurgeStartedAt: null },
      membership: { id: "membership-1", role },
    },
  }
}

test("charge-only Service-line fulfillment requires an order operator", async () => {
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
  const caller = createCaller(context("MEMBER", db) as never)

  await expect(
    caller.fulfillChargeOnlyServiceLine(command),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(databaseEffects).toBe(0)
})

test("charge-only Service-line fulfillment rejects caller authority overrides", async () => {
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
  const caller = createCaller(context("OWNER", db) as never)

  await expect(
    caller.fulfillChargeOnlyServiceLine({
      ...command,
      actorUserId: "caller-actor",
      tenantId: "caller-tenant",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(databaseEffects).toBe(0)
})
