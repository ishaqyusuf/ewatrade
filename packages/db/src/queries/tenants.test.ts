import { describe, expect, test } from "bun:test"

import { getActiveTenantForUser } from "./tenants"
import type { DbClient } from "./types"

describe("tenant context", () => {
  test("exposes a valid Store business profile for client personalization", async () => {
    const db = {
      membership: {
        findFirst: async () => ({
          id: "membership_123",
          role: "OWNER",
          tenantId: "tenant_123",
          tenant: {
            currencyCode: "NGN",
            enabledModes: ["MERCHANT"],
            id: "tenant_123",
            name: "Bird Feed Store",
            slug: "bird-feed-store",
            stores: [
              {
                currencyCode: "NGN",
                id: "store_123",
                metadata: {
                  retailOps: {
                    onboarding: {
                      businessProfileKey: "animal-feed-agricultural-supplies",
                    },
                  },
                },
                name: "Main Store",
                slug: "main-store",
                status: "ACTIVE",
              },
            ],
            timezone: "Africa/Lagos",
            type: "MERCHANT",
          },
        }),
      },
    }

    const context = await getActiveTenantForUser(db as unknown as DbClient, {
      userId: "user_123",
    })

    expect(context?.stores).toEqual([
      expect.objectContaining({
        businessProfileKey: "animal-feed-agricultural-supplies",
        id: "store_123",
      }),
    ])
    expect(context?.activeStore).toMatchObject({
      businessProfileKey: "animal-feed-agricultural-supplies",
      id: "store_123",
    })
  })
})

test("scoped context selects independent Store role and never exposes an unassigned Store", async () => {
  const membership = {
    id: "member",
    role: "MANAGER",
    tenantId: "tenant",
    staffAccessMode: "SCOPED",
    catalogEditor: true,
    staffStoreAssignments: [
      { storeId: "farm", role: "MANAGER", status: "ACTIVE" },
      { storeId: "shop", role: "CASHIER", status: "ACTIVE" },
    ],
    retailOpsStaffProfile: { defaultStoreId: "shop" },
    tenant: {
      id: "tenant",
      name: "QA",
      slug: "qa",
      type: "MERCHANT",
      enabledModes: ["MERCHANT"],
      timezone: "Africa/Lagos",
      currencyCode: "NGN",
      stores: ["farm", "shop", "private"].map((id) => ({
        id,
        slug: id,
        name: id,
        status: "ACTIVE",
        currencyCode: "NGN",
        metadata: {},
      })),
    },
  }
  const db = {
    membership: { findFirst: async () => membership },
  } as unknown as DbClient
  const initial = await getActiveTenantForUser(db, { userId: "staff" })
  expect(initial?.stores.map((store) => store.id)).toEqual(["farm", "shop"])
  expect(initial?.activeStore?.id).toBe("shop")
  expect(initial?.membership.role).toBe("CASHIER")
  expect(initial?.membership.catalogEditor).toBe(true)
  expect(
    (await getActiveTenantForUser(db, { userId: "staff", storeId: "farm" }))
      ?.membership.role,
  ).toBe("MANAGER")
  expect(
    await getActiveTenantForUser(db, { userId: "staff", storeId: "private" }),
  ).toBeNull()
  membership.staffStoreAssignments = []
  const revoked = await getActiveTenantForUser(db, { userId: "staff" })
  expect(revoked?.stores).toEqual([])
  expect(revoked?.activeStore).toBeNull()
  expect(revoked?.membership.catalogEditor).toBe(false)
})
