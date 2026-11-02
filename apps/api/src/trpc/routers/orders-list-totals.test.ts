import { describe, expect, test } from "bun:test"
import { type TRPCContext, createCallerFactory } from "../init"
import { ordersRouter } from "./orders"

type Where = Record<string, unknown> & { AND?: Array<Record<string, unknown>> }

function fixture(role: string, visibility = "OWN_SALES") {
  const groupBys: Where[] = []
  const pages: Where[] = []
  const db = {
    store: {
      findFirst: async () => ({ salesRepOrderVisibility: visibility }),
    },
    commercialOrder: {
      fields: { totalMinor: "field:totalMinor" },
      groupBy: async ({ where }: { where: Where }) => {
        groupBys.push(where)
        return []
      },
      findMany: async ({ where }: { where: Where }) => {
        pages.push(where)
        return []
      },
      count: async () => 0,
    },
    user: { findMany: async () => [] },
    membership: { findMany: async () => [] },
    retailOpsStaffProfile: { findMany: async () => [] },
  }
  const ctx = {
    db,
    requestId: "list-totals-test",
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
    caller: createCallerFactory(ordersRouter)(ctx as unknown as TRPCContext),
    groupBys,
    pages,
  }
}

describe("Orders list totals", () => {
  for (const role of ["CASHIER", "OPERATOR", "OWNER", "MANAGER"]) {
    for (const visibility of ["OWN_SALES", "ALL_STORE_ORDERS"]) {
      test(`${role} / ${visibility}: totals keep the list's visibility scope`, async () => {
        const f = fixture(role, visibility)
        expect(await f.caller.listTotals({ query: "ada" })).toEqual({
          groups: [],
          orderCount: 0,
        })
        const rep = role === "CASHIER" || role === "OPERATOR"
        const creator = rep && visibility === "OWN_SALES" ? "rep-a" : undefined
        const [all, owing] = f.groupBys
        expect(all).toMatchObject({
          tenantId: "tenant-a",
          storeId: rep ? "store-a" : undefined,
          createdByUserId: creator,
        })
        expect(all?.OR).toBeArray()
        expect(owing?.AND?.[0]).toEqual(all as Where)
      })
    }
  }

  test("a rep's Mine view narrows to their own sales", async () => {
    const f = fixture("CASHIER", "ALL_STORE_ORDERS")
    await f.caller.listTotals({ mine: true })
    expect(f.groupBys[0]?.createdByUserId).toBe("rep-a")
  })

  test("payment status filters both the page and the totals", async () => {
    const f = fixture("OWNER")
    await f.caller.listPage({ paymentStatuses: ["PENDING", "FAILED"] })
    await f.caller.listTotals({ paymentStatuses: ["PENDING", "FAILED"] })
    expect(f.pages[0]?.paymentStatus).toEqual({ in: ["PENDING", "FAILED"] })
    expect(f.groupBys[0]?.paymentStatus).toEqual({
      in: ["PENDING", "FAILED"],
    })
  })

  test("denied roles, unknown Stores and forged scope read nothing", async () => {
    const denied = fixture("MEMBER")
    await expect(denied.caller.listTotals({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    const foreign = fixture("OWNER")
    await expect(
      foreign.caller.listTotals({ storeId: "store-z" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    for (const input of [
      { tenantId: "tenant-b" },
      { createdByUserId: "someone" },
      { paymentStatuses: ["SETTLED"] },
    ])
      await expect(
        foreign.caller.listTotals(input as never),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect([...denied.groupBys, ...foreign.groupBys]).toEqual([])
  })
})

describe("Received payment totals", () => {
  test("a rep's totals stay in their Store and own sales", async () => {
    const f = fixture("CASHIER")
    expect(
      await f.caller.paymentTotals({
        methods: ["cash"],
        recordedAfter: new Date("2026-11-02T00:00:00.000Z"),
        recordedBefore: new Date("2026-11-03T00:00:00.000Z"),
      }),
    ).toEqual({ currencyTotals: [], totalCount: 0 })
    expect(f.groupBys[0]).toEqual({
      tenantId: "tenant-a",
      storeId: "store-a",
      createdByUserId: "rep-a",
    })
  })

  test("bad windows, unknown methods, forged scope and denied roles are refused", async () => {
    const f = fixture("OWNER")
    for (const input of [
      {
        recordedAfter: new Date("2026-11-03T00:00:00.000Z"),
        recordedBefore: new Date("2026-11-02T00:00:00.000Z"),
      },
      { methods: ["customer_credit"] },
      { methods: [] },
      { tenantId: "tenant-b" },
      { createdByUserId: "someone" },
    ])
      await expect(
        f.caller.paymentTotals(input as never),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      fixture("MEMBER").caller.paymentTotals({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.groupBys).toEqual([])
  })
})
