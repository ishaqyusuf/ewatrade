import { expect, test } from "bun:test"
import { findProductTaxonomyCategory } from "@ewatrade/utils/product-taxonomy"
import type { Prisma } from "../../generated/prisma/client"
import { resolveCatalogCategorySelection } from "./catalog-categories"

const scope = {
  tenantId: "tenant-one",
  storeId: "store-one",
  actorUserId: "actor",
}
test("new Shopify assignments materialize stable tenant keys, preserve paths and replay identities", async () => {
  type Category = {
    id: string
    key: string
    label: string
    tenantId: string
    parentId?: string
  }
  const rows = new Map<string, Category>()
  const tx = {
    $queryRaw: async () => [{ id: "authorized", dataClassification: "LIVE" }],
    catalogCategory: {
      upsert: async (input: {
        where: { tenantId_key: { tenantId: string; key: string } }
        create: Omit<Category, "id">
      }) => {
        const key = JSON.stringify(input.where.tenantId_key)
        const existing = rows.get(key)
        if (existing) return existing
        const row = { ...input.create, id: `row-${rows.size + 1}` }
        rows.set(key, row)
        return row
      },
    },
  } as unknown as Prisma.TransactionClient
  const category = findProductTaxonomyCategory("shopify:fb-2-12-1-4")
  if (!category) throw Error("Pinned eggs category missing")
  const selected = await resolveCatalogCategorySelection(tx, {
    ...scope,
    category: category.label,
  })
  expect(selected).toEqual({
    category: category.label,
    categoryId: "row-1",
    subcategoryId: "row-2",
  })
  expect([...rows.values()].map((row) => row.key)).toEqual([
    "shopify:fb",
    "shopify:fb-2-12-1-4",
  ])
  expect(
    [...rows.values()].every((row) => row.tenantId === scope.tenantId),
  ).toBe(true)
  expect([...rows.values()][1]?.parentId).toBe("row-1")
  expect(
    await resolveCatalogCategorySelection(tx, {
      ...scope,
      category: category.label,
    }),
  ).toEqual(selected)
  expect(rows.size).toBe(2)
})

test("taxonomy selections cannot substitute a foreign business or unrelated parent identity", async () => {
  const reads: unknown[] = []
  const tx = {
    $queryRaw: async () => [{ id: "authorized", dataClassification: "LIVE" }],
    catalogCategory: {
      findFirst: async (query: unknown) => {
        reads.push(query)
        return null
      },
    },
  } as unknown as Prisma.TransactionClient
  await expect(
    resolveCatalogCategorySelection(tx, {
      ...scope,
      categoryId: "foreign-root",
      subcategoryId: "foreign-child",
    }),
  ).rejects.toThrow("business or parent")
  expect(reads).toEqual([
    { where: { id: "foreign-root", tenantId: scope.tenantId, parentId: null } },
    {
      where: {
        id: "foreign-child",
        tenantId: scope.tenantId,
        parentId: "foreign-root",
      },
    },
  ])
})
