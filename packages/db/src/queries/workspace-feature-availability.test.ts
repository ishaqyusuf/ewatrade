import { describe, expect, test } from "bun:test"
import type { DbClient } from "./types"
import {
  deriveWorkspaceFeatureAvailability,
  getWorkspaceFeatureAvailability,
} from "./workspace-feature-availability"

type QueryCall = {
  kind: string
  take?: number
  where: unknown
}

function presence(
  overrides: Partial<
    Parameters<typeof deriveWorkspaceFeatureAvailability>[0]
  > = {},
) {
  return deriveWorkspaceFeatureAvailability({
    activeSellableItem: null,
    catalogKinds: [],
    customer: null,
    inventoryActivity: null,
    order: null,
    prescriptionCommerce: null,
    serviceJob: null,
    staff: null,
    storeId: "store_a",
    ...overrides,
  })
}

function createMockDb(input?: {
  activeSellableItem?: unknown
  catalogKinds?: Array<"PRODUCT" | "SERVICE">
  customer?: unknown
  inventoryActivity?: unknown
  order?: unknown
  prescriptionCommerce?: unknown
  serviceJob?: unknown
  staff?: unknown
}) {
  const calls: QueryCall[] = []
  const db = {
    $queryRaw: async (query: { text: string; values: unknown[] }) => {
      calls.push({ kind: "presence", where: query })
      return [
        {
          hasActiveSellableItems: input?.activeSellableItem != null,
          hasProductItems: input?.catalogKinds?.includes("PRODUCT") ?? false,
          hasServiceItems: input?.catalogKinds?.includes("SERVICE") ?? false,
          hasCustomers: input?.customer != null,
          hasInventoryActivity: input?.inventoryActivity != null,
          hasOrders: input?.order != null,
          hasPrescriptionCommerce: input?.prescriptionCommerce != null,
          hasServiceJobs: input?.serviceJob != null,
          hasStaff: input?.staff != null,
        },
      ]
    },
  }
  return { calls, client: db as unknown as DbClient }
}

