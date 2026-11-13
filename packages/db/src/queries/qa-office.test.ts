import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { QaOfficePurgeError, purgeQaTester } from "./qa-office"

type Tenant = {
  id: string
  name: string
  subscription: null | {
    provider: string
    status: string
    billingSubscriptionId: string | null
  }
  domainOrders: Array<{ id: string }>
}

function fakeDb(tenants: Tenant[], opts: { runConflict?: boolean } = {}) {
  const calls = {
    updateMany: [] as unknown[],
    userDelete: [] as unknown[],
    runUpdate: [] as Array<Record<string, unknown>>,
  }
  const db = {
    tenant: {
      findMany: async ({ where }: { where: { id?: { in: string[] } } }) =>
        tenants.filter((t) => !where.id || where.id.in.includes(t.id)),
      updateMany: async (args: unknown) => {
        calls.updateMany.push(args)
        return { count: 1 }
      },
    },
    qaPurgeRun: {
      create: async () => {
        if (opts.runConflict) throw new Error("unique")
        return { id: "run_1" }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        calls.runUpdate.push(data)
        return {}
      },
    },
    user: {
      deleteMany: async (args: unknown) => {
        calls.userDelete.push(args)
        return { count: 1 }
      },
    },
  } as unknown as PrismaClient
  return { db, calls }
}
const t = (id: string, extra: Partial<Tenant> = {}): Tenant => ({
  id,
  name: id,
  subscription: null,
  domainOrders: [],
  ...extra,
})

describe("purgeQaTester", () => {
  test("deletes every QA business of the tester, then its QA-domain accounts", async () => {
    const { db, calls } = fakeDb([t("a"), t("b")])
    const deleted: string[] = []
    const result = await purgeQaTester(
      db,
      { qa: "amina.qa.test", requestedBy: "oversight:e1" },
      async (_db, id) => {
        deleted.push(id)
      },
    )
    expect(result.status).toBe("COMPLETED")
    expect(deleted).toEqual(["a", "b"])
    expect(result.accountsDeleted).toBe(1)
    expect(JSON.stringify(calls.userDelete[0])).toContain("@amina.qa.test")
    expect(calls.runUpdate[0]).toMatchObject({
      status: "COMPLETED",
      activeKey: null,
    })
  })

  test("deleting selected businesses never deletes accounts by domain", async () => {
    const { db, calls } = fakeDb([t("a"), t("b")])
    const result = await purgeQaTester(
      db,
      { qa: "amina.qa.test", tenantIds: ["a"], requestedBy: "x" },
      async () => {},
    )
    expect(result.deleted.map((d) => d.id)).toEqual(["a"])
    expect(calls.userDelete).toHaveLength(0)
  })

  test("rejects a selection that is not this tester's QA business", async () => {
    const { db } = fakeDb([t("a")])
    await expect(
      purgeQaTester(
        db,
        { qa: "amina.qa.test", tenantIds: ["a", "live"], requestedBy: "x" },
        async () => {},
      ),
    ).rejects.toBeInstanceOf(QaOfficePurgeError)
  })

  test("skips blocked businesses and reports a partial run", async () => {
    const { db, calls } = fakeDb([
      t("a"),
      t("paid", { domainOrders: [{ id: "d" }] }),
      t("broken"),
    ])
    const result = await purgeQaTester(
      db,
      { qa: "amina.qa.test", requestedBy: "x" },
      async (_db, id) => {
        if (id === "broken") throw new Error("boom")
      },
    )
    expect(result.status).toBe("PARTIALLY_COMPLETED")
    expect(result.failed.map((f) => [f.id, f.reason])).toEqual([
      ["paid", "purchased_domain"],
      ["broken", "delete_failed"],
    ])
    expect(result.accountsDeleted).toBe(0)
    // the failed business is made usable again
    expect(JSON.stringify(calls.updateMany.at(-1))).toContain(
      '"qaPurgeStartedAt":null',
    )
  })

  test("refuses a second run for the same tester and non-.test domains", async () => {
    await expect(
      purgeQaTester(
        fakeDb([t("a")], { runConflict: true }).db,
        { qa: "amina.qa.test", requestedBy: "x" },
        async () => {},
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    await expect(
      purgeQaTester(
        fakeDb([t("a")]).db,
        { qa: "example.com", requestedBy: "x" },
        async () => {},
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })
})
