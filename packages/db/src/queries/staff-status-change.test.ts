import { describe, expect, test } from "bun:test"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  prepareReviewedStaffStatusChangeInTransaction,
  updateRetailOpsStaffStatus,
  updateRetailOpsStaffStatusInTransaction,
} from "./retail-ops-staff"
import {
  prepareStaffStatusChangeInTransaction,
  reviewStaffStatusChangeInTransaction,
  validateUnacceptedStaffRemoval,
} from "./staff-status-change"

const input = {
  actorUserId: "owner",
  tenantId: "business",
  staffUserId: "staff-user",
  status: "suspended" as const,
  expectedRevision: 7,
  reason: " Review staff access ",
}
function fixture(
  options: {
    role?: string
    status?: string
    accepted?: boolean
    revision?: number
    actorRole?: string
    actorStatus?: string
    actorMode?: string
    missing?: boolean
    assignments?: Array<{
      tenantId: string
      storeId: string
      role: string
      revision: number
    }>
    storeStatus?: string
    storeName?: string
    defaultStoreId?: string | null
    catalogEditor?: boolean
    used?: number
    failAudit?: boolean
  } = {},
) {
  const calls: Array<{ kind: string; input?: unknown }> = []
  const membership = {
    id: "member",
    userId: "staff-user",
    role: options.role ?? "CASHIER",
    status: options.status ?? "ACTIVE",
    acceptedAt:
      options.accepted === false ? null : new Date("2026-10-01T10:00:00Z"),
    invitedAt: new Date("2026-09-30T10:00:00Z"),
    staffAccessMode: "SCOPED",
    staffAccessRevision: options.revision ?? 7,
    catalogEditor: options.catalogEditor ?? false,
    retailOpsStaffProfile: {
      defaultStoreId:
        options.defaultStoreId === undefined ? "shop" : options.defaultStoreId,
    },
    staffStoreAssignments: options.assignments ?? [
      { tenantId: "business", storeId: "shop", role: "CASHIER", revision: 3 },
    ],
    user: {
      id: "staff-user",
      name: "Amina",
      displayName: "Amina Shop",
      email: "amina@example.test",
      password: "must-not-leak",
    },
  }
  const raw = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?")
      calls.push({ kind: "lock", input: { sql, values } })
      if (sql.includes('JOIN "Tenant"'))
        return [
          {
            id: "actor",
            role: options.actorRole ?? "OWNER",
            status: options.actorStatus ?? "ACTIVE",
            staffAccessMode: options.actorMode ?? "SCOPED",
          },
        ]
      if (sql.includes('FROM "Store"'))
        return [
          {
            id: "shop",
            name: options.storeName ?? "Shop",
            status: options.storeStatus ?? "ACTIVE",
          },
        ]
      return options.missing && sql.includes('FROM "Membership"')
        ? []
        : [{ id: "member" }]
    },
    membership: {
      findFirstOrThrow: async (args: unknown) => {
        calls.push({ kind: "read", input: args })
        return membership
      },
      count: async (args: unknown) => {
        calls.push({ kind: "seat-count", input: args })
        return options.used ?? 2
      },
      update: async (args: { data: { status: string } }) => {
        calls.push({ kind: "write", input: args })
        return {
          ...membership,
          status: args.data.status,
          staffAccessRevision: membership.staffAccessRevision + 1,
          updatedAt: new Date("2026-10-12T10:00:00Z"),
        }
      },
    },
    store: { count: async () => 1 },
    catalogItem: { count: async () => 0 },
    commercialOrder: { count: async () => 0 },
    offlineDevice: { findMany: async () => [] },
    offlineDeviceRevocation: { findMany: async () => [] },
    subscriptionPlan: { findMany: async () => [] },
    tenantSubscription: { findUnique: async () => null },
    tenant: {
      findFirstOrThrow: async () => ({
        id: "business",
        name: "Business",
        slug: "business",
        createdAt: new Date("2026-10-01"),
        updatedAt: new Date("2026-10-01"),
        metadata: {
          retailOps: { subscription: { planId: "starter", status: "active" } },
        },
      }),
    },
    retailOpsStaffProfile: {
      upsert: async (args: unknown) => {
        calls.push({ kind: "profile", input: args })
        return { id: "profile" }
      },
    },
    retailOpsStaffLifecycleEvent: {
      create: async (args: unknown) => {
        calls.push({ kind: "audit", input: args })
        if (options.failAudit)
          throw Object.assign(new Error("audit unavailable"), { code: "P2021" })
        return { id: "event" }
      },
    },
    storeConversation: {
      findMany: async (args: unknown) => {
        calls.push({ kind: "release", input: args })
        return []
      },
    },
  }
  return { tx: raw as unknown as Prisma.TransactionClient, calls, membership }
}

