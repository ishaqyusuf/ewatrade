import { afterAll, expect, test } from "bun:test"
import { PGlite } from "@electric-sql/pglite"
import type { Prisma } from "../../generated/prisma/client"
import { getDashboardOverviewMetrics } from "./dashboard-overview"
import type { DbClient } from "./types"

type OverviewInput = Parameters<typeof getDashboardOverviewMetrics>[1]
const input: OverviewInput = {
  availability: {
    hasOrders: true,
    hasCatalogItems: true,
    hasProductItems: true,
  },
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
  CREATE TABLE "CatalogItem" (id text, "tenantId" text, "systemRole" text);
  CREATE TABLE "SellableOffering" (id text, "catalogItemId" text);
  CREATE TABLE "StoreOfferingAvailability" ("offeringId" text, "storeId" text, "isAvailable" boolean);
  CREATE TABLE "StockBalanceSource" ("storeId" text);
  INSERT INTO "CatalogItem" VALUES ('one','tenant-a',null),('two','tenant-a',null),('system','tenant-a','SYSTEM'),('foreign','tenant-b',null),('elsewhere','tenant-a',null);
  INSERT INTO "SellableOffering" VALUES ('offer1','one'),('offer2','one'),('offer3','two'),('offer4','system'),('offer5','foreign'),('offer6','elsewhere');
  INSERT INTO "StoreOfferingAvailability" VALUES ('offer1','store-a',true),('offer1','store-a',true),('offer2','store-a',false),('offer3','store-a',false),('offer4','store-a',true),('offer5','store-a',true),('offer6','store-b',true);
  INSERT INTO "StockBalanceSource" VALUES ('store-a'),('store-a'),('store-b');
`)
for (const row of orders)
  await memory.query(
    'INSERT INTO "CommercialOrder" VALUES($1,$2,$3,$4,$5,$6)',
    [row.tenant, row.store, row.actor, row.at, row.total, row.status],
  )
afterAll(() => memory.close())

function expected(params: OverviewInput) {
  const own = orders.filter(
    (row) =>
      row.tenant === params.tenantId &&
      row.store === params.storeId &&
      (params.createdByUserId === undefined ||
        row.actor === params.createdByUserId),
  )
  return {
    revenueTodayMinor: params.availability.hasOrders
      ? own
          .filter((row) => new Date(row.at) >= params.todayStart)
          .reduce((total, row) => total + row.total, 0)
      : 0,
    ordersThisMonth: params.availability.hasOrders
      ? own.filter((row) => new Date(row.at) >= params.monthStart).length
      : 0,
    catalogItems:
      params.availability.hasCatalogItems && params.storeId === "store-a"
        ? params.tenantId === "tenant-a"
          ? 2
          : params.tenantId === "tenant-b"
            ? 1
            : 0
        : 0,
    stockBalances:
      params.availability.hasProductItems && params.storeId === "store-a"
        ? 2
        : 0,
  }
}

function reader(params: OverviewInput) {
  const calls: string[] = []
  const result = expected(params)
  const db = {
    commercialOrder: {
      aggregate: async () => {
        calls.push("revenue")
        return { _sum: { totalMinor: result.revenueTodayMinor } }
      },
      count: async () => {
        calls.push("orders")
        return result.ordersThisMonth
      },
    },
    catalogItem: {
      count: async () => {
        calls.push("catalog")
        return result.catalogItems
      },
    },
    stockBalanceSource: {
      count: async () => {
        calls.push("stock")
        return result.stockBalances
      },
    },
    $queryRaw: async (query: Prisma.Sql) => {
      calls.push("summary")
      return (await memory.query(query.text, query.values)).rows
    },
  }
  // Inert Prisma boundary: legacy ports measure the old acquisition fan-out;
  // the new raw port executes the real parameterized SQL in disposable Postgres.
  return { calls, db: db as unknown as DbClient }
}

test("Overview numbers use one database acquisition instead of four", async () => {
  const { calls, db } = reader(input)
  expect(await getDashboardOverviewMetrics(db, input)).toEqual(expected(input))
  expect(calls).toHaveLength(1)
})

test("all presence masks and creator scopes retain existing numbers and date boundaries", async () => {
  for (let mask = 0; mask < 8; mask++) {
    for (const actor of [undefined, "a", "b", "absent", "", "a' OR true --"]) {
      const params = {
        ...input,
        createdByUserId: actor,
        availability: {
          hasOrders: Boolean(mask & 1),
          hasCatalogItems: Boolean(mask & 2),
          hasProductItems: Boolean(mask & 4),
        },
      }
      const { db, calls } = reader(params)
      expect(await getDashboardOverviewMetrics(db, params)).toEqual(
        expected(params),
      )
      expect(calls).toHaveLength(mask ? 1 : 0)
    }
  }
})

test("empty and foreign Store/Tenant scope returns no foreign money or Catalog", async () => {
  for (const scope of [
    { storeId: "missing", tenantId: "tenant-a" },
    { storeId: "store-a", tenantId: "tenant-b" },
    { storeId: "store-a' OR true --", tenantId: "tenant-a" },
  ]) {
    const params = { ...input, ...scope }
    const { db } = reader(params)
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
    const { db } = reader(params)
    expect(await getDashboardOverviewMetrics(db, params)).toEqual(
      expected(params),
    )
  }
})

test("a failed or absent current projection propagates instead of reusing numbers", async () => {
  const { db } = reader(input)
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
  const { db, calls } = reader(input)
  const before = await getDashboardOverviewMetrics(db, input)
  const where = '"tenantId"=$1 AND "storeId"=$2 AND "totalMinor"=100'
  try {
    await memory.query(
      `UPDATE "CommercialOrder" SET "totalMinor"=101 WHERE ${where}`,
      [input.tenantId, input.storeId],
    )
    expect(
      (await getDashboardOverviewMetrics(db, input)).revenueTodayMinor,
    ).toBe(before.revenueTodayMinor + 1)
    expect(calls).toHaveLength(2)
  } finally {
    await memory.query(
      'UPDATE "CommercialOrder" SET "totalMinor"=100 WHERE "totalMinor"=101',
      [],
    )
  }
})
