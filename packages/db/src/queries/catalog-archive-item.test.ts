import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { archiveCatalogItem } from "./catalog"

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