describe("canonical staff status changes", () => {
  test("suspension preserves acceptance and grants, fences revisions and requires durable history", async () => {
    const f = fixture()
    const result = await updateRetailOpsStaffStatusInTransaction(f.tx, input)
    expect(result).toMatchObject({
      id: "member",
      previousStatus: "ACTIVE",
      status: "SUSPENDED",
      staffAccessRevision: 8,
      lifecycleEventId: "event",
      reason: "Review staff access",
      acceptedAt: f.membership.acceptedAt,
    })
    expect(f.calls.find((row) => row.kind === "write")?.input).toEqual({
      where: {
        id: "member",
        tenantId: "business",
        status: "ACTIVE",
        staffAccessRevision: 7,
      },
      data: { status: "SUSPENDED", staffAccessRevision: { increment: 1 } },
      select: expect.any(Object),
    })
    expect(f.calls.find((row) => row.kind === "audit")?.input).toMatchObject({
      data: {
        actorUserId: "owner",
        reason: "Review staff access",
        fromStatus: "ACTIVE",
        toStatus: "SUSPENDED",
        fromRole: "CASHIER",
        toRole: "CASHIER",
        type: "SUSPENDED",
      },
    })
    expect(f.calls.find((row) => row.kind === "release")?.input).toMatchObject({
      where: { assignedMembershipId: "member", tenantId: "business" },
    })
    expect(f.membership.staffStoreAssignments).toHaveLength(1)
    const locks = f.calls
      .filter((row) => row.kind === "lock")
      .map((row) => row.input as { sql: string })
    expect(locks[0]?.sql).toContain('FROM "Tenant"')
    expect(locks[0]?.sql).toContain("FOR UPDATE")
    expect(locks[1]?.sql).toContain("FOR SHARE OF m")
    expect(locks[2]?.sql).toContain("FOR UPDATE")
  })
  test("unaccepted invitations may be suspended but cannot be activated through reactivation", async () => {
    const f = fixture({ status: "INVITED", accepted: false })
    expect(
      (await updateRetailOpsStaffStatusInTransaction(f.tx, input)).acceptedAt,
    ).toBeNull()
    const suspended = fixture({ status: "SUSPENDED", accepted: false })
    await expect(
      prepareStaffStatusChangeInTransaction(suspended.tx, {
        ...input,
        status: "active",
      }),
    ).rejects.toThrow("completed onboarding")
    expect(
      suspended.calls.some(
        (row) => row.kind === "write" || row.kind === "seat-count",
      ),
    ).toBe(false)
  })
  test("fresh suspended or downgraded actor is refused before target access", async () => {
    for (const actor of [
      { actorStatus: "SUSPENDED" },
      { actorRole: "MANAGER" },
    ]) {
      const f = fixture(actor)
      await expect(
        prepareStaffStatusChangeInTransaction(f.tx, input),
      ).rejects.toThrow("staff-management access")
      expect(
        f.calls.some((row) => row.kind === "read" || row.kind === "write"),
      ).toBe(false)
    }
  })
  test("native legacy Manager status authority is preserved without admitting scoped Managers", async () => {
    const f = fixture({ actorRole: "MANAGER", actorMode: "LEGACY" })
    expect(
      (await prepareStaffStatusChangeInTransaction(f.tx, input))
        .actorMembershipId,
    ).toBe("actor")
  })
  test("self, protected roles, removed target, foreign target and unchanged status refuse without writes", async () => {
    for (const options of [
      { role: "OWNER" },
      { role: "ADMIN" },
      { role: "SUPPORT" },
      { role: "MEMBER" },
      { status: "REMOVED" },
      { status: "SUSPENDED" },
      { missing: true },
    ]) {
      const f = fixture(options)
      await expect(
        prepareStaffStatusChangeInTransaction(f.tx, input),
      ).rejects.toThrow()
      expect(f.calls.some((row) => row.kind === "write")).toBe(false)
    }
    const f = fixture()
    await expect(
      prepareStaffStatusChangeInTransaction(f.tx, {
        ...input,
        actorUserId: "staff-user",
      }),
    ).rejects.toThrow("own staff status")
  })
  test("stale or malformed revision and blank/oversize reason refuse", async () => {
    for (const request of [
      { expectedRevision: 6 },
      { expectedRevision: 0 },
      { expectedRevision: 1.5 },
      { reason: " " },
      { reason: "x".repeat(501) },
    ]) {
      const f = fixture()
      await expect(
        prepareStaffStatusChangeInTransaction(f.tx, { ...input, ...request }),
      ).rejects.toThrow()
      expect(f.calls.some((row) => row.kind === "write")).toBe(false)
    }
  })
  test("reactivation preserves acceptedAt and exact current access, including an already-counted seat at the limit", async () => {
    const f = fixture({ status: "SUSPENDED", used: 2 })
    const result = await updateRetailOpsStaffStatusInTransaction(f.tx, {
      ...input,
      status: "active",
    })
    expect(result).toMatchObject({
      status: "ACTIVE",
      acceptedAt: f.membership.acceptedAt,
      staffAccessRevision: 8,
    })
    expect(
      f.calls.find((row) => row.kind === "seat-count")?.input,
    ).toMatchObject({
      where: {
        tenantId: "business",
        status: { in: ["ACTIVE", "INVITED", "SUSPENDED"] },
      },
    })
    expect(f.calls.some((row) => row.kind === "release")).toBe(false)
    expect(f.calls.find((row) => row.kind === "write")?.input).toMatchObject({
      data: { status: "ACTIVE", staffAccessRevision: { increment: 1 } },
    })
    expect(f.membership.staffStoreAssignments).toEqual([
      { tenantId: "business", storeId: "shop", role: "CASHIER", revision: 3 },
    ])
  })
  test("reactivation refuses removed-all, archived, foreign, invalid-default and excessive catalog grants", async () => {
    for (const options of [
      { assignments: [] },
      { storeStatus: "ARCHIVED" },
      {
        assignments: [
          {
            tenantId: "foreign",
            storeId: "shop",
            role: "CASHIER",
            revision: 3,
          },
        ],
      },
      { defaultStoreId: "other" },
      { catalogEditor: true },
      { used: 3 },
    ]) {
      const f = fixture({ status: "SUSPENDED", ...options })
      await expect(
        prepareStaffStatusChangeInTransaction(f.tx, {
          ...input,
          status: "active",
        }),
      ).rejects.toThrow()
      expect(f.calls.some((row) => row.kind === "write")).toBe(false)
    }
  })
  test("review pins exact membership and original facts with no private user data or writes", async () => {
    const f = fixture()
    const { staffUserId: _, ...request } = input
    const review = await reviewStaffStatusChangeInTransaction(f.tx, {
      ...request,
      membershipId: "member",
    })
    expect(review).toMatchObject({
      membershipId: "member",
      expectedRevision: 7,
      scope: "business_membership",
      previousStatus: "ACTIVE",
      nextStatus: "SUSPENDED",
      assignments: [
        { storeId: "shop", storeName: "Shop", role: "CASHIER", revision: 3 },
      ],
    })
    expect(JSON.stringify(review)).not.toContain("must-not-leak")
    expect(review.reviewHash).toMatch(/^[a-f0-9]{64}$/)
    expect(
      f.calls.some((row) =>
        ["write", "profile", "audit", "release"].includes(row.kind),
      ),
    ).toBe(false)
    const changed = fixture({ storeName: "Renamed" })
    expect(
      (
        await reviewStaffStatusChangeInTransaction(changed.tx, {
          ...request,
          membershipId: "member",
        })
      ).reviewHash,
    ).not.toBe(review.reviewHash)
  })
  test("durable history failure propagates instead of reporting a successful status change", async () => {
    const f = fixture({ failAudit: true })
    await expect(
      updateRetailOpsStaffStatusInTransaction(f.tx, input),
    ).rejects.toThrow("audit unavailable")
    expect(f.calls.some((row) => row.kind === "release")).toBe(false)
  })
  test("root wrapper opens one bounded transaction and uses the caller-owned seam", async () => {
    const f = fixture()
    let options: unknown
    const db = {
      $transaction: async (
        operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
        value: unknown,
      ) => {
        options = value
        return operation(f.tx)
      },
    } as unknown as PrismaClient
    await updateRetailOpsStaffStatus(db, input)
    expect(options).toEqual({ maxWait: 10_000, timeout: 30_000 })
    expect(f.calls.filter((row) => row.kind === "write")).toHaveLength(1)
  })
})

