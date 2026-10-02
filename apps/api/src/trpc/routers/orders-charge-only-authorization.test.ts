import { expect, test } from "bun:test"

import { createCallerFactory } from "../init"
import { ordersRouter } from "./orders"

const createCaller = createCallerFactory(ordersRouter)
const command = {
  clientOperationId: "authorize-service-001",
  orderLineId: "order-line-1",
  reason: "Customer requested release",
  schemaVersion: 1,
} as const

function context(role: string, db: unknown) {
  return {
    db,
    requestId: "request-test",
    session: {
      session: { id: "session-1", token: "session-token" },
      user: { id: "manager-1" },
    },
    tenantContext: {
      tenant: { id: "tenant-server", qaPurgeStartedAt: null },
      membership: { id: "membership-1", role },
    },
  }
}

test("charge-only Service-line authorization is management-only", async () => {
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

  for (const role of ["CASHIER", "OPERATOR", "SUPPORT", "MEMBER"]) {
    const caller = createCaller(context(role, db) as never)
    await expect(
      caller.authorizeChargeOnlyServiceLine(command),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  }
  expect(databaseEffects).toBe(0)
})

test("charge-only Service-line authorization rejects caller-supplied facts", async () => {
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
  const caller = createCaller(context("OWNER", db) as never)

  await expect(
    caller.authorizeChargeOnlyServiceLine({
      ...command,
      actorUserId: "caller-actor",
      tenantId: "caller-tenant",
      quantity: "1",
      authorizedAt: "2026-10-01T10:00:00.000Z",
      serviceAuthorizationPolicy: "MANUAL_RELEASE",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(databaseEffects).toBe(0)
})
