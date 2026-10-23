import { expect, test } from "bun:test"
import { setCatalogProductLowStockLevel } from "./catalog-low-stock-level"

function database(count: number) {
  const calls: unknown[] = []
  const db = {
    catalogProduct: {
      updateMany: async (args: unknown) => {
        calls.push(args)
        return { count }
      },
    },
  }
  return { db: db as never, calls }
}

test("saves, clears and refuses a negative or missing low-stock level", async () => {
  const saved = database(1)
  expect(
    await setCatalogProductLowStockLevel(saved.db, {
      tenantId: "tenant-1",
      productId: "product-1",
      level: "360",
    }),
  ).toEqual({ productId: "product-1", lowStockLevel: "360" })
  expect(saved.calls[0]).toMatchObject({
    where: {
      id: "product-1",
      catalogItem: { tenantId: "tenant-1", kind: "PRODUCT" },
    },
    data: { lowStockLevel: "360" },
  })

  const cleared = database(1)
  await setCatalogProductLowStockLevel(cleared.db, {
    tenantId: "tenant-1",
    productId: "product-1",
    level: null,
  })
  expect(cleared.calls[0]).toMatchObject({ data: { lowStockLevel: null } })

  await expect(
    setCatalogProductLowStockLevel(database(1).db, {
      tenantId: "tenant-1",
      productId: "product-1",
      level: "-1",
    }),
  ).rejects.toMatchObject({ code: "INVALID_CATALOG_ITEM" })
  await expect(
    setCatalogProductLowStockLevel(database(0).db, {
      tenantId: "other-tenant",
      productId: "product-1",
      level: "5",
    }),
  ).rejects.toMatchObject({ code: "CATALOG_ITEM_NOT_FOUND" })
})
