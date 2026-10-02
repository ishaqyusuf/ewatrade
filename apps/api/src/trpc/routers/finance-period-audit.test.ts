import { expect, test } from "bun:test"
import { financePeriodAuditSchema } from "../../schemas/finance-period-audit"
import { createCallerFactory } from "../init"
import { financeRouter } from "./finance"

test("period audit schema rejects actor injection and invalid pagination", () => {
  expect(financePeriodAuditSchema.parse({ bookId: "book-1" })).toEqual({
    bookId: "book-1",
    limit: 30,
  })
  for (const data of [
    { tenantId: "foreign-tenant" },
    { actorUserId: "foreign-owner" },
    { cursor: "" },
    { limit: 51 },
    { limit: 1.5 },
  ]) {
    expect(
      financePeriodAuditSchema.safeParse({ bookId: "book-1", ...data }).success,
    ).toBe(false)
  }
})

test("period audit denies Manager before database access", async () => {
  let effects = 0
  const db = new Proxy(
    {},
    {
      get() {
        effects += 1
        throw new Error("Manager must not read finance audit")
      },
    },
  )
  const caller = createCallerFactory(financeRouter)({
    db,
    requestHeaders: new Headers(),
    requestId: "period-audit-test",
    session: {
      session: { id: "session", token: "session-token" },
      user: { id: "session-actor" },
    },
    tenantContext: {
      tenant: { id: "tenant-from-session", qaPurgeStartedAt: null },
      membership: { id: "membership", role: "MANAGER" },
    },
  } as never)
  await expect(caller.periodAudit({ bookId: "book-1" })).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  expect(effects).toBe(0)
})
