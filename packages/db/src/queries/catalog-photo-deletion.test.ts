import { describe, expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { inventoryCatalogPhotosBeforeTenantDeletion } from "./catalog-photo-deletion"

function fixture(classification = "LIVE", changes = {}) {
  const rows: unknown[] = []
  const asset = {
    id: "asset",
    tenantId: "tenant",
    storeId: "store",
    contentDigest: "a".repeat(64),
    contentType: "image/png",
    sizeBytes: 8,
    storageProvider: "vercel_blob_private",
    storageStoreId: "store_original",
    storagePath: null,
    ...changes,
  }
  const tx = {
    $queryRaw: async () => [{ dataClassification: classification }],
    catalogPhotoAsset: { findMany: async () => [asset] },
    catalogPhotoDerivative: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
    catalogPhotoDeletionOutbox: {
      findUnique: async () => null,
      create: async ({ data }: { data: unknown }) => rows.push(data),
    },
  } as unknown as Prisma.TransactionClient
  return { tx, rows }
}

describe("internal Catalog Tenant deletion inventory", () => {
  test("includes possible in-flight bytes from an intent without receipt", async () => {
    const { tx, rows } = fixture()
    expect(
      await inventoryCatalogPhotosBeforeTenantDeletion(tx, "tenant"),
    ).toEqual({ inventoried: 1, derivatives: 0 })
    expect(rows[0]).toMatchObject({
      storagePath: `catalog/quarantine/tenant/store/asset/${"a".repeat(64)}.png`,
      storageStoreId: "store_original",
      dataClassification: "LIVE",
      provenance: "catalog-tenant-inventory-v1",
    })
    expect(rows[0]).not.toHaveProperty("actorUserId")
  })
  test("QA, unknown store and contradictory provider paths fail closed", async () => {
    for (const { tx, rows } of [
      fixture("QA"),
      fixture("LIVE", { storageStoreId: null }),
      fixture("LIVE", { storagePath: "arbitrary/key" }),
    ]) {
      await expect(
        inventoryCatalogPhotosBeforeTenantDeletion(tx, "tenant"),
      ).rejects.toThrow()
      expect(rows).toHaveLength(0)
    }
  })
})
