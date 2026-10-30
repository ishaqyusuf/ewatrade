import { beforeEach, expect, mock, test } from "bun:test"

function membership(slug: string, planId: string, mode = "LEGACY") {
  return {
    id: `member-${slug}`,
    tenantId: slug,
    role: mode === "SCOPED" ? "MANAGER" : "OWNER",
    status: "ACTIVE",
    staffAccessMode: mode,
    catalogEditor: false,
    retailOpsStaffProfile: { defaultStoreId: `${slug}-second` },
    staffStoreAssignments: [
      {
        tenantId: slug,
        storeId: `${slug}-second`,
        role: "CASHIER",
        status: "ACTIVE",
        revision: 1,
        store: { tenantId: slug, status: "ACTIVE" },
      },
      {
        tenantId: "foreign",
        storeId: `${slug}-first`,
        role: "MANAGER",
        status: "ACTIVE",
        revision: 1,
        store: { tenantId: slug, status: "ACTIVE" },
      },
    ],
    tenant: {
      id: slug,
      slug,
      name: slug,
      type: "RETAIL",
      enabledModes: ["RETAIL_OPS"],
      currencyCode: "NGN",
      timezone: "UTC",
      metadata: { retailOps: { subscription: { planId } } },
      subscription: null,
      stores: ["first", "second"].map((suffix) => ({
        id: `${slug}-${suffix}`,
        slug: suffix,
        name: suffix,
        status: "ACTIVE",
        currencyCode: "NGN",
        metadata: {},
      })),
    },
  }
}

let rows = [membership("oldest", "pro"), membership("chosen", "free")]
let requestHeaders = new Headers()
let requestCookies = new Map<string, string>()
let failJoin = false
const queries: unknown[] = []
mock.module("@ewatrade/db", () => ({
  prisma: {
    membership: {
      findMany: async (args: {
        select: { tenant: { select: { subscription?: unknown } } }
      }) => {
        queries.push(args)
        if (failJoin && args.select.tenant.select.subscription) {
          throw new Error("optional join unavailable")
        }
        return rows
      },
    },
  },
}))
mock.module("next/headers", () => ({
  headers: async () => requestHeaders,
  cookies: async () => ({
    get: (key: string) => {
      const value = requestCookies.get(key)
      return value === undefined ? undefined : { value }
    },
  }),
}))
const { getActiveTenant } = await import("./tenant")

beforeEach(() => {
  rows = [membership("oldest", "pro"), membership("chosen", "free")]
  requestHeaders = new Headers()
  requestCookies = new Map()
  failJoin = false
  queries.length = 0
})

test("actual Dashboard context consumes the chosen workspace's features and exposes no billing facts", async () => {
  requestCookies.set("ewatrade.active_tenant_slug", "chosen")
  const ctx = await getActiveTenant("actor")
  expect(ctx?.tenant.id).toBe("chosen")
  expect(ctx?.tenant.planFeatures).toEqual([])
  expect(ctx?.tenant).not.toHaveProperty("metadata")
  expect(ctx?.tenant).not.toHaveProperty("subscription")
  expect(ctx?.tenants).toEqual([
    { id: "oldest", name: "oldest", slug: "oldest", role: "OWNER" },
    { id: "chosen", name: "chosen", slug: "chosen", role: "OWNER" },
  ])
  expect(queries).toHaveLength(1)
  expect(queries[0]).toMatchObject({
    where: { userId: "actor", status: "ACTIVE", tenant: { isActive: true } },
  })
})

test("header workspace selection stays strict; a stale preference may fall back to the oldest choice", async () => {
  requestHeaders.set("x-tenant-slug", "missing")
  requestCookies.set("ewatrade.active_tenant_slug", "oldest")
  expect(await getActiveTenant("actor")).toBeNull()
  requestHeaders = new Headers()
  requestCookies.set("ewatrade.active_tenant_slug", "missing")
  expect((await getActiveTenant("actor"))?.tenant.id).toBe("oldest")
  requestHeaders.set("x-tenant-slug", "chosen")
  expect((await getActiveTenant("actor"))?.tenant.planFeatures).toEqual([])
})

test("joined plan facts do not change Store preference, scoped grants or effective role", async () => {
  rows = [membership("scoped", "pro", "SCOPED")]
  requestCookies.set("ewatrade.active_store_id", "scoped-first")
  const ctx = await getActiveTenant("actor")
  expect(ctx?.stores.map((store) => store.id)).toEqual(["scoped-second"])
  expect(ctx?.activeStore?.id).toBe("scoped-second")
  expect(ctx?.membership.role).toBe("CASHIER")
  expect(ctx?.membership.catalogEditor).toBe(false)
  expect(ctx?.storeSelectionNeedsRepair).toBe(true)
  expect(ctx?.tenant.planFeatures).toContain("finance")
})

test("optional join failure keeps admitted workspace and existing shell fallback ownership", async () => {
  failJoin = true
  const ctx = await getActiveTenant("actor")
  expect(ctx?.tenant.id).toBe("oldest")
  expect(ctx?.tenant.planFeatures).toBeUndefined()
  expect(ctx?.activeStore?.id).toBe("oldest-second")
  expect(queries).toHaveLength(2)
  expect(queries[1]).not.toHaveProperty("select.tenant.select.subscription")
})

test("current reads retain plan changes and absent membership remains unadmitted", async () => {
  expect((await getActiveTenant("actor"))?.tenant.planFeatures).toContain(
    "finance",
  )
  rows = [membership("oldest", "free")]
  expect((await getActiveTenant("actor"))?.tenant.planFeatures).toEqual([])
  rows = []
  expect(await getActiveTenant("actor")).toBeNull()
  expect(queries).toHaveLength(3)
})
