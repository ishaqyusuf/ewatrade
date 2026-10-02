import { expect, test } from "bun:test"
import {
  financeBookSchema,
  financeFiscalCalendarSchema,
} from "../../schemas/finance"
import { createCallerFactory } from "../init"
import { financeRouter } from "./finance"

const setup = {
  bookId: "book",
  clientCommandId: "fiscal-setup",
  startMonth: 4,
  startDay: 1,
  expectedRevision: 0,
  reason: "Set the business fiscal year",
}

test("fiscal setup requires an explicit valid recurring date, revision and reason without caller financial authority", () => {
  expect(financeFiscalCalendarSchema.parse(setup)).toEqual(setup)
  for (const change of [
    { startMonth: undefined },
    { startDay: undefined },
    { startMonth: 2, startDay: 29 },
    { startMonth: 4, startDay: 31 },
    { startMonth: 13 },
    { startDay: 0 },
    { startDay: 1.5 },
    { expectedRevision: undefined },
    { expectedRevision: -1 },
    { expectedRevision: 2147483647 },
    { reason: " " },
    { actorUserId: "foreign" },
    { tenantId: "foreign" },
    { retainedEarningsAccountId: "capital" },
    { lines: [] },
    { earningsMinor: "100" },
  ])
    expect(
      financeFiscalCalendarSchema.safeParse({ ...setup, ...change }).success,
    ).toBe(false)
  expect(
    financeBookSchema.safeParse({ bookId: "book", provision: true }).success,
  ).toBe(false)
})

test("registered fiscal setup/read deny Manager before any database access", async () => {
  let access = 0
  const db = new Proxy(
    {},
    {
      get() {
        access++
        throw new Error("No Manager fiscal access")
      },
    },
  )
  const caller = createCallerFactory(financeRouter)({
    db,
    requestHeaders: new Headers(),
    requestId: "fiscal-settings-test",
    session: {
      session: { id: "session", token: "token" },
      user: { id: "actor" },
    },
    tenantContext: {
      tenant: { id: "tenant", qaPurgeStartedAt: null },
      membership: { id: "membership", role: "MANAGER" },
    },
  } as never)
  await expect(caller.configureFiscalCalendar(setup)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  await expect(caller.fiscalCalendar({ bookId: "book" })).rejects.toMatchObject(
    { code: "FORBIDDEN" },
  )
  await expect(caller.yearEndPreview({ bookId: "book" })).rejects.toMatchObject(
    { code: "FORBIDDEN" },
  )
  expect(access).toBe(0)
})

test("year-end preview rejects caller dates, snapshot, financial lines and readiness authority", () => {
  for (const field of [
    "from",
    "through",
    "snapshotSequence",
    "earningsMinor",
    "lines",
    "retainedEarningsAccountId",
    "sourceEvidence",
    "canClose",
    "tenantId",
    "actorUserId",
  ])
    expect(
      financeBookSchema.safeParse({ bookId: "book", [field]: "caller" })
        .success,
    ).toBe(false)
})
