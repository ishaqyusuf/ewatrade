import { expect, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  getStaffAssignedServiceWork,
  getStaffAssignedServiceWorkInTransaction,
  staffAssignedServiceWorkInput,
} from "./staff-assigned-service-work"

const input = {
  tenantId: "business",
  actorUserId: "owner",
  membershipId: "member",
  limit: 10,
}
function fixture(
  options: {
    actorRole?: string
    actorStatus?: string
    missingMember?: boolean
    missingStore?: boolean
    empty?: boolean
    count?: bigint
    fault?: Error
  } = {},
) {
  const calls: Array<{ text: string; values: unknown[] }> = []
  const tx = {
    $transaction: () => {
      throw Error("nested transaction")
    },
    $queryRaw: async (
      query: TemplateStringsArray | Prisma.Sql,
      ...bound: unknown[]
    ) => {
      const sql = Array.isArray(query)
        ? query.join("?")
        : (query as Prisma.Sql).sql
      const values = Array.isArray(query) ? bound : (query as Prisma.Sql).values
      calls.push({ text: sql, values })
      if (sql.includes("WITH matching")) {
        if (options.fault) throw options.fault
        const metadata = {
          totalCount: options.count ?? (options.empty ? 0n : 13n),
          asOf: new Date("2026-10-12T10:00:00.123Z"),
        }
        if (options.empty)
          return [
            {
              ...metadata,
              jobId: null,
              revision: null,
              createdAt: null,
              priority: null,
              storeId: null,
              storeName: null,
              storeStatus: null,
            },
          ]
        return Array.from({ length: 11 }, (_, i) => ({
          ...metadata,
          jobId: `original-${i}`,
          revision: i,
          createdAt: new Date("2026-10-01T00:00:00Z"),
          priority: "NORMAL",
          storeId: "store",
          storeName: "Original Store",
          storeStatus: "ARCHIVED",
        }))
      }
      if (sql.includes('JOIN "Tenant"'))
        return [
          {
            role: options.actorRole ?? "OWNER",
            status: options.actorStatus ?? "ACTIVE",
          },
        ]
      if (sql.includes('FROM "Membership"'))
        return options.missingMember ? [] : [{ id: "member", userId: "staff" }]
      if (sql.includes('FROM "Store"'))
        return options.missingStore ? [] : [{ id: "store" }]
      return [{ id: "business" }]
    },
  } as unknown as Prisma.TransactionClient
  return { tx, calls }
}
test("one snapshot retains exact total over ten original job details and excludes sensitive graphs", async () => {
  const f = fixture()
  const result = await getStaffAssignedServiceWorkInTransaction(f.tx, input)
  expect(result.count).toBe(13)
  expect(result.jobs).toHaveLength(10)
  expect(result.jobs[9]).toMatchObject({
    jobId: "original-9",
    storeId: "store",
    storeStatus: "ARCHIVED",
  })
  expect(result.hasMore).toBe(true)
  expect(result.countCoverage).toBe("complete")
  expect(result.detailsCoverage).toBe("limited")
  expect(result.asOf).toBe("2026-10-12T10:00:00.123Z")
  expect(result.attribution).toBe("current_assignee")
  expect(result.handover).toBe("not_performed")
  const reads = f.calls.filter((call) => call.text.includes("WITH matching"))
  expect(reads).toHaveLength(1)
  expect(reads[0]?.text).toContain('COUNT(*) AS "totalCount" FROM matching')
  expect(reads[0]?.text).toContain('l."status" NOT IN')
  expect(reads[0]?.values).toContain("COMPLETED")
  expect(reads[0]?.values).toContain("CANCELLED")
  expect(reads[0]?.values).toContain("staff")
  expect(reads[0]?.text).not.toContain('"customerName"')
  expect(reads[0]?.text).not.toContain('"ServiceEvidence"')
})
test("empty workload still carries authoritative zero and same statement timestamp", async () => {
  const result = await getStaffAssignedServiceWorkInTransaction(
    fixture({ empty: true }).tx,
    input,
  )
  expect(result.count).toBe(0)
  expect(result.jobs).toEqual([])
  expect(result.hasMore).toBe(false)
  expect(result.detailsCoverage).toBe("complete")
  expect(result.asOf).toBe("2026-10-12T10:00:00.123Z")
})
test("selected Store is explicitly checked and pinned in the same-business workload predicate", async () => {
  const f = fixture()
  const result = await getStaffAssignedServiceWorkInTransaction(f.tx, {
    ...input,
    storeId: "store",
  })
  expect(result.scope).toBe("selected_store_current_assignee")
  expect(result.storeId).toBe("store")
  const read = f.calls.find((call) => call.text.includes("WITH matching"))
  expect(read?.text).toContain('s."tenantId"=')
  expect(read?.text).toContain('j."tenantId"=')
  expect(read?.text).toContain('j."storeId"=')
  expect(read?.values).toContain("store")
})
test("fresh revoked/nonadmin authority and foreign member/Store refuse before any workload read", async () => {
  for (const options of [
    { actorRole: "MANAGER" },
    { actorStatus: "SUSPENDED" },
    { missingMember: true },
    { missingStore: true },
  ]) {
    const f = fixture(options)
    await expect(
      getStaffAssignedServiceWorkInTransaction(f.tx, {
        ...input,
        storeId: "store",
      }),
    ).rejects.toThrow()
    expect(f.calls.some((call) => call.text.includes("WITH matching"))).toBe(
      false,
    )
  }
})
test("strict bounded input refuses before queries and unsafe totals never become rounded facts", async () => {
  const f = fixture()
  await expect(
    getStaffAssignedServiceWorkInTransaction(f.tx, { ...input, limit: 51 }),
  ).rejects.toThrow()
  expect(f.calls).toHaveLength(0)
  expect(
    staffAssignedServiceWorkInput.safeParse({
      membershipId: "member",
      actorUserId: "forged",
    }).success,
  ).toBe(false)
  await expect(
    getStaffAssignedServiceWorkInTransaction(
      fixture({ count: 9007199254740992n }).tx,
      input,
    ),
  ).rejects.toThrow("represented exactly")
})
test("caller-owned read propagates unknown failures and root owns one bounded snapshot", async () => {
  const fault = new Error("database read failed")
  await expect(
    getStaffAssignedServiceWorkInTransaction(fixture({ fault }).tx, input),
  ).rejects.toBe(fault)
  const f = fixture()
  let calls = 0
  const db = {
    $transaction: async (
      work: (tx: Prisma.TransactionClient) => Promise<unknown>,
      options: unknown,
    ) => {
      calls++
      expect(options).toEqual({
        maxWait: 10_000,
        timeout: 30_000,
        isolationLevel: "RepeatableRead",
      })
      return work(f.tx)
    },
  } as unknown as PrismaClient
  await getStaffAssignedServiceWork(db, input)
  expect(calls).toBe(1)
})
