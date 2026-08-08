import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { listPrescriptionSelectableOfferings } from "./prescription-catalog"

describe("Prescription catalogue projection", () => {
  test("applies Tenant/Store and active Product Offering scope in the query", async () => {
    const db = {
      sellableOffering: {
        findMany: async (input: unknown) => {
          expect(input).toMatchObject({
            where: {
              kind: "PRODUCT_UNIT",
              status: "ACTIVE",
              storeAvailability: {
                some: { isAvailable: true, storeId: "store-1" },
              },
              tenantId: "tenant-1",
            },
          })
          return [
            {
              catalogItem: { name: "Medicine" },
              id: "offering-1",
              name: "Tablet",
              variant: { name: "Standard" },
            },
          ]
        },
      },
    } as unknown as PrismaClient

    expect(
      await listPrescriptionSelectableOfferings(db, {
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).toEqual([{ id: "offering-1", label: "Medicine · Standard · Tablet" }])
  })
})
