import { expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"
import {
  prepareReviewedStaffAccessUpdateInTransaction,
  reviewStaffAccessUpdateInTransaction,
} from "./staff-access-update"

const input = {
  tenantId: "business",
  actorUserId: "owner",
  storeId: "farm",
  membershipId: "member",
  expectedRevision: 7,
  confirmLegacyCutover: false,
  assignments: [
    { storeId: "farm", role: "OPERATOR" as const },
    { storeId: "shop", role: "MANAGER" as const },
  ],
  defaultStoreId: "shop",
  catalogEditor: true,
}
function fixture(
  options: {
    mode?: string
    actorRole?: string
    actorStatus?: string
    revision?: number
    changed?: number
    storeStatus?: string
    availableCount?: number
    auditError?: Error
    foreignCurrent?: boolean
    workCount?: number
    workAsOf?: Date
  } = {},
) {
  const calls: Array<{ kind: string; input: unknown }> = []
  const member = {
    id: "member",
    userId: "staff",
    role: "CASHIER",
    status: "ACTIVE",
    staffAccessMode: options.mode ?? "SCOPED",
    staffAccessRevision: options.revision ?? 7,
    catalogEditor: false,
    retailOpsStaffProfile: { defaultStoreId: "farm" },
    staffStoreAssignments: [
      {
        tenantId: options.foreignCurrent ? "other" : "business",
        storeId: "farm",
        role: "CASHIER",
        status: "ACTIVE",
        revision: 3,
      },
    ],
    user: { name: "Amina", displayName: null, email: "amina@example.test" },
  }
  const record = (kind: string) => async (args: unknown) => {
    calls.push({ kind, input: args })
    return {}
  }
  const tx = {
    $transaction: () => {
      throw new Error("nested transaction")
    },
    $queryRaw: async (
      sql: TemplateStringsArray | Prisma.Sql,
      ...values: unknown[]
    ) => {
      const text = Array.isArray(sql) ? sql.join("?") : (sql as Prisma.Sql).sql
      calls.push({ kind: "lock", input: { text, values } })
      if (text.includes("WITH matching")) {
        const count = options.workCount ?? 0
        const asOf = options.workAsOf ?? new Date("2026-10-12T10:00:00Z")
        return count
          ? Array.from({ length: Math.min(count, 11) }, (_, i) => ({
              totalCount: BigInt(count),
              asOf,
              jobId: `job-${i}`,
              revision: 1,
              createdAt: new Date("2026-10-01T10:00:00Z"),
              priority: "NORMAL",
              storeId: "farm",
              storeName: "Farm",
              storeStatus: "ACTIVE",
            }))
          : [{ totalCount: 0n, asOf, jobId: null }]
      }
      if (text.includes('JOIN "Tenant"'))
        return [
          {
            id: "owner-member",
            role: options.actorRole ?? "OWNER",
            status: options.actorStatus ?? "ACTIVE",
          },
        ]
      if (text.includes('FROM "Store"'))
        return [
          { id: "farm", name: "Farm", status: "ACTIVE" },
          { id: "shop", name: "Shop", status: options.storeStatus ?? "ACTIVE" },
        ]
      return [
        {
          id: text.includes('FROM "Tenant"') ? "business" : "member",
          userId: "staff",
        },
      ]
    },
    membership: {
      findFirstOrThrow: async () => member,
      findFirst: async () => member,
      findUnique: async () => ({
        id: "member",
        staffAccessMode: member.staffAccessMode,
      }),
      updateMany: async (args: unknown) => {
        calls.push({ kind: "member-write", input: args })
        return { count: options.changed ?? 1 }
      },
    },
    store: {
      count: async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.length,
      findMany: async () =>
        options.availableCount === undefined
          ? [
              { id: "farm", name: "Farm" },
              { id: "shop", name: "Shop" },
            ]
          : Array.from({ length: options.availableCount }, (_, i) => ({
              id: `s-${i}`,
              name: `Store ${i}`,
            })),
    },
    staffStoreAssignment: {
      updateMany: record("revoke"),
      upsert: record("grant"),
    },
    retailOpsStaffProfile: { updateMany: record("default") },
    staffAccessAuditEvent: {
      create: async (args: unknown) => {
        calls.push({ kind: "audit", input: args })
        if (options.auditError) throw options.auditError
        return { id: "original-event" }
      },
    },
  } as unknown as Prisma.TransactionClient
  return { tx, calls }
}
test("review pins canonical current grants, complete picker and privilege differences without writes", async () => {
  const f = fixture()
  const review = await reviewStaffAccessUpdateInTransaction(f.tx, input)
  expect(review.diff.added).toEqual([
    { storeId: "shop", storeName: "Shop", role: "MANAGER" },
  ])
  expect(review.diff.changed).toEqual([
    {
      storeId: "farm",
      storeName: "Farm",
      previousRole: "CASHIER",
      nextRole: "OPERATOR",
    },
  ])
  expect(review.diff.catalog).toEqual({ before: false, after: true })
  expect(review.availableStoresCoverage).toBe("complete")
  expect(review.availableStores).toHaveLength(2)
  expect(review.outstandingServiceWork).toMatchObject({
    coverage: "available",
    count: 0,
    countCoverage: "complete",
  })
  expect(f.calls.every((call) => call.kind === "lock")).toBe(true)
  expect((f.calls[0]?.input as { text: string }).text).toContain("FOR UPDATE")
  expect((f.calls[1]?.input as { text: string }).text).toContain(
    "FOR SHARE OF m",
  )
})
test("false legacy acknowledgment can review but cannot prepare a write", async () => {
  const f = fixture({ mode: "LEGACY" })
  const review = await reviewStaffAccessUpdateInTransaction(f.tx, input)
  expect(review.requiresLegacyCutoverConfirmation).toBe(true)
  expect(review.confirmLegacyCutover).toBe(false)
  expect(review.diff.comparison).toBe("legacy_business_wide_not_enumerated")
  await expect(
    prepareReviewedStaffAccessUpdateInTransaction(f.tx, input),
  ).rejects.toThrow("Review and confirm")
  expect(f.calls.every((call) => call.kind === "lock")).toBe(true)
})
test("prepared command consumes original identity exactly once with canonical data and held locks", async () => {
  const f = fixture({ mode: "LEGACY" })
  const prepared = await prepareReviewedStaffAccessUpdateInTransaction(f.tx, {
    ...input,
    confirmLegacyCutover: true,
  })
  const saved = await prepared.execute()
  expect(saved).toEqual({
    membershipId: "member",
    revision: 8,
    accessEventId: "original-event",
  })
  expect(f.calls.find((row) => row.kind === "audit")?.input).toMatchObject({
    select: { id: true },
    data: {
      operation: "scoped_access_confirmed",
      revision: 8,
      after: {
        assignments: input.assignments,
        catalogEditor: true,
        defaultStoreId: "shop",
      },
    },
  })
  await expect(prepared.execute()).rejects.toThrow("already consumed")
  expect(f.calls.filter((row) => row.kind === "audit")).toHaveLength(1)
})
test("fresh actor, revision, foreign current grant and unavailable selected Store refuse", async () => {
  for (const [options, message] of [
    [{ actorRole: "MANAGER" }, "Only Owner/Admin"],
    [{ actorStatus: "SUSPENDED" }, "Only Owner/Admin"],
    [{ revision: 8 }, "Review again"],
    [{ foreignCurrent: true }, "reviewed safely"],
    [{ storeStatus: "ARCHIVED" }, "unavailable"],
  ] as const) {
    const f = fixture(options)
    await expect(
      prepareReviewedStaffAccessUpdateInTransaction(f.tx, input),
    ).rejects.toThrow(message)
    expect(f.calls.every((call) => call.kind === "lock")).toBe(true)
  }
})
test("picker overflow is refused instead of treating a limited page as complete", async () => {
  const f = fixture({ availableCount: 101 })
  await expect(
    reviewStaffAccessUpdateInTransaction(f.tx, input),
  ).rejects.toThrow("more than 100")
})
test("review hash is stable across assignment order but pins grant changes", async () => {
  const a = await reviewStaffAccessUpdateInTransaction(fixture().tx, input)
  const b = await reviewStaffAccessUpdateInTransaction(fixture().tx, {
    ...input,
    assignments: [...input.assignments].reverse(),
  })
  const c = await reviewStaffAccessUpdateInTransaction(fixture().tx, {
    ...input,
    catalogEditor: false,
  })
  expect(a.reviewHash).toBe(b.reviewHash)
  expect(a.reviewHash).not.toBe(c.reviewHash)
})
test("audit failure escapes the prepared command", async () => {
  const error = new Error("audit unavailable")
  const prepared = await prepareReviewedStaffAccessUpdateInTransaction(
    fixture({ auditError: error }).tx,
    input,
  )
  await expect(prepared.execute()).rejects.toBe(error)
})

test("access review exposes complete workload count and binds work changes but not read time", async () => {
  const a = await reviewStaffAccessUpdateInTransaction(
    fixture({ workCount: 13 }).tx,
    input,
  )
  const b = await reviewStaffAccessUpdateInTransaction(
    fixture({ workCount: 13, workAsOf: new Date("2026-10-13T10:00:00Z") }).tx,
    input,
  )
  const c = await reviewStaffAccessUpdateInTransaction(
    fixture({ workCount: 14 }).tx,
    input,
  )
  expect(a.outstandingServiceWork).toMatchObject({
    count: 13,
    shown: 10,
    countCoverage: "complete",
    detailsCoverage: "limited",
    handover: "not_performed",
  })
  expect(a.outstandingServiceWork.jobs).toHaveLength(10)
  expect(a.reviewHash).toBe(b.reviewHash)
  expect(a.reviewHash).not.toBe(c.reviewHash)
})
