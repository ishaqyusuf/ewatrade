import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { migrateLegacyServiceOperations } from "./legacy-service-operations-migration"

function createLegacyMetadata() {
  return {
    retailOps: {
      dryCleaning: {
        notificationIntents: [],
        serviceItems: [
          {
            category: "Garments",
            createdAt: "2026-07-10T08:00:00.000Z",
            description: "Wash and press",
            estimatedTurnaroundHours: 48,
            id: "legacy_service_shirt",
            name: "Shirt cleaning",
            priceMinor: 500,
            status: "active",
            updatedAt: "2026-07-10T08:00:00.000Z",
            variants: [
              {
                id: "legacy_variant_express",
                name: "Express",
                priceMinor: 750,
              },
            ],
          },
        ],
        serviceOrders: [],
        serviceRequestLinks: [],
        serviceRequests: [],
      },
    },
  }
}

describe("legacy service operations migration", () => {
  test("dry-runs a bounded store batch without logging sensitive records", async () => {
    const calls: string[] = []
    const db = {
      product: {
        findFirst: async () => {
          calls.push("product.findFirst")
          return null
        },
        findMany: async () => {
          calls.push("product.findMany")
          return []
        },
      },
      store: {
        findMany: async (input: Record<string, unknown>) => {
          calls.push("store.findMany")
          expect(input).toMatchObject({
            orderBy: { id: "asc" },
            take: 25,
            where: {
              id: { gt: "store_099" },
              tenantId: "tenant_123",
            },
          })
          return [
            {
              currencyCode: "NGN",
              id: "store_100",
              metadata: createLegacyMetadata(),
              tenantId: "tenant_123",
            },
          ]
        },
      },
    } as unknown as PrismaClient

    const summary = await migrateLegacyServiceOperations(db, {
      afterStoreId: "store_099",
      batchSize: 25,
      dryRun: true,
      tenantId: "tenant_123",
    })

    expect(summary).toEqual({
      dryRun: true,
      migrated: {
        jobs: 0,
        notificationIntents: 0,
        requestLinks: 0,
        requests: 0,
        serviceItems: 1,
      },
      scannedStores: 1,
      skippedStores: 0,
    })
    expect(Object.keys(summary)).not.toContain("tokens")
    expect(Object.keys(summary)).not.toContain("customers")
    expect(calls).toEqual([
      "store.findMany",
      "product.findFirst",
      "product.findMany",
    ])
  })

  test("skips empty and malformed legacy metadata safely", async () => {
    const db = {
      store: {
        findMany: async () => [
          {
            currencyCode: "NGN",
            id: "store_empty",
            metadata: {
              retailOps: {
                dryCleaning: {
                  serviceItems: "not-an-array",
                  serviceOrders: [{ invalid: true }],
                },
              },
            },
            tenantId: "tenant_123",
          },
        ],
      },
    } as unknown as PrismaClient

    await expect(
      migrateLegacyServiceOperations(db, {
        dryRun: true,
        storeId: "store_empty",
      }),
    ).resolves.toMatchObject({
      scannedStores: 1,
      skippedStores: 1,
    })
  })

  test("treats an existing legacy mapping as an idempotent rerun", async () => {
    const db = {
      product: {
        findFirst: async () => ({
          id: "service_item_123",
          variants: [
            {
              id: "service_variant_123",
              isDefault: true,
              legacyServiceVariantId: null,
            },
          ],
        }),
        findMany: async () => [
          {
            id: "service_item_123",
            legacyServiceItemId: "legacy_service_shirt",
            variants: [
              {
                id: "service_variant_123",
                isDefault: true,
                legacyServiceVariantId: null,
              },
            ],
          },
        ],
      },
      store: {
        findMany: async () => [
          {
            currencyCode: "NGN",
            id: "store_100",
            metadata: createLegacyMetadata(),
            tenantId: "tenant_123",
          },
        ],
      },
    } as unknown as PrismaClient

    const summary = await migrateLegacyServiceOperations(db, {
      dryRun: true,
      storeId: "store_100",
    })

    expect(summary.migrated.serviceItems).toBe(0)
    expect(summary.scannedStores).toBe(1)
  })
})
