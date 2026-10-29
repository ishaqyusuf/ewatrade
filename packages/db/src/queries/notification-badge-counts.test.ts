import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { countPendingManualPaymentReportBadge } from "./business-payment-links"
import {
  countPaymentNotificationChanges,
  listPaymentNotificationChanges,
} from "./payment-report-notifications/policy-changes"
import {
  countStorefrontNotifications,
  listStorefrontNotifications,
} from "./storefront-notifications"
import type { DbClient } from "./types"

const scope = { tenantId: "tenant", storeIds: ["store"], actorUserId: "actor" }

test("website badge uses the exact unread scope with one count and no preview graph", async () => {
  const calls: { operation: string; input: unknown }[] = []
  let unread = 7
  const db = {
    storefrontMerchantAlert: {
      count: async (input: unknown) => {
        calls.push({ operation: "count", input })
        return unread
      },
      findMany: async (input: unknown) => {
        calls.push({ operation: "preview", input })
        return []
      },
    },
  } as unknown as DbClient
  expect(await countStorefrontNotifications(db, scope)).toEqual({
    unreadCount: 7,
  })
  expect(calls).toEqual([
    {
      operation: "count",
      input: {
        where: {
          tenantId: "tenant",
          storeId: { in: ["store"] },
          NOT: { readByUserIds: { has: "actor" } },
        },
      },
    },
  ])
  unread = 0
  expect(await countStorefrontNotifications(db, scope)).toEqual({
    unreadCount: 0,
  })
  expect((await listStorefrontNotifications(db, scope)).unreadCount).toBe(0)
})

test("payment badge preserves its five-visible-claims cap using only five IDs", async () => {
  const calls: unknown[] = []
  let available = 9
  const orderScope: Prisma.CommercialOrderWhereInput = {
    tenantId: "tenant",
    storeId: { in: ["store"] },
    OR: [
      { createdByUserId: "actor" },
      { store: { salesRepOrderVisibility: "ALL_STORE_ORDERS" } },
    ],
  }
  const db = {
    manualPaymentReport: {
      findMany: async (input: { take: number }) => {
        calls.push(input)
        return Array.from(
          { length: Math.min(available, input.take) },
          (_, i) => ({
            id: `r${i}`,
            link: {
              currencyCode: "NGN",
              order: { id: "order", orderNumber: "1", storeId: "store" },
            },
          }),
        )
      },
    },
  } as unknown as PrismaClient
  expect(await countPendingManualPaymentReportBadge(db, orderScope)).toEqual({
    count: 5,
  })
  expect(calls).toEqual([
    {
      where: { status: "SUBMITTED", link: { order: orderScope } },
      select: { id: true },
      orderBy: { id: "desc" },
      take: 5,
    },
  ])
  available = 2
  expect(await countPendingManualPaymentReportBadge(db, orderScope)).toEqual({
    count: 2,
  })
  available = 0
  expect(await countPendingManualPaymentReportBadge(db, orderScope)).toEqual({
    count: 0,
  })
})

function notices() {
  const calls: { operation: string; input: unknown }[] = []
  let member: Record<string, unknown> | null = {
    id: "membership",
    userId: "actor",
    status: "ACTIVE",
    role: "OWNER",
    staffAccessMode: "LEGACY",
    staffStoreAssignments: [],
  }
  let count = 8
  const db = {
    membership: {
      findFirst: async (input: unknown) => {
        calls.push({ operation: "membership", input })
        return member
      },
    },
    manualPaymentAlertSetting: {
      findMany: async (input: unknown) => {
        calls.push({ operation: "settings", input })
        return [
          { accountId: "account", account: { bookId: "book" } },
          { accountId: "foreign", account: { bookId: "other" } },
        ]
      },
    },
    manualPaymentLink: {
      findMany: async (input: unknown) => {
        calls.push({ operation: "visible", input })
        return [{ bankAccountId: "account" }]
      },
    },
    paymentNotificationNotice: {
      findMany: async (input: unknown) => {
        calls.push({ operation: "preview", input })
        return []
      },
      count: async (input: unknown) => {
        calls.push({ operation: "count", input })
        return count
      },
    },
  } as unknown as DbClient
  return {
    db,
    calls,
    member: (value: typeof member) => {
      member = value
    },
    unread: (value: number) => {
      count = value
    },
  }
}