describe("workspace feature availability", () => {
  test("reads Overview feature presence without nine separate database acquisitions", async () => {
    const db = createMockDb({
      catalogKinds: ["PRODUCT"],
      order: { id: "order" },
    })
    await getWorkspaceFeatureAvailability(db.client, {
      storeId: "store_a",
      tenantId: "tenant_a",
    })
    expect(db.calls.length).toBe(1)
  })
  test("keeps a new workspace focused", () => {
    expect(presence()).toEqual({
      hasActiveSellableItems: false,
      hasCatalogItems: false,
      hasCustomers: false,
      hasInventoryActivity: false,
      hasOrders: false,
      hasPrescriptionCommerce: false,
      hasProductItems: false,
      hasReportableActivity: false,
      hasServiceItems: false,
      hasServiceJobs: false,
      hasStaff: false,
      storeId: "store_a",
    })
  })

  test("reveals product and service catalog capabilities independently", () => {
    expect(
      presence({
        activeSellableItem: { id: "offering" },
        catalogKinds: ["PRODUCT"],
      }),
    ).toMatchObject({
      hasActiveSellableItems: true,
      hasCatalogItems: true,
      hasProductItems: true,
      hasServiceItems: false,
    })
    expect(presence({ catalogKinds: ["SERVICE"] })).toMatchObject({
      hasCatalogItems: true,
      hasProductItems: false,
      hasServiceItems: true,
      hasServiceJobs: false,
    })
  })

  test("reveals the first order and identified customer independently", () => {
    expect(presence({ order: { id: "order" } })).toMatchObject({
      hasCustomers: false,
      hasOrders: true,
      hasReportableActivity: true,
    })
    expect(
      presence({
        customer: { id: "identified_order" },
        order: { id: "order" },
      }),
    ).toMatchObject({
      hasCustomers: true,
      hasOrders: true,
    })
  })

  test("does not infer Service Jobs from a Service catalog item", () => {
    expect(presence({ catalogKinds: ["SERVICE"] })).toMatchObject({
      hasServiceItems: true,
      hasServiceJobs: false,
      hasReportableActivity: false,
    })
    expect(
      presence({
        catalogKinds: ["SERVICE"],
        serviceJob: { id: "first_job" },
      }),
    ).toMatchObject({
      hasServiceItems: true,
      hasServiceJobs: true,
      hasReportableActivity: true,
    })
  })

  test("reveals operational history without requiring current records", () => {
    expect(
      presence({
        customer: { id: "customer_order" },
        inventoryActivity: { id: "stock_operation" },
        order: { id: "order" },
        serviceJob: { id: "job" },
        staff: { id: "removed_membership" },
      }),
    ).toMatchObject({
      hasCustomers: true,
      hasInventoryActivity: true,
      hasOrders: true,
      hasReportableActivity: true,
      hasServiceJobs: true,
      hasStaff: true,
    })
  })

  test("reveals Prescription Commerce only after Store activation", () => {
    expect(presence()).toMatchObject({ hasPrescriptionCommerce: false })
    expect(
      presence({ prescriptionCommerce: { id: "prescription_settings" } }),
    ).toMatchObject({ hasPrescriptionCommerce: true })
  })

  test("scopes operational reads to the active store and staff to the tenant", async () => {
    const db = createMockDb({
      catalogKinds: ["PRODUCT"],
      order: { id: "order" },
      staff: { id: "staff" },
    })

    const result = await getWorkspaceFeatureAvailability(db.client, {
      storeId: "store_a",
      tenantId: "tenant_a",
    })

    expect(result).toMatchObject({
      hasOrders: true,
      hasProductItems: true,
      hasStaff: true,
      storeId: "store_a",
    })
    expect(db.calls).toHaveLength(1)
    const query = db.calls[0]?.where as { text: string; values: unknown[] }
    expect(query.text).not.toContain("tenant_a")
    expect(query.text).not.toContain("store_a")
    expect(query.values).toContain("tenant_a")
    expect(query.values).toContain("store_a")
    expect(query.text).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i,
    )
  })

  test("keeps store-scoped operational history isolated", async () => {
    const db = createMockDb()

    const result = await getWorkspaceFeatureAvailability(db.client, {
      storeId: "store_without_history",
      tenantId: "tenant_a",
    })

    expect(result).toMatchObject({
      hasCatalogItems: false,
      hasOrders: false,
      hasServiceJobs: false,
      hasStaff: false,
      storeId: "store_without_history",
    })
    const query = db.calls[0]?.where as { text: string; values: unknown[] }
    expect(query.values).toContain("store_without_history")
    expect(query.values).toContain("tenant_a")
    expect(query.text).not.toContain("store_without_history")
  })
})

// The real PostgreSQL matrix in fixtures/workspace-feature-presence.fixture.ts
// verifies all scope/status/history predicates with the actual projection SQL.
test("availability stays current across calls and propagates read failure", async () => {
  let calls = 0
  const db = {
    $queryRaw: async () => {
      calls++
      if (calls === 3) throw new Error("inert database failure")
      return [{ hasOrders: calls === 1 }]
    },
  } as unknown as DbClient
  expect(
    (
      await getWorkspaceFeatureAvailability(db, {
        tenantId: "tenant",
        storeId: "store",
      })
    ).hasOrders,
  ).toBe(true)
  expect(
    (
      await getWorkspaceFeatureAvailability(db, {
        tenantId: "tenant",
        storeId: "store",
      })
    ).hasOrders,
  ).toBe(false)
  await expect(
    getWorkspaceFeatureAvailability(db, {
      tenantId: "tenant",
      storeId: "store",
    }),
  ).rejects.toThrow("inert database failure")
  expect(calls).toBe(3)
})
