import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { archiveCatalogItem, restoreCatalogItem } from "./catalog"

function fakeDb(item: { id: string; name: string; status: string } | null) {
  const writes: { table: string; where: unknown; data: unknown }[] = []
  const reads: unknown[] = []
  const tx = {
    catalogItem: {
      findFirst: async (args: { where: unknown }) => {
        reads.push(args.where)
        return item
      },
      update: async (args: { where: unknown; data: unknown }) => {
        writes.push({ table: "item", ...args })
        return item
      },
    },
    sellableVariant: {
      updateMany: async (args: { where: unknown; data: unknown }) => {
        writes.push({ table: "variant", ...args })
        return { count: 2 }
      },
    },
    sellableOffering: {
      updateMany: async (args: { where: unknown; data: unknown }) => {
        writes.push({ table: "offering", ...args })
        return { count: 3 }
      },
    },
  }
  const db = {
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PrismaClient
  return { db, writes, reads }
}

test("archiving an item archives its choices, prices and the item in the tenant only", async () => {
  const { db, writes, reads } = fakeDb({
    id: "item",
    name: "Tomatoes",
    status: "ACTIVE",
  })
  expect(
    await archiveCatalogItem(db, { itemId: "item", tenantId: "tenant" }),
  ).toEqual({ id: "item", name: "Tomatoes" })
  expect(reads).toEqual([{ id: "item", tenantId: "tenant", systemRole: null }])
  expect(writes.map((write) => write.table)).toEqual([
    "offering",
    "variant",
    "item",
  ])
  for (const write of writes)
    expect(write.data).toMatchObject({ status: "ARCHIVED" })
  expect(writes[0]?.where).toEqual({
    catalogItemId: "item",
    status: { not: "ARCHIVED" },
  })
})

test("an archived item is left alone and a missing or foreign item is refused", async () => {
  const done = fakeDb({ id: "item", name: "Tomatoes", status: "ARCHIVED" })
  await archiveCatalogItem(done.db, { itemId: "item", tenantId: "tenant" })
  expect(done.writes).toEqual([])
  const missing = fakeDb(null)
  await expect(
    archiveCatalogItem(missing.db, { itemId: "other", tenantId: "tenant" }),
  ).rejects.toThrow("Catalog item not found.")
})

function restoreDb(
  item: {
    id: string
    name: string
    status: string
    archivedAt: Date | null
  } | null,
  liveVariants: { id: string; isDefault: boolean }[],
) {
  const writes: { table: string; where: unknown; data: unknown }[] = []
  const tx = {
    catalogItem: {
      findFirst: async () => item,
      update: async (args: { where: unknown; data: unknown }) => {
        writes.push({ table: "item", ...args })
        return item
      },
    },
    sellableVariant: {
      updateMany: async (args: { where: unknown; data: unknown }) => {
        writes.push({ table: "variant", ...args })
        return { count: 1 }
      },
      findMany: async () => liveVariants,
      update: async (args: { where: unknown; data: unknown }) => {
        writes.push({ table: "default", ...args })
        return {}
      },
    },
    sellableOffering: {
      updateMany: async (args: { where: unknown; data: unknown }) => {
        writes.push({ table: "offering", ...args })
        return { count: 1 }
      },
    },
  }
  const db = {
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PrismaClient
  return { db, writes }
}

test("restoring brings back only what was archived with the item and picks a default choice", async () => {
  const archivedAt = new Date("2026-11-15T00:10:00.000Z")
  const { db, writes } = restoreDb(
    { id: "item", name: "Tomatoes", status: "ARCHIVED", archivedAt },
    [
      { id: "v1", isDefault: false },
      { id: "v2", isDefault: false },
    ],
  )
  expect(
    await restoreCatalogItem(db, { itemId: "item", tenantId: "tenant" }),
  ).toEqual({ id: "item", name: "Tomatoes" })
  expect(writes.map((write) => write.table)).toEqual([
    "variant",
    "offering",
    "default",
    "item",
  ])
  const sameStamp = { catalogItemId: "item", status: "ARCHIVED", archivedAt }
  expect(writes[0]?.where).toEqual(sameStamp)
  expect(writes[1]?.where).toEqual(sameStamp)
  expect(writes[2]).toMatchObject({
    where: { id: "v1" },
    data: { isDefault: true },
  })
  expect(writes[3]?.data).toEqual({ archivedAt: null, status: "ACTIVE" })
})

test("restore keeps an existing default, ignores live items and refuses missing ones", async () => {
  const kept = restoreDb(
    { id: "item", name: "Tomatoes", status: "ARCHIVED", archivedAt: null },
    [{ id: "v1", isDefault: true }],
  )
  await restoreCatalogItem(kept.db, { itemId: "item", tenantId: "tenant" })
  expect(kept.writes.map((write) => write.table)).toEqual([
    "variant",
    "offering",
    "item",
  ])
  expect(kept.writes[0]?.where).toEqual({
    catalogItemId: "item",
    status: "ARCHIVED",
  })
  const live = restoreDb(
    { id: "item", name: "Tomatoes", status: "ACTIVE", archivedAt: null },
    [],
  )
  await restoreCatalogItem(live.db, { itemId: "item", tenantId: "tenant" })
  expect(live.writes).toEqual([])
  const missing = restoreDb(null, [])
  await expect(
    restoreCatalogItem(missing.db, { itemId: "x", tenantId: "tenant" }),
  ).rejects.toThrow("Catalog item not found.")
})
