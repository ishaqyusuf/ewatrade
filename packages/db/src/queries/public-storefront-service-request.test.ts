import { expect, test } from "bun:test"
import { getStorefrontServiceRequestEntry } from "./public-storefront-service-request"
import type { DbClient } from "./types"

const scope = { storeId: "store-1", tenantId: "tenant-1" }

test("request navigation requires an active, unexpired form in this exact Store", async () => {
  let observed: unknown
  const db = {
    serviceRequestForm: {
      findFirst: async (input: unknown) => {
        observed = input
        return null
      },
    },
  } as unknown as DbClient
  expect(await getStorefrontServiceRequestEntry(db, scope)).toBeNull()
  expect(observed).toMatchObject({
    where: { ...scope, status: "ACTIVE", AND: expect.any(Array) },
    include: {
      offerings: {
        take: 100,
        where: {
          offering: {
            tenantId: scope.tenantId,
            kind: "SERVICE",
            status: "ACTIVE",
            archivedAt: null,
            storeAvailability: {
              some: { storeId: scope.storeId, isAvailable: true },
            },
          },
        },
      },
    },
  })
})

test("a form with no eligible options has no request action", async () => {
  const db = {
    serviceRequestForm: {
      findFirst: async () => ({
        id: "form",
        label: "Request",
        offerings: [],
        store: { name: "Store", currencyCode: "NGN" },
      }),
    },
  } as unknown as DbClient
  expect(await getStorefrontServiceRequestEntry(db, scope)).toBeNull()
})

test("infrastructure failures are surfaced rather than treated as eligible", async () => {
  const error = Error("database unavailable")
  const db = {
    serviceRequestForm: {
      findFirst: async () => {
        throw error
      },
    },
  } as unknown as DbClient
  await expect(getStorefrontServiceRequestEntry(db, scope)).rejects.toBe(error)
})
