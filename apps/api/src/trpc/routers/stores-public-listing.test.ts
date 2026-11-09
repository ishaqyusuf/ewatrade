import { expect, test } from "bun:test"
import type { TRPCContext } from "../init"
import { createCallerFactory } from "../init"
import { storesRouter } from "./stores"

function fixture(role = "OWNER") {
  let listedAt: Date | null = null
  const writes: unknown[] = []
  const db = {
    $queryRaw: async () => [],
    $transaction: async (run: (tx: unknown) => unknown) => run(db),
    membership: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const roles = where.role as { in?: string[] } | undefined
        return where.tenantId === "tenant-a" &&
          where.userId === "owner-a" &&
          (!roles?.in || roles.in.includes(role))
          ? { tenant: { isActive: true, qaPurgeStartedAt: null } }
          : null
      },
    },
    store: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        where.id === "store-a" && where.tenantId === "tenant-a"
          ? { publicCatalogListedAt: listedAt, tenant: { slug: "hypnos" } }
          : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>
        data: { publicCatalogListedAt: Date | null }
      }) => {
        if (where.id !== "store-a" || where.tenantId !== "tenant-a")
          return { count: 0 }
        if ("publicCatalogListedAt" in where && listedAt !== null)
          return { count: 0 }
        writes.push(data)
        listedAt = data.publicCatalogListedAt
        return { count: 1 }
      },
    },
  }
  const context = {
    db,
    requestId: "store-public-listing-test",
    session: {
      session: { id: "session", token: "ordinary-session" },
      user: { id: "owner-a" },
    },
    tenantContext: {
      tenant: { id: "tenant-a", qaPurgeStartedAt: null },
      membership: { id: "membership-a", role },
      activeStore: { id: "store-a" },
      stores: [{ id: "store-a" }, { id: "store-b" }],
    },
  }
  return {
    caller: createCallerFactory(storesRouter)(
      context as unknown as TRPCContext,
    ),
    writes,
  }
}

test("a Store is not publicly listed until the Owner opts in", async () => {
  const f = fixture()
  expect(await f.caller.publicListing({})).toEqual({
    listed: false,
    listedAt: null,
    path: "/b/hypnos",
  })
})

test("opting in is idempotent and keeps the first opt-in time; opting out clears it", async () => {
  const f = fixture()
  const first = await f.caller.updatePublicListing({
    storeId: "store-a",
    listed: true,
  })
  expect(first.listed).toBe(true)
  const again = await f.caller.updatePublicListing({
    storeId: "store-a",
    listed: true,
  })
  expect(again.listedAt).toEqual(first.listedAt)
  expect(f.writes).toHaveLength(1)
  expect(
    await f.caller.updatePublicListing({ storeId: "store-a", listed: false }),
  ).toMatchObject({ listed: false, listedAt: null })
})

test("Staff cannot read or change public listing", async () => {
  const f = fixture("STAFF")
  await expect(f.caller.publicListing({})).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  await expect(
    f.caller.updatePublicListing({ storeId: "store-a", listed: true }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(f.writes).toEqual([])
})

test("a Store outside the business cannot be listed", async () => {
  const f = fixture()
  await expect(
    f.caller.updatePublicListing({ storeId: "store-z", listed: true }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  expect(f.writes).toEqual([])
})
