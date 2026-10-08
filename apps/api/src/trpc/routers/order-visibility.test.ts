import { describe, expect, test } from "bun:test"
import { type TRPCContext, createCallerFactory } from "../init"
import { customersRouter } from "./customers"
import { ordersRouter } from "./orders"
import { searchRouter } from "./search"
import { storesRouter } from "./stores"

function fixture(role: string, visibility = "OWN_SALES") {
  type CaptureArgs = {
    where: Record<string, unknown> & { order: { is: unknown } }
  }
  const reads: Array<{ table: string; args: CaptureArgs }> = []
  const sql: Array<{ sql: string; values: unknown[] }> = []
  let setting = {
    id: "store-a",
    name: "A",
    salesRepOrderVisibility: visibility,
    salesRepOrderVisibilityReviewedAt: null as Date | null,
  }
  const read = (table: string, result: unknown) => async (args: unknown) => {
    reads.push({ table, args: args as CaptureArgs })
    return result
  }
  const db = {
    store: {
      findFirst: async (args: CaptureArgs) => {
        reads.push({ table: "store", args })
        return {
          ...setting,
          salesRepOrderVisibility:
            args.where.id === "store-b"
              ? "ALL_STORE_ORDERS"
              : setting.salesRepOrderVisibility,
        }
      },
      updateMany: async ({ data }: { data: Partial<typeof setting> }) => {
        setting = { ...setting, ...data }
        return { count: 1 }
      },
    },
    commercialOrder: {
      findMany: read("orders", []),
      findFirst: read("get", null),
      count: read("count", 0),
      aggregate: read("summary", {
        _count: { _all: 0 },
        _sum: { totalMinor: null },
      }),
    },
    membership: { findMany: read("memberships", []) },
    retailOpsStaffProfile: { findMany: read("staff", []) },
    commercialOrderPayment: { findMany: read("payments", []) },
    customer: {
      findMany: read("customers", []),
      findFirst: read("customer", { id: "customer-a", name: "Halima" }),
    },
    catalogItem: { findMany: read("catalog", []) },
    serviceJob: { findMany: read("jobs", []) },
    user: { findMany: read("actors", []) },
    $queryRaw: async (query: unknown) => {
      sql.push(query as { sql: string; values: unknown[] })
      return []
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  }
  const ctx = {
    db,
    requestId: "visibility-test",
    session: {
      session: { id: "session", token: "test" },
      user: { id: "rep-a" },
    },
    tenantContext: {
      tenant: {
        id: "tenant-a",
        currencyCode: "NGN",
        retailOpsPlanId: "growth",
        qaPurgeStartedAt: null,
      },
      membership: { id: "membership", role },
      activeStore: { id: "store-a" },
      stores: [{ id: "store-a" }, { id: "store-b" }],
    },
  }
  return {
    ctx: ctx as unknown as TRPCContext,
    db,
    reads,
    sql,
    setting: () => setting,
  }
}

describe("order visibility API boundaries", () => {
  for (const role of ["CASHIER", "OPERATOR", "OWNER", "ADMIN", "MANAGER"]) {
    for (const visibility of ["OWN_SALES", "ALL_STORE_ORDERS"]) {
      test(`${role} / ${visibility}: lists, report, payments, customer count and SQL totals`, async () => {
        const f = fixture(role, visibility)
        const caller = createCallerFactory(ordersRouter)(f.ctx)
        await caller.list({})
        await caller.listPage({})
        await caller.reportSummary({})
        await caller.payments({})
        await caller.customerCount()
        const rep = role === "CASHIER" || role === "OPERATOR"
        const creator = rep && visibility === "OWN_SALES" ? "rep-a" : undefined
        for (const read of f.reads.filter((read) =>
          ["orders", "summary", "count"].includes(read.table),
        )) {
          expect(read.args.where.tenantId).toBe("tenant-a")
          expect(read.args.where.createdByUserId).toBe(creator)
          expect(read.args.where.storeId).toBe(rep ? "store-a" : undefined)
        }
        expect(
          f.reads.find((read) => read.table === "payments")?.args.where.order
            .is,
        ).toEqual({
          tenantId: "tenant-a",
          storeId: rep ? "store-a" : undefined,
          createdByUserId: creator,
        })
        const totals = f.sql[0]
        expect(totals.sql.includes('orders."createdByUserId"')).toBe(
          Boolean(creator),
        )
        expect(totals.sql.includes('orders."storeId"')).toBe(rep)
        if (creator) expect(totals.values).toContain(creator)
      })

      test(`${role} / ${visibility}: search snapshots, exact lookup and customer history`, async () => {
        const f = fixture(role, visibility)
        await createCallerFactory(searchRouter)(f.ctx).global({
          query: "ORD-123",
        })
        const rep = ["CASHIER", "OPERATOR"].includes(role)
        const creator = rep && visibility === "OWN_SALES" ? "rep-a" : undefined
        const orderReads = f.reads.filter((read) => read.table === "orders")
        expect(orderReads[0]?.args.where.createdByUserId).toBe(creator)
        expect(orderReads[1]?.args.where.storeId).toBe(
          rep ? "store-a" : undefined,
        )
        expect(orderReads[1]?.args.where.AND).toEqual(
          creator
            ? [
                {
                  OR: [
                    { createdByUserId: creator },
                    { orderNumber: { equals: "ORD-123", mode: "insensitive" } },
                  ],
                },
              ]
            : undefined,
        )
        expect(
          f.reads.find((read) => read.table === "jobs")?.args.where.AND,
        ).toEqual(
          creator
            ? [{ commercialOrder: { is: { createdByUserId: creator } } }]
            : undefined,
        )
        f.reads.length = 0
        const customer = await createCallerFactory(customersRouter)(
          f.ctx,
        ).getById({ customerId: "customer-a" })
        expect(customer.orders).toEqual([])
        const history = f.reads.find((read) => read.table === "orders")?.args
          .where
        expect(history.storeId).toBe("store-a")
        expect(JSON.stringify(history)).toContain("customer-a")
        expect(
          JSON.stringify(history).includes('"createdByUserId":"rep-a"'),
        ).toBe(Boolean(creator))
      })
    }
  }

  test("lookup exceptions never call a count, aggregate or return totals", async () => {
    const f = fixture("CASHIER")
    const caller = createCallerFactory(ordersRouter)(f.ctx)
    expect(await caller.lookupOpen({ orderNumber: "ORD-123" })).toEqual([])
    expect(await caller.lookupOpen({ customerId: "customer-a" })).toEqual([])
    expect(await caller.lookupOpen({ phone: "+234 800" })).toEqual([])
    expect(
      f.reads
        .filter((read) => read.table === "orders")
        .every((read) => read.args.where.storeId === "store-a"),
    ).toBe(true)
    const exact = f.reads.find((read) => read.table === "orders")?.args.where
    expect(exact?.AND).toHaveLength(1)
    expect(
      f.reads.some((read) =>
        ["count", "summary", "payments"].includes(read.table),
      ),
    ).toBe(false)
    expect(f.sql).toHaveLength(0)
    await expect(caller.lookupOpen({})).rejects.toMatchObject({
      code: "BAD_REQUEST",
    })
    await expect(
      caller.lookupOpen({ phone: "123", customerId: "customer-a" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  test("store settings are independent; forged scopes and creator filters fail", async () => {
    const f = fixture("OPERATOR")
    const caller = createCallerFactory(ordersRouter)(f.ctx)
    await caller.list({ storeId: "store-b" })
    expect(f.reads.find((read) => read.table === "orders")?.args.where).toEqual(
      { tenantId: "tenant-a", storeId: "store-b", createdByUserId: undefined },
    )
    await expect(
      caller.list({ storeId: "foreign-store" }),
    ).rejects.toBeDefined()
    await expect(
      caller.list({ createdByUserId: "other" } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      caller.listPage({ tenantId: "foreign" } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  })

  test("Store / Mine is enforced on the server", async () => {
    const f = fixture("CASHIER", "ALL_STORE_ORDERS")
    await createCallerFactory(ordersRouter)(f.ctx).listPage({ mine: true })
    expect(
      f.reads.find((read) => read.table === "orders")?.args.where
        .createdByUserId,
    ).toBe("rep-a")
  })

  test("batch receipts refuse another rep's orders before rendering", async () => {
    const f = fixture("CASHIER")
    // Use the paid plan id recognized by the receipt feature gate.
    if (f.ctx.tenantContext) f.ctx.tenantContext.tenant.retailOpsPlanId = "pro"
    await expect(
      createCallerFactory(ordersRouter)(f.ctx).prepareReceipts({
        orderIds: ["own", "other"],
      }),
    ).rejects.toBeDefined()
    const read = f.reads.find((read) => read.table === "orders")
    expect(read?.args.where).toMatchObject({
      tenantId: "tenant-a",
      storeId: "store-a",
      createdByUserId: "rep-a",
    })
  })
})

test("only Owner/Admin can update; either choice or Keep records shared review", async () => {
  for (const role of ["CASHIER", "OPERATOR", "MANAGER", "SUPPORT", "MEMBER"]) {
    const f = fixture(role)
    await expect(
      createCallerFactory(storesRouter)(f.ctx).updateOrderVisibility({
        visibility: "ALL_STORE_ORDERS",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.setting().salesRepOrderVisibilityReviewedAt).toBeNull()
  }
  for (const role of ["OWNER", "ADMIN"]) {
    const f = fixture(role, "ALL_STORE_ORDERS")
    const caller = createCallerFactory(storesRouter)(f.ctx)
    const reviewed = await caller.updateOrderVisibility({})
    expect(reviewed.salesRepOrderVisibility).toBe("ALL_STORE_ORDERS")
    expect(reviewed.salesRepOrderVisibilityReviewedAt).toBeInstanceOf(Date)
    const changed = await caller.updateOrderVisibility({
      visibility: "OWN_SALES",
    })
    expect(changed).toMatchObject({
      salesRepOrderVisibility: "OWN_SALES",
      salesRepOrderVisibilityUpdatedByUserId: "rep-a",
    })
    expect(
      (await caller.orderVisibility({})).salesRepOrderVisibilityReviewedAt,
    ).toBeInstanceOf(Date)
    await expect(
      caller.updateOrderVisibility({ storeId: "foreign" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  }
})
