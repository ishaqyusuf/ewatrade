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
  serviceJob?: unknown
  staff?: unknown
}) {
  const calls: QueryCall[] = []

  function findFirst(kind: string, value: unknown) {
    return async ({ where }: { where: unknown }) => {
      calls.push({ kind, where })
      return value ?? null
    }
  }

  const db = {
    catalogItem: {
      findFirst: findFirst("catalogItem.findFirst", input?.activeSellableItem),
      findMany: async ({
        take,
        where,
      }: {
        take?: number
        where: unknown
      }) => {
        calls.push({ kind: "catalogItem.findMany", take, where })
        return (input?.catalogKinds ?? []).map((kind) => ({ kind }))
      },
    },
    commercialOrder: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const isCustomerQuery = "OR" in where
        calls.push({
          kind: isCustomerQuery
            ? "commercialOrder.findFirst.customer"
            : "commercialOrder.findFirst.order",
          where,
        })
        return isCustomerQuery
          ? (input?.customer ?? null)
          : (input?.order ?? null)
      },
    },
    membership: {
      findFirst: findFirst("membership.findFirst", input?.staff),
    },
    serviceJob: {
      findFirst: findFirst("serviceJob.findFirst", input?.serviceJob),
    },
    stockOperation: {
      findFirst: findFirst(
        "stockOperation.findFirst",
        input?.inventoryActivity,
      ),
    },
  }

  return { calls, client: db as unknown as DbClient }
}

describe("workspace feature availability", () => {
  test("keeps a new workspace focused", () => {
    expect(presence()).toEqual({
      hasActiveSellableItems: false,
      hasCatalogItems: false,
      hasCustomers: false,
      hasInventoryActivity: false,
      hasOrders: false,
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
    expect(db.calls).toContainEqual({
      kind: "commercialOrder.findFirst.order",
      where: { storeId: "store_a", tenantId: "tenant_a" },
    })
    expect(db.calls).toContainEqual({
      kind: "membership.findFirst",
      where: {
        role: { in: ["ADMIN", "MANAGER", "CASHIER", "OPERATOR"] },
        tenantId: "tenant_a",
      },
    })
    expect(
      db.calls.find((call) => call.kind === "catalogItem.findMany"),
    ).toMatchObject({
      take: 2,
      where: {
        tenantId: "tenant_a",
        offerings: {
          some: {
            storeAvailability: {
              some: { storeId: "store_a" },
            },
          },
        },
      },
    })
    expect(
      db.calls.find((call) => call.kind === "catalogItem.findMany")?.where,
    ).not.toHaveProperty("status")
    expect(
      db.calls.find((call) => call.kind === "catalogItem.findFirst"),
    ).toMatchObject({
      where: {
        offerings: {
          some: {
            fixedPriceMinor: { not: null },
            pricingPolicy: "FIXED",
          },
        },
      },
    })
    expect(
      db.calls.find((call) => call.kind === "membership.findFirst")?.where,
    ).not.toHaveProperty("status")
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
    for (const call of db.calls.filter((entry) =>
      [
        "commercialOrder.findFirst.order",
        "commercialOrder.findFirst.customer",
        "serviceJob.findFirst",
        "stockOperation.findFirst",
      ].includes(entry.kind),
    )) {
      expect(call.where).toMatchObject({
        storeId: "store_without_history",
        tenantId: "tenant_a",
      })
    }
  })
})
