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
                      businessProfileKey:
                        "animal-feed-agricultural-supplies",
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
