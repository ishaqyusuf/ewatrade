import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import {
  getStaffDirectoryMember,
  listStaffDirectoryPage,
  staffDirectoryMemberInput,
  staffDirectoryPageInput,
} from "./staff-directory"

const scope = { tenantId: "tenant-a", actorUserId: "owner-a" }
function member(id: string, email: string, profile = true) {
  return {
    id,
    tenantId: scope.tenantId,
    userId: `user-${id}`,
    role: "CASHIER",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-10-12T00:00:00Z"),
    invitedAt: null,
    acceptedAt: null,
    user: { id: `user-${id}`, name: "Amina", displayName: null, email },
    retailOpsStaffProfile: profile
      ? { tenantId: scope.tenantId, userId: `user-${id}`, displayName: "Amina" }
      : null,
    acceptanceToken: "secret-token",
    metadata: { private: "secret-profile" },
  }
}
function database(
  options: {
    role?: string
    mode?: string
    authorized?: boolean
    storeExists?: boolean
    rows?: ReturnType<typeof member>[]
    total?: number
    detail?: ReturnType<typeof member> | null
  } = {},
) {
  const calls: Array<{ method: string; args: any }> = []
  const tx = {
    membership: {
      findFirst: async (args: any) => {
        calls.push({ method: "findFirst", args })
        return args.where.userId
          ? options.authorized === false
            ? null
            : {
                role: options.role ?? "OWNER",
                staffAccessMode: options.mode ?? "LEGACY",
              }
          : (options.detail ?? null)
      },
      findMany: async (args: any) => {
        calls.push({ method: "findMany", args })
        return options.rows ?? []
      },
      count: async (args: any) => {
        calls.push({ method: "count", args })
        return options.total ?? 0
      },
    },
    store: {
      findFirst: async (args: any) => {
        calls.push({ method: "store", args })
        return options.storeExists === false ? null : { id: "store-a" }
      },
    },
  }
  const db = {
    $transaction: async (
      operation: (client: typeof tx) => unknown,
      config: unknown,
    ) => {
      calls.push({ method: "transaction", args: config })
      return operation(tx)
    },
  } as unknown as PrismaClient
  return { db, calls }
}
test("same-name directory uses an exact unbounded total and filter-bound keyset pages", async () => {
  const first = database({
    rows: [
      member("a", "amina.a@example.test"),
      member("b", "amina.b@example.test"),
    ],
    total: 2,
  })
  const input = {
    ...scope,
    search: "Amina",
    status: "ACTIVE" as const,
    limit: 1,
  }
  const page = await listStaffDirectoryPage(first.db, input)
  expect(page.data.map((m) => m.email)).toEqual(["amina.a@example.test"])
  expect(page.total).toBe(2)
  expect(page.nextCursor).not.toBeNull()
  expect(page.scope).toBe("tenant_memberships")
  expect(page.coverage.history).toBe("not_read")
  const list = first.calls.find((c) => c.method === "findMany")!.args
  const count = first.calls.find((c) => c.method === "count")!.args
  expect(list.take).toBe(2)
  expect(list.orderBy).toEqual({ id: "asc" })
  expect(count).toEqual({ where: list.where })
  expect(count.where.tenantId).toBe(scope.tenantId)
  expect(count.where.status).toBe("ACTIVE")
  expect(count.where.OR).toHaveLength(4)
  expect(count.where.OR[3].retailOpsStaffProfile.tenantId).toBe(scope.tenantId)
  const second = database({
    rows: [member("b", "amina.b@example.test")],
    total: 2,
  })
  const next = await listStaffDirectoryPage(second.db, {
    ...input,
    cursor: page.nextCursor!,
  })
  expect(next.data[0]!.membershipId).toBe("b")
  expect(next.nextCursor).toBeNull()
  expect(
    second.calls.find((c) => c.method === "findMany")!.args.where.AND[1],
  ).toEqual({ id: { gt: "a" } })
  expect(second.calls.find((c) => c.method === "count")!.args.where).toEqual(
    count.where,
  )
  for (const change of [
    { search: "Other" },
    { status: "SUSPENDED" as const },
    { tenantId: "tenant-b" },
    { assignmentStoreId: "store-b" },
  ])
    await expect(
      listStaffDirectoryPage(second.db, {
        ...input,
        ...change,
        cursor: page.nextCursor!,
      }),
    ).rejects.toThrow("original staff directory filters")
  await expect(
    listStaffDirectoryPage(second.db, { ...input, cursor: "invalid" }),
  ).rejects.toThrow("original staff directory filters")
})
test("fresh revoked/unauthorized/scoped managers are refused before target reads", async () => {
  for (const options of [
    { authorized: false },
    { role: "CASHIER" },
    { role: "OPERATOR" },
    { role: "MANAGER", mode: "SCOPED" },
  ]) {
    const { db, calls } = database(options)
    await expect(
      listStaffDirectoryPage(db, { ...scope, limit: 10 }),
    ).rejects.toThrow("staff-management access")
    expect(calls.map((c) => c.method)).toEqual(["transaction", "findFirst"])
    expect(calls[1]!.args.where).toEqual({
      tenantId: scope.tenantId,
      userId: scope.actorUserId,
      status: "ACTIVE",
      tenant: { isActive: true },
    })
  }
  for (const role of ["OWNER", "ADMIN", "MANAGER"]) {
    const { db, calls } = database({ role })
    await listStaffDirectoryPage(db, { ...scope, limit: 10 })
    expect(calls[0]!.args).toEqual({
      isolationLevel: "RepeatableRead",
      maxWait: 10000,
      timeout: 30000,
    })
    expect(calls.some((c) => c.method === "count")).toBe(true)
  }
})
test("Store filter means explicit active saved assignments and rejects a foreign Store", async () => {
  const { db, calls } = database()
  const page = await listStaffDirectoryPage(db, {
    ...scope,
    assignmentStoreId: "store-a",
    limit: 10,
  })
  expect(page.scope).toBe("active_store_assignments")
  expect(calls.find((c) => c.method === "store")!.args.where).toEqual({
    id: "store-a",
    tenantId: scope.tenantId,
    status: "ACTIVE",
  })
  expect(
    calls.find((c) => c.method === "count")!.args.where.staffStoreAssignments,
  ).toEqual({
    some: { tenantId: scope.tenantId, storeId: "store-a", status: "ACTIVE" },
  })
  const foreign = database({ storeExists: false })
  await expect(
    listStaffDirectoryPage(foreign.db, {
      ...scope,
      assignmentStoreId: "store-b",
      limit: 10,
    }),
  ).rejects.toThrow("Store not found")
  expect(foreign.calls.some((c) => c.method === "findMany")).toBe(false)
})
test("exact detail keeps tenant boundary, no private fields and explicit missing legacy facts", async () => {
  const row = member("a", "amina@example.test", false)
  const { db, calls } = database({ detail: row })
  const detail = await getStaffDirectoryMember(db, {
    ...scope,
    membershipId: "a",
  })
  expect(calls.at(-1)!.args.where).toEqual({
    id: "a",
    tenantId: scope.tenantId,
  })
  expect(detail.profileCoverage).toBe("unavailable")
  expect(detail.acceptedAt).toBeNull()
  expect(detail.historyCoverage).toBe("not_read")
  expect(JSON.stringify(detail)).not.toContain("secret")
  await expect(
    getStaffDirectoryMember(database().db, {
      ...scope,
      membershipId: "foreign",
    }),
  ).rejects.toThrow("Staff membership not found")
  const foreignProfile = member("a", "amina@example.test")
  foreignProfile.retailOpsStaffProfile!.tenantId = "foreign"
  foreignProfile.retailOpsStaffProfile!.displayName = "Hidden foreign identity"
  const result = await getStaffDirectoryMember(
    database({ detail: foreignProfile }).db,
    { ...scope, membershipId: "a" },
  )
  expect(result.name).toBe("Amina")
  expect(result.profileCoverage).toBe("unavailable")
})
test("public read inputs reject actor/Tenant injection and invalid pagination", () => {
  for (const input of [
    { tenantId: "foreign" },
    { actorUserId: "owner" },
    { limit: 0 },
    { limit: 101 },
    { search: " " },
    { status: "all" },
  ])
    expect(staffDirectoryPageInput.safeParse(input).success).toBe(false)
  expect(
    staffDirectoryMemberInput.safeParse({
      membershipId: "a",
      tenantId: "foreign",
    }).success,
  ).toBe(false)
})
