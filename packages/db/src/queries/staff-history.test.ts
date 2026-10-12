import { expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  listStaffHistoryPage,
  projectStaffAccessSnapshot,
  staffHistoryPageInput,
} from "./staff-history"

const scope = { tenantId: "tenant-a", actorUserId: "owner-user" }
const t = new Date("2026-10-12T12:00:00.123Z")
function lifecycle(id: string, at = t, actorUserId = "owner-user") {
  return {
    id,
    tenantId: scope.tenantId,
    membershipId: "staff-m",
    staffUserId: "staff-u",
    actorUserId,
    type: "SUSPENDED",
    happenedAt: at,
    reason: "Recorded correction",
    fromRole: null,
    toRole: "CASHIER",
    fromStatus: "ACTIVE",
    toStatus: "SUSPENDED",
  }
}
function access(id: string, at = t) {
  return {
    id,
    tenantId: scope.tenantId,
    membershipId: "staff-m",
    actorUserId: "owner-user",
    createdAt: at,
    operation: "access_changed",
    revision: 2,
    before: {
      mode: "SCOPED",
      assignments: [
        { storeId: "store-a", role: "CASHIER", status: "ACTIVE" },
        { storeId: "foreign-store", role: "MANAGER" },
      ],
      secret: "private-secret",
    },
    after: {
      mode: "SCOPED",
      assignments: [],
      catalogEditor: false,
      token: "private-secret",
    },
  }
}
function matches(where: any, row: any): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true
    if (key === "AND")
      return (value as any[]).every((item) => matches(item, row))
    if (key === "OR") return (value as any[]).some((item) => matches(item, row))
    const actual = row[key]
    if (value instanceof Date)
      return actual instanceof Date && actual.getTime() === value.getTime()
    if (value && typeof value === "object")
      return Object.entries(value).every(([op, expected]: [string, any]) =>
        op === "lt"
          ? actual < expected
          : op === "lte"
            ? actual <= expected
            : op === "gte"
              ? actual >= expected
              : op === "notIn"
                ? !expected.includes(actual)
                : true,
      )
    return actual === value
  })
}
function database(
  options: {
    role?: string | null
    lifecycleAvailable?: boolean
    accessAvailable?: boolean
    lifecycle?: ReturnType<typeof lifecycle>[]
    access?: ReturnType<typeof access>[]
  } = {},
) {
  const calls: Array<{ method: string; args: any }> = []
  const members = [
    {
      id: "owner-m",
      userId: "owner-user",
      user: { name: "Owner", displayName: null, email: "owner@example.test" },
    },
    {
      id: "staff-m",
      userId: "staff-u",
      user: { name: "Amina", displayName: null, email: "amina@example.test" },
    },
  ]
  const events = (
    name: "lifecycle" | "access",
    field: "happenedAt" | "createdAt",
  ) => ({
    findMany: async (args: any) => {
      calls.push({ method: `${name}.findMany`, args })
      return [...(options[name] ?? [])]
        .filter((row) => matches(args.where, row))
        .sort((a: any, b: any) => b[field] - a[field] || (a.id > b.id ? -1 : 1))
        .slice(0, args.take)
    },
    count: async (args: any) => {
      calls.push({ method: `${name}.count`, args })
      return (options[name] ?? []).filter((row) => matches(args.where, row))
        .length
    },
  })
  const tx = {
    membership: {
      findFirst: async (args: any) => {
        calls.push({ method: "member.findFirst", args })
        return args.where.userId
          ? options.role === null
            ? null
            : { role: options.role ?? "OWNER" }
          : (members.find((m) => m.id === args.where.id) ?? null)
      },
      findMany: async (args: any) => {
        calls.push({ method: "member.findMany", args })
        return members
      },
    },
    store: {
      findFirst: async (args: any) => {
        calls.push({ method: "store.findFirst", args })
        return args.where.id === "store-a" ? { id: "store-a" } : null
      },
      findMany: async (args: any) => {
        calls.push({ method: "store.findMany", args })
        return [{ id: "store-a", name: "Bakery" }]
      },
    },
    retailOpsStaffProfile: {
      findMany: async (args: any) => {
        calls.push({ method: "profile.findMany", args })
        return []
      },
    },
    retailOpsStaffLifecycleEvent: events("lifecycle", "happenedAt"),
    staffAccessAuditEvent: events("access", "createdAt"),
    $queryRaw: async () => {
      calls.push({ method: "catalog", args: {} })
      return [
        {
          lifecycle: options.lifecycleAvailable !== false,
          access: options.accessAvailable !== false,
          profiles: true,
        },
      ]
    },
  }
  const db = {
    $transaction: async (
      operation: (client: Prisma.TransactionClient) => unknown,
      config: unknown,
    ) => {
      calls.push({ method: "transaction", args: config })
      return operation(tx as unknown as Prisma.TransactionClient)
    },
  } as unknown as PrismaClient
  return { db, calls }
}
test("combined history preserves ties across sources and exact counts over cursor pages", async () => {
  const { db, calls } = database({
    lifecycle: [lifecycle("lc-a"), lifecycle("lc-z")],
    access: [
      access("ac-z"),
      access("ac-old", new Date("2026-10-11T00:00:00Z")),
    ],
  })
  const first = await listStaffHistoryPage(db, { ...scope, limit: 2 })
  expect(first.data.map((e) => e.id)).toEqual(["lc-z", "lc-a"])
  expect(first.total).toBe(4)
  expect(first.coverage.history).toBe("partial")
  expect(first.nextCursor).not.toBeNull()
  const second = await listStaffHistoryPage(db, {
    ...scope,
    limit: 2,
    cursor: first.nextCursor!,
  })
  expect(second.data.map((e) => e.id)).toEqual(["ac-z", "ac-old"])
  expect(second.total).toBe(4)
  expect(second.nextCursor).toBeNull()
  expect(calls.find((c) => c.method === "transaction")!.args).toEqual({
    isolationLevel: "RepeatableRead",
    maxWait: 10000,
    timeout: 30000,
  })
  for (const change of [
    { tenantId: "foreign" },
    { membershipId: "staff-m" },
    { actorMembershipId: "owner-m" },
    { stream: "STORE_ACCESS" as const },
    { from: "2026-10-01T00:00:00Z" },
  ])
    await expect(
      listStaffHistoryPage(db, {
        ...scope,
        ...change,
        limit: 2,
        cursor: first.nextCursor!,
      }),
    ).rejects.toThrow("original staff history filters")
})
test("history redacts unavailable actor identity and foreign Store references, and strips private snapshots", async () => {
  const { db, calls } = database({
    lifecycle: [lifecycle("lc", t, "foreign-actor")],
    access: [access("ac")],
  })
  const page = await listStaffHistoryPage(db, { ...scope, limit: 10 })
  expect(page.data[0]!.actor.coverage).toBe("unavailable")
  expect(page.data[0]!.actor.userId).toBeNull()
  expect(page.coverage.identities).toBe("partial")
  const saved = JSON.stringify(page)
  expect(saved).not.toContain("foreign-actor")
  expect(saved).not.toContain("foreign-store")
  expect(saved).not.toContain("private-secret")
  expect(page.data[1]!.before).toMatchObject({
    coverage: "partial",
    hiddenStoreReferences: 1,
    assignments: [{ storeId: "store-a", role: "CASHIER" }],
  })
  for (const call of calls.filter((c) =>
    ["member.findMany", "profile.findMany", "store.findMany"].includes(
      c.method,
    ),
  ))
    expect(call.args.where.tenantId).toBe(scope.tenantId)
})
test("missing streams leave total unknown, not zero, and do not query absent tables", async () => {
  const { db, calls } = database({
    lifecycleAvailable: false,
    access: [access("ac")],
  })
  const page = await listStaffHistoryPage(db, { ...scope, limit: 10 })
  expect(page.total).toBeNull()
  expect(page.knownMatchingEvents).toBe(1)
  expect(page.coverage.lifecycle).toBe("unavailable")
  expect(calls.some((c) => c.method.startsWith("lifecycle."))).toBe(false)
  const absent = await listStaffHistoryPage(
    database({ lifecycleAvailable: false, accessAvailable: false }).db,
    { ...scope, limit: 10 },
  )
  expect(absent.total).toBeNull()
  expect(absent.data).toEqual([])
})
test("Store history filters recorded before/after and never infers membership event Store attribution", async () => {
  const { db, calls } = database({
    lifecycle: [lifecycle("lc")],
    access: [access("ac")],
  })
  const page = await listStaffHistoryPage(db, {
    ...scope,
    storeId: "store-a",
    limit: 10,
  })
  expect(page.scope).toBe("recorded_store_access")
  expect(page.coverage.lifecycle).toBe("not_requested")
  expect(calls.some((c) => c.method.startsWith("lifecycle."))).toBe(false)
  const where = calls.find((c) => c.method === "access.count")!.args.where
  expect(where.tenantId).toBe(scope.tenantId)
  expect(where.OR).toHaveLength(4)
  expect(where.OR[0]).toEqual({
    before: { path: ["assignments"], array_contains: [{ storeId: "store-a" }] },
  })
  await expect(
    listStaffHistoryPage(db, { ...scope, storeId: "foreign", limit: 10 }),
  ).rejects.toThrow("Historical Store not found")
})
test("date bounds are inclusive/exclusive and actor/subject identities are Tenant checked", async () => {
  const { db, calls } = database({ lifecycle: [lifecycle("lc")] })
  await listStaffHistoryPage(db, {
    ...scope,
    membershipId: "staff-m",
    actorMembershipId: "owner-m",
    eventType: "SUSPENDED",
    from: "2026-10-01T00:00:00Z",
    to: "2026-11-01T00:00:00Z",
    limit: 10,
  })
  const where = calls.find((c) => c.method === "lifecycle.count")!.args.where
  expect(where.OR).toEqual([
    { membershipId: "staff-m" },
    { membershipId: null, staffUserId: "staff-u" },
  ])
  expect(where.actorUserId).toBe("owner-user")
  expect(where.type).toBe("SUSPENDED")
  expect(where.happenedAt).toEqual({
    gte: new Date("2026-10-01T00:00:00Z"),
    lt: new Date("2026-11-01T00:00:00Z"),
  })
  for (const change of [
    { membershipId: "foreign" },
    { actorMembershipId: "foreign" },
  ])
    await expect(
      listStaffHistoryPage(db, { ...scope, ...change, limit: 10 }),
    ).rejects.toThrow("Staff membership not found")
})
test("fresh non-admin/revoked actor denies before history/catalog reads", async () => {
  for (const role of [null, "MANAGER", "CASHIER", "OPERATOR"]) {
    const { db, calls } = database({ role })
    await expect(
      listStaffHistoryPage(db, { ...scope, limit: 10 }),
    ).rejects.toThrow("Owner/Admin authority")
    expect(calls.map((c) => c.method)).toEqual([
      "transaction",
      "member.findFirst",
    ])
    expect(calls[1]!.args.where.status).toBe("ACTIVE")
  }
})
test("strict history input and snapshot projection preserve unavailable fields", () => {
  for (const input of [
    { tenantId: "foreign" },
    { actorUserId: "owner" },
    { from: "2026-10-01" },
    { from: "2026-10-02T00:00:00Z", to: "2026-10-01T00:00:00Z" },
    { stream: "LIFECYCLE", eventType: "STORE_ACCESS_CHANGED" },
    { storeId: "store-a", eventType: "SUSPENDED" },
  ])
    expect(staffHistoryPageInput.safeParse(input).success).toBe(false)
  expect(projectStaffAccessSnapshot(null, new Map())).toEqual({
    coverage: "not_recorded",
  })
  expect(projectStaffAccessSnapshot({ token: "private" }, new Map())).toEqual({
    coverage: "unavailable",
  })
  expect(
    projectStaffAccessSnapshot({ mode: "SCOPED", assignments: [] }, new Map()),
  ).toMatchObject({
    businessRole: null,
    membershipStatus: null,
    catalogEditor: null,
    assignments: [],
  })
})
