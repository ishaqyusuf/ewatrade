import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { getCatalogPublicPhotoTarget } from "./catalog-photos"

test("public photos serve a published Site, or only an owner-listed product of a listed Store", async () => {
  const queries: Record<string, unknown>[] = []
  const db = {
    catalogPhotoAsset: {
      findFirst: async (query: Record<string, unknown>) => {
        queries.push(query)
        return null
      },
    },
  } as unknown as PrismaClient
  await expect(
    getCatalogPublicPhotoTarget(db, { assetId: "asset", storeId: "store" }),
  ).rejects.toThrow("Photo not found.")
  const where = queries[0]?.where as Record<string, unknown>
  expect(where.store).toEqual({ status: "ACTIVE" })
  expect(where.OR).toEqual([
    { store: { sites: { some: { status: "PUBLISHED" } } } },
    {
      store: { publicCatalogListedAt: { not: null } },
      catalogItem: {
        is: {
          kind: "PRODUCT",
          storefrontPolicies: {
            some: { storeId: "store", platformListed: true },
          },
        },
      },
    },
  ])
})
