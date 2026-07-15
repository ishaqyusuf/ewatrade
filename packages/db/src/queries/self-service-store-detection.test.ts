import { describe, expect, test } from "bun:test"
import { resolveSelfServiceStoreFromCoordinates } from "./self-service-store-detection"
import type { DbClient } from "./types"

function createDetectionDb() {
  const rows = [
    {
      id: "store_main",
      metadata: {
        retailOps: {
          selfServiceDetection: {
            enabled: true,
            latitude: 6.5244,
            longitude: 3.3792,
            radiusMeters: 100,
          },
        },
      },
      name: "Main Store",
      slug: "main",
      tenant: {
        id: "tenant_123",
        name: "Market Foods",
        slug: "market-foods",
      },
    },
    {
      id: "store_far",
      metadata: {
        retailOps: {
          selfServiceDetection: {
            enabled: true,
            latitude: 6.61,
            longitude: 3.42,
            radiusMeters: 80,
          },
        },
      },
      name: "Far Store",
      slug: "far",
      tenant: {
        id: "tenant_456",
        name: "Far Foods",
        slug: "far-foods",
      },
    },
    {
      id: "store_disabled",
      metadata: {
        retailOps: {
          selfServiceDetection: {
            enabled: false,
            latitude: 6.5244,
            longitude: 3.3792,
            radiusMeters: 100,
          },
        },
      },
      name: "Disabled Store",
      slug: "disabled",
      tenant: {
        id: "tenant_789",
        name: "Disabled Foods",
        slug: "disabled-foods",
      },
    },
  ]

  return {
    client: {
      store: {
        findMany: async () => rows,
      },
    } as unknown as DbClient,
  }
}

describe("self-service store detection", () => {
  test("returns a high-confidence store match from store metadata", async () => {
    const db = createDetectionDb()
    const result = await resolveSelfServiceStoreFromCoordinates(db.client, {
      accuracyMeters: 25,
      latitude: 6.52441,
      longitude: 3.37921,
    })

    expect(result.status).toBe("confirmed")
    expect(result.match).toMatchObject({
      store: {
        id: "store_main",
        name: "Main Store",
      },
      tenant: {
        slug: "market-foods",
      },
    })
    expect(result.candidates.map((candidate) => candidate.store.id)).toEqual([
      "store_main",
    ])
  })

  test("requires manual fallback when no enabled store geofence matches", async () => {
    const db = createDetectionDb()
    const result = await resolveSelfServiceStoreFromCoordinates(db.client, {
      accuracyMeters: 20,
      latitude: 7.4,
      longitude: 3.9,
    })

    expect(result.status).toBe("manual_required")
    expect(result.match).toBeNull()
    expect(result.candidates).toEqual([])
  })

  test("requires customer confirmation for low-accuracy nearby locations", async () => {
    const db = createDetectionDb()
    const result = await resolveSelfServiceStoreFromCoordinates(db.client, {
      accuracyMeters: 300,
      latitude: 6.5245,
      longitude: 3.3792,
    })

    expect(result.status).toBe("needs_confirmation")
    expect(result.match?.store.id).toBe("store_main")
  })
})
