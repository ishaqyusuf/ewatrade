import { afterAll, expect, test } from "bun:test"
import { PGlite } from "@electric-sql/pglite"
import type { Prisma } from "../../generated/prisma/client"
import { getDashboardOverviewMetrics } from "./dashboard-overview"
import type { DbClient } from "./types"

type OverviewInput = Parameters<typeof getDashboardOverviewMetrics>[1]
const input: OverviewInput = {
  createdByUserId: undefined,
  monthStart: new Date("2026-10-01T00:00:00Z"),
  storeId: "store-a",
  tenantId: "tenant-a",
  todayStart: new Date("2026-10-30T00:00:00Z"),
}
const orders = [
  {
    store: "store-a",
    tenant: "tenant-a",
    actor: "a",
    at: "2026-10-30T00:00:00Z",
    total: 100,
    status: "CONFIRMED",
  },
  {
    store: "store-a",
    tenant: "tenant-a",
    actor: "a",
    at: "2026-10-29T23:59:59.999Z",
    total: 200,
    status: "DRAFT",
  },
  {
    store: "store-a",
    tenant: "tenant-a",
    actor: "b",
    at: "2026-10-30T12:00:00Z",
    total: -50,
    status: "REFUNDED",
  },
  {
    store: "store-a",
    tenant: "tenant-a",
    actor: "b",
    at: "2026-10-01T00:00:00Z",
    total: 300,
    status: "CANCELLED",
  },
  {
    store: "store-a",
    tenant: "tenant-a",
    actor: "a",
    at: "2026-09-30T23:59:59.999Z",
    total: 400,
    status: "CONFIRMED",
  },
  {
    store: "store-a",
    tenant: "tenant-a",
    actor: "a",
    at: "2026-11-01T00:00:00Z",
    total: 500,
    status: "CONFIRMED",
  },
  {
    store: "store-a",
    tenant: "tenant-a",
    actor: "a",
    at: "2026-10-30T01:00:00Z",
    total: 2000000000,
    status: "CONFIRMED",
  },
  {
    store: "store-a",
    tenant: "tenant-a",
    actor: "b",
    at: "2026-10-30T02:00:00Z",
    total: 2000000000,
    status: "CONFIRMED",
  },
  {
    store: "store-b",
    tenant: "tenant-a",
    actor: "a",
    at: "2026-10-30T00:00:00Z",
    total: 9999,
    status: "CONFIRMED",
  },
  {
    store: "store-a",
    tenant: "tenant-b",
    actor: "a",
    at: "2026-10-30T00:00:00Z",
    total: 9999,
    status: "CONFIRMED",
  },
]
const memory = await PGlite.create()
await memory.exec(`
  CREATE TABLE "CommercialOrder" ("tenantId" text, "storeId" text, "createdByUserId" text, "createdAt" timestamp, "totalMinor" integer, status text);
`)
for (const row of orders)
  await memory.query(
    'INSERT INTO "CommercialOrder" VALUES($1,$2,$3,$4,$5,$6)',
    [row.tenant, row.store, row.actor, row.at, row.total, row.status],
  )
afterAll(() => memory.close())

const NOT_SALES = ["DRAFT", "CANCELLED"]

function expected(params: OverviewInput) {
  const own = orders.filter(
    (row) =>
      row.tenant === params.tenantId &&
      row.store === params.storeId &&
      !NOT_SALES.includes(row.status) &&
      (params.createdByUserId === undefined ||
        row.actor === params.createdByUserId),
  )
  const today = own.filter((row) => new Date(row.at) >= params.todayStart)
  const month = own.filter((row) => new Date(row.at) >= params.monthStart)
  return {
    salesTodayMinor: today.reduce((total, row) => total + row.total, 0),
    ordersToday: today.length,
    salesThisMonthMinor: month.reduce((total, row) => total + row.total, 0),
    ordersThisMonth: month.length,
  }
}

function reader() {
  const calls: string[] = []
  const db = {
    $queryRaw: async (query: Prisma.Sql) => {
      calls.push("summary")
      return (await memory.query(query.text, query.values)).rows
    },
  }
  // Inert Prisma boundary: the raw port executes the real parameterized SQL
  // in disposable Postgres.
  return { calls, db: db as unknown as DbClient }
}

test("Overview numbers are one statement", async () => {
  const { calls, db } = reader()
  expect(await getDashboardOverviewMetrics(db, input)).toEqual(expected(input))
  expect(calls).toHaveLength(1)
})

test("creator scopes keep each person's own numbers and date boundaries", async () => {
  for (const actor of [undefined, "a", "b", "absent", "", "a' OR true --"]) {
    const params = { ...input, createdByUserId: actor }
    const { db, calls } = reader()
    expect(await getDashboardOverviewMetrics(db, params)).toEqual(
      expected(params),
    )
    expect(calls).toHaveLength(1)
  }
})

test("drafts and cancelled orders are not sales", async () => {
  const { db } = reader()
  const result = await getDashboardOverviewMetrics(db, input)
  // From the 30th: 100, a -50 refund, two large orders and a later 500.
  expect(result.ordersToday).toBe(5)
  expect(result.salesTodayMinor).toBe(100 - 50 + 4000000000 + 500)
  // The cancelled 300 on the 1st is left out of the month.
  expect(result.ordersThisMonth).toBe(5)
})

test("empty and foreign Store/Tenant scope returns no foreign money", async () => {
  for (const scope of [
    { storeId: "missing", tenantId: "tenant-a" },
    { storeId: "store-a", tenantId: "tenant-b" },
    { storeId: "store-a' OR true --", tenantId: "tenant-a" },
  ]) {
    const params = { ...input, ...scope }
    const { db } = reader()
    expect(await getDashboardOverviewMetrics(db, params)).toEqual(
      expected(params),
    )
  }
})

test("independent date lower bounds and integer sums remain exact", async () => {
  for (const dates of [
    { todayStart: new Date("2026-09-01"), monthStart: new Date("2026-10-30") },
    { todayStart: new Date("2026-11-02"), monthStart: new Date("2026-11-02") },
  ]) {
    const params = { ...input, ...dates }
    const { db } = reader()
    expect(await getDashboardOverviewMetrics(db, params)).toEqual(
      expected(params),
    )
  }
})

test("a failed or absent current projection propagates instead of reusing numbers", async () => {
  const { db } = reader()
  Object.assign(db, {
    $queryRaw: async () => {
      throw Error("current read failed")
    },
  })
  await expect(getDashboardOverviewMetrics(db, input)).rejects.toThrow(
    "current read failed",
  )
  Object.assign(db, { $queryRaw: async () => [] })
  await expect(getDashboardOverviewMetrics(db, input)).rejects.toThrow(
    "Overview numbers are unavailable",
  )
})

test("each call reads a current snapshot without a retained summary", async () => {
  const { db, calls } = reader()
  const before = await getDashboardOverviewMetrics(db, input)
  const where = '"tenantId"=$1 AND "storeId"=$2 AND "totalMinor"=100'
  try {
    await memory.query(
      `UPDATE "CommercialOrder" SET "totalMinor"=101 WHERE ${where}`,
      [input.tenantId, input.storeId],
    )
    expect((await getDashboardOverviewMetrics(db, input)).salesTodayMinor).toBe(
      before.salesTodayMinor + 1,
    )
    expect(calls).toHaveLength(2)
  } finally {
    await memory.query(
      'UPDATE "CommercialOrder" SET "totalMinor"=100 WHERE "totalMinor"=101',
      [],
    )
  }
})