test("plan notice badge reuses current audience admission and unread predicate without fetching notices", async () => {
  const f = notices()
  expect(await countPaymentNotificationChanges(f.db, scope)).toEqual({
    unreadCount: 8,
  })
  expect(f.calls.map((c) => c.operation)).toEqual([
    "membership",
    "settings",
    "count",
  ])
  const count = f.calls.at(-1)
  expect(count?.input).toEqual({
    where: {
      tenantId: "tenant",
      accountIds: { hasSome: ["account", "foreign"] },
      reads: { none: { membershipId: "membership", tenantId: "tenant" } },
    },
  })
  f.calls.length = 0
  const full = await listPaymentNotificationChanges(f.db, scope)
  expect(full.unreadCount).toBe(8)
  expect(f.calls.find((c) => c.operation === "count")?.input).toEqual(
    count?.input,
  )
  f.unread(0)
  expect(await countPaymentNotificationChanges(f.db, scope)).toEqual({
    unreadCount: 0,
  })
})

test("scoped payment notice audience retains recipient, Store and creator visibility", async () => {
  const f = notices()
  f.member({
    id: "membership",
    userId: "actor",
    status: "ACTIVE",
    role: "CASHIER",
    staffAccessMode: "SCOPED",
    staffStoreAssignments: [{ storeId: "store", status: "ACTIVE" }],
  })
  await countPaymentNotificationChanges(f.db, scope)
  expect(
    f.calls.find((c) => c.operation === "membership")?.input,
  ).toMatchObject({
    where: {
      tenantId: "tenant",
      userId: "actor",
      status: "ACTIVE",
      tenant: { isActive: true },
    },
  })
  expect(f.calls.find((c) => c.operation === "settings")?.input).toMatchObject({
    where: {
      tenantId: "tenant",
      recipientUserIds: { has: "actor" },
      account: { archivedAt: null, book: { tenantId: "tenant" } },
    },
  })
  expect(f.calls.find((c) => c.operation === "visible")?.input).toMatchObject({
    where: {
      order: {
        tenantId: "tenant",
        storeId: { in: ["store"] },
        OR: [
          { createdByUserId: "actor" },
          { store: { salesRepOrderVisibility: "ALL_STORE_ORDERS" } },
        ],
      },
    },
  })
  expect(f.calls.at(-1)?.input).toMatchObject({
    where: {
      accountIds: { hasSome: ["account"] },
      reads: { none: { membershipId: "membership", tenantId: "tenant" } },
    },
  })
})

for (const member of [
  null,
  { status: "REVOKED", role: "OWNER" },
  { status: "ACTIVE", role: "VIEWER" },
  {
    status: "ACTIVE",
    role: "CASHIER",
    staffAccessMode: "SCOPED",
    staffStoreAssignments: [],
  },
]) {
  test(`plan notice count refuses current missing/revoked/unassigned audience ${JSON.stringify(member)}`, async () => {
    const f = notices()
    f.member(member)
    await expect(
      countPaymentNotificationChanges(f.db, scope),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.calls.map((c) => c.operation)).toEqual(["membership"])
  })
}

test("count read errors propagate without returning fabricated zero", async () => {
  const source = new Error("inert count failure")
  const db = {
    storefrontMerchantAlert: {
      count: async () => {
        throw source
      },
      findMany: async () => [],
    },
    manualPaymentReport: {
      findMany: async () => {
        throw source
      },
    },
  } as unknown as PrismaClient
  await expect(countStorefrontNotifications(db, scope)).rejects.toBe(source)
  await expect(
    countPendingManualPaymentReportBadge(db, { tenantId: "tenant" }),
  ).rejects.toBe(source)
})