test("assistant preparation requires reason/revision and administrative authority without changing native legacy Manager access", async () => {
  const legacy = fixture({ actorRole: "MANAGER", actorMode: "LEGACY" })
  await expect(
    prepareReviewedStaffStatusChangeInTransaction(legacy.tx, input),
  ).rejects.toThrow("Owner/Admin")
  expect(legacy.calls.some((call) => call.kind === "write")).toBe(false)
  const owner = fixture()
  await expect(
    prepareReviewedStaffStatusChangeInTransaction(owner.tx, {
      ...input,
      expectedRevision: undefined,
    }),
  ).rejects.toThrow("current revision")
  await expect(
    prepareReviewedStaffStatusChangeInTransaction(owner.tx, {
      ...input,
      reason: " ",
    }),
  ).rejects.toThrow("current revision")
})

test("assistant closure owns one original locked preparation and durable original outcome", async () => {
  const f = fixture()
  const prepared = await prepareReviewedStaffStatusChangeInTransaction(
    f.tx,
    input,
  )
  const beforeLocks = f.calls.filter((call) => call.kind === "lock").length
  expect(prepared.review.membershipId).toBe("member")
  expect(prepared.review.expectedRevision).toBe(7)
  expect(f.calls.some((call) => call.kind === "write")).toBe(false)
  const saved = await prepared.execute()
  expect(saved.lifecycleEventId).toBe("event")
  expect(saved.staffAccessRevision).toBe(8)
  expect(saved.reason).toBe("Review staff access")
  expect(f.calls.filter((call) => call.kind === "lock").length).toBe(
    beforeLocks,
  )
  expect(f.calls.filter((call) => call.kind === "audit")).toHaveLength(1)
})

describe("removing someone who never joined", () => {
  const base = {
    actorUserId: "owner",
    staffUserId: "staff",
    role: "CASHIER",
    status: "INVITED",
    acceptedAt: null,
  }
  test("allows pending and suspended invites that were never accepted", () => {
    expect(() => validateUnacceptedStaffRemoval(base)).not.toThrow()
    expect(() =>
      validateUnacceptedStaffRemoval({ ...base, status: "SUSPENDED" }),
    ).not.toThrow()
  })
  test("refuses people who joined, owners and admins, and yourself", () => {
    expect(() =>
      validateUnacceptedStaffRemoval({ ...base, acceptedAt: new Date() }),
    ).toThrow("Only people who never joined can be removed.")
    expect(() =>
      validateUnacceptedStaffRemoval({ ...base, status: "ACTIVE" }),
    ).toThrow()
    expect(() =>
      validateUnacceptedStaffRemoval({ ...base, role: "ADMIN" }),
    ).toThrow("Owners and admins can’t be removed here.")
    expect(() =>
      validateUnacceptedStaffRemoval({ ...base, staffUserId: "owner" }),
    ).toThrow("You can’t remove yourself.")
  })
})
