import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { getStoreContact, updateStoreContact } from "./store-contact"

const actor = {
  tenantId: "business-a",
  actorUserId: "owner-a",
  storeId: "store-a",
}
const update = {
  expected: { supportPhone: null, countryCode: "NG" },
  supportPhone: "0803 123 4567",
  countryCode: "NG",
}

function fixture() {
  let saved = {
    id: "store-a",
    name: "Store A",
    supportPhone: null as string | null,
    countryCode: "NG" as string | null,
  }
  let allowWrite = true
  let activeMembership = true
  let purging = false
  let writes = 0
  const db = {
    $queryRaw: async () => [],
    $transaction: async (run: (tx: unknown) => unknown) => run(db),
    membership: {
      findFirst: async ({
        where,
      }: { where: { tenantId: string; userId: string } }) =>
        activeMembership &&
        where.tenantId === actor.tenantId &&
        where.userId === actor.actorUserId
          ? {
              tenant: {
                isActive: true,
                qaPurgeStartedAt: purging ? new Date(0) : null,
              },
            }
          : null,
    },
    store: {
      findFirst: async ({
        where,
      }: { where: { tenantId: string; id: string } }) =>
        where.tenantId === actor.tenantId && where.id === saved.id
          ? { ...saved }
          : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { supportPhone: string | null; countryCode: string | null }
        data: { supportPhone: string | null; countryCode: string | null }
      }) => {
        if (
          !allowWrite ||
          where.supportPhone !== saved.supportPhone ||
          where.countryCode !== saved.countryCode
        )
          return { count: 0 }
        saved = { ...saved, ...data }
        writes++
        return { count: 1 }
      },
    },
  }
  return {
    db: db as unknown as PrismaClient,
    writes: () => writes,
    disableWrite: () => {
      allowWrite = false
    },
    revoke: () => {
      activeMembership = false
    },
    purge: () => {
      purging = true
    },
  }
}

test("canonical command exposes only contact details and never rewrites an unchanged value", async () => {
  const f = fixture()
  const saved = await updateStoreContact(f.db, actor, update)
  expect(saved).toEqual({
    id: "store-a",
    name: "Store A",
    supportPhone: "+2348031234567",
    countryCode: "NG",
  })
  expect(await getStoreContact(f.db, actor)).toEqual(saved)
  expect(await updateStoreContact(f.db, actor, update)).toEqual(saved)
  expect(f.writes()).toBe(1)
  f.revoke()
  await expect(updateStoreContact(f.db, actor, update)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  expect(f.writes()).toBe(1)
})

test("a failed final compare-and-set returns a conflict and preserves the original contact", async () => {
  const f = fixture()
  f.disableWrite()
  await expect(updateStoreContact(f.db, actor, update)).rejects.toMatchObject({
    code: "CONFLICT",
  })
  expect(await getStoreContact(f.db, actor)).toEqual({
    id: "store-a",
    name: "Store A",
    supportPhone: null,
    countryCode: "NG",
  })
  expect(f.writes()).toBe(0)
})

test("direct callers cannot cross Tenant/Store authority or edit a purging business", async () => {
  const f = fixture()
  for (const scope of [
    { ...actor, tenantId: "foreign" },
    { ...actor, actorUserId: "foreign" },
  ]) {
    await expect(getStoreContact(f.db, scope)).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    await expect(updateStoreContact(f.db, scope, update)).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    )
  }
  await expect(
    updateStoreContact(f.db, { ...actor, storeId: "foreign" }, update),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
  f.purge()
  await expect(getStoreContact(f.db, actor)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  await expect(updateStoreContact(f.db, actor, update)).rejects.toMatchObject({
    code: "FORBIDDEN",
  })
  expect(f.writes()).toBe(0)
})
