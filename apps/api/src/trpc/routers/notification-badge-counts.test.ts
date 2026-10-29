import { expect, test } from "bun:test"
import { createCallerFactory, createTRPCRouter } from "../init"
import { businessBankingRouter } from "./business-banking"
import { storefrontRequestsRouter } from "./storefront-requests"

const router = createTRPCRouter({
  businessBanking: businessBankingRouter,
  storefrontRequests: storefrontRequestsRouter,
})
function fixture(
  options: {
    role?: string
    scoped?: boolean
    revoked?: boolean
    user?: boolean
    foreignQa?: boolean
    noStore?: boolean
    allOrders?: boolean
  } = {},
) {
  const calls: { model: string; input: unknown }[] = []
  const role = options.role ?? "OWNER"
  const store = options.noStore ? null : { id: "store" }
  const db = {
    manualPaymentReport: {
      findMany: async (input: unknown) => {
        calls.push({ model: "reports", input })
        return [{ id: "r" }]
      },
    },
    storefrontMerchantAlert: {
      count: async (input: unknown) => {
        calls.push({ model: "website", input })
        return 3
      },
    },
    store: {
      findFirst: async (input: unknown) => {
        calls.push({ model: "visibility", input })
        return {
          salesRepOrderVisibility: options.allOrders
            ? "ALL_STORE_ORDERS"
            : "OWN_SALES",
        }
      },
    },
    membership: {
      findFirst: async (input: unknown) => {
        calls.push({ model: "member", input })
        return {
          id: "membership",
          userId: "actor",
          status: "ACTIVE",
          role,
          staffAccessMode: "LEGACY",
          staffStoreAssignments: [],
        }
      },
    },
    manualPaymentAlertSetting: { findMany: async () => [] },
    manualPaymentLink: { findMany: async () => [] },
    paymentNotificationNotice: {
      count: async (input: unknown) => {
        calls.push({ model: "notices", input })
        return 2
      },
    },
  }
  const caller = createCallerFactory(router)({
    db,
    session:
      options.user === false
        ? null
        : { session: { id: "session", token: "inert" }, user: { id: "actor" } },
    tenantContext: {
      tenant: {
        id: "tenant",
        dataClassification: "LIVE",
        qaPurgeStartedAt: null,
      },
      membership: { id: "membership", role },
      activeStore: store,
      stores: store ? [store] : [],
      staffAccess: options.scoped
        ? {
            mode: "SCOPED",
            businessRole: role,
            status: "ACTIVE",
            catalogEditor: false,
            assignments: options.revoked
              ? []
              : [{ storeId: "store", role: "CASHIER", status: "ACTIVE" }],
          }
        : undefined,
    },
    qaSessionScope: options.foreignQa
      ? { tenantId: "foreign", membershipId: "membership", storeId: "store" }
      : null,
  } as never)
  return { caller, calls }
}

test("actual protected badge procedures derive authority and return numbers only", async () => {
  const f = fixture()
  expect(await f.caller.businessBanking.pendingReportCount()).toEqual({
    count: 1,
  })
  expect(await f.caller.businessBanking.notificationChangeCount()).toEqual({
    unreadCount: 2,
  })
  expect(await f.caller.storefrontRequests.notificationCount()).toEqual({
    unreadCount: 3,
  })
  expect(f.calls.find((c) => c.model === "reports")?.input).toMatchObject({
    where: { status: "SUBMITTED", link: { order: { tenantId: "tenant" } } },
    select: { id: true },
    take: 5,
  })
  expect(f.calls.find((c) => c.model === "website")?.input).toEqual({
    where: {
      tenantId: "tenant",
      storeId: { in: ["store"] },
      NOT: { readByUserIds: { has: "actor" } },
    },
  })
  expect(f.calls.find((c) => c.model === "member")?.input).toMatchObject({
    where: { tenantId: "tenant", userId: "actor", status: "ACTIVE" },
  })
})

test("scoped payment badge preserves fresh sales visibility and grants no website permission", async () => {
  const f = fixture({ role: "CASHIER", scoped: true })
  await f.caller.businessBanking.pendingReportCount()
  expect(f.calls.find((c) => c.model === "reports")?.input).toMatchObject({
    where: {
      link: {
        order: {
          tenantId: "tenant",
          storeId: "store",
          createdByUserId: "actor",
        },
      },
    },
  })
  await f.caller.businessBanking.notificationChangeCount()
  await expect(
    f.caller.storefrontRequests.notificationCount(),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  await expect(
    f.caller.storefrontRequests.notifications(),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  const all = fixture({ role: "CASHIER", scoped: true, allOrders: true })
  await all.caller.businessBanking.pendingReportCount()
  expect(all.calls.find((c) => c.model === "reports")?.input).toMatchObject({
    where: {
      link: {
        order: {
          tenantId: "tenant",
          storeId: "store",
        },
      },
    },
  })
  expect(
    all.calls.find((c) => c.model === "reports")?.input,
  ).not.toHaveProperty("where.link.order.createdByUserId")
})

test("missing identity, denied role, foreign QA and revoked Store cannot read badge facts", async () => {
  for (const [options, code] of [
    [{ user: false }, "UNAUTHORIZED"],
    [{ role: "MEMBER" }, "FORBIDDEN"],
    [{ foreignQa: true }, "FORBIDDEN"],
    [{ role: "CASHIER", scoped: true, revoked: true }, "FORBIDDEN"],
  ] as const) {
    const f = fixture(options)
    await expect(
      f.caller.businessBanking.pendingReportCount(),
    ).rejects.toMatchObject({ code })
    await expect(
      f.caller.businessBanking.notificationChangeCount(),
    ).rejects.toMatchObject({ code })
    await expect(
      f.caller.storefrontRequests.notificationCount(),
    ).rejects.toMatchObject({ code })
    expect(f.calls.filter((c) => c.model !== "member")).toEqual([])
  }
})

test("strict count inputs reject forged authority and website requires Store access", async () => {
  const f = fixture()
  const forged = {
    tenantId: "foreign",
    storeIds: ["foreign"],
    actorUserId: "foreign",
  } as never
  await expect(
    f.caller.businessBanking.pendingReportCount(forged),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    f.caller.businessBanking.notificationChangeCount(forged),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    f.caller.storefrontRequests.notificationCount(forged),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(f.calls).toEqual([])
  await expect(
    fixture({ noStore: true }).caller.storefrontRequests.notificationCount(),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
})
