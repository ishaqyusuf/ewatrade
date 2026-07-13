import { describe, expect, test } from "bun:test"
import { RetailOpsSubscriptionError } from "./retail-ops-subscriptions"
import { createTenantStore } from "./stores"
import type { DbClient } from "./types"

type StoreCall = {
  data?: unknown
  kind: string
  select?: unknown
  where?: unknown
}

function createPlanRow(input?: { businessLimit?: number }) {
  return {
    description: "Growth plan",
    id: "plan_growth",
    key: "growth",
    limits: {
      businesses: input?.businessLimit ?? 3,
      offlineDevices: 5,
      products: 150,
      reportsHistoryDays: 180,
      staff: 10,
    },
    name: "Growth",
    priceLabel: "Most popular",
    supportLabel: "Priority support",
  }
}

function createMockStoreDb(input?: {
  existingSlugs?: string[]
  storeCount?: number
}) {
  const calls: StoreCall[] = []
  const existingSlugs = new Set(input?.existingSlugs ?? [])
  const growthPlan = createPlanRow()

  const db = {
    membership: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "membership.count", where })

        return 1
      },
    },
    offlineDevice: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "offlineDevice.findMany", where })

        return []
      },
    },
    offlineDeviceRevocation: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "offlineDeviceRevocation.findMany", where })

        return []
      },
    },
    onboardingSession: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ data, kind: "onboardingSession.create" })

        return { id: "onboarding_session_123" }
      },
    },
    product: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.count", where })

        return 0
      },
    },
    store: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.count", where })

        return input?.storeCount ?? 1
      },
      create: async ({
        data,
        select,
      }: {
        data: Record<string, unknown>
        select: unknown
      }) => {
        calls.push({ data, kind: "store.create", select })

        return {
          id: "store_123",
          name: data.name,
          slug: data.slug,
          status: data.status,
        }
      },
      findUnique: async ({
        where,
      }: {
        where: { tenantId_slug: { slug: string; tenantId: string } }
      }) => {
        calls.push({ kind: "store.findUnique", where })

        return existingSlugs.has(where.tenantId_slug.slug)
          ? { id: `existing_${where.tenantId_slug.slug}` }
          : null
      },
    },
    subscriptionPlan: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "subscriptionPlan.findMany", where })

        return [growthPlan]
      },
    },
    tenant: {
      findFirstOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "tenant.findFirstOrThrow", where })

        return {
          createdAt: new Date("2026-07-01T08:00:00.000Z"),
          id: "tenant_123",
          metadata: {},
          name: "Rice Store",
          slug: "rice-store",
          updatedAt: new Date("2026-07-12T08:00:00.000Z"),
        }
      },
    },
    tenantSubscription: {
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "tenantSubscription.findUnique", where })

        return {
          currentPeriodEndsAt: new Date("2026-08-01T08:00:00.000Z"),
          limitsSnapshot: growthPlan.limits,
          plan: growthPlan,
          planId: "plan_growth",
          status: "ACTIVE",
          trialEndsAt: null,
          updatedAt: new Date("2026-07-12T08:00:00.000Z"),
        }
      },
    },
  }

  return {
    calls,
    client: db as unknown as DbClient,
  }
}

function getCalls(calls: StoreCall[], kind: string) {
  return calls.filter((call) => call.kind === kind)
}

function getCall(calls: StoreCall[], kind: string) {
  const call = calls.find((entry) => entry.kind === kind)
  expect(call).toBeDefined()

  return call
}

describe("tenant store queries", () => {
  test("creates a tenant store with normalized setup metadata and unique slug", async () => {
    const db = createMockStoreDb({
      existingSlugs: ["main-branch"],
    })

    const store = await createTenantStore(db.client, {
      createdByUserId: " user_owner ",
      currencyCode: " ngn ",
      name: " Main Branch ",
      onboarding: {
        businessType: " Retail ",
        countryCode: " NG ",
        productCategory: " Food staples ",
        salesMethod: " In store ",
        teamSize: "   ",
      },
      supportEmail: " support@business.test ",
      supportPhone: " 08000000000 ",
      tenantId: "tenant_123",
    })

    expect(store).toMatchObject({
      id: "store_123",
      name: "Main Branch",
      slug: "main-branch-1",
      status: "ACTIVE",
    })
    expect(getCalls(db.calls, "store.findUnique")).toEqual([
      expect.objectContaining({
        where: {
          tenantId_slug: {
            slug: "main-branch",
            tenantId: "tenant_123",
          },
        },
      }),
      expect.objectContaining({
        where: {
          tenantId_slug: {
            slug: "main-branch-1",
            tenantId: "tenant_123",
          },
        },
      }),
    ])
    expect(getCall(db.calls, "store.count")).toMatchObject({
      where: {
        status: {
          not: "ARCHIVED",
        },
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "store.create")).toMatchObject({
      data: {
        currencyCode: "NGN",
        metadata: {
          retailOps: {
            onboarding: {
              businessType: "Retail",
              countryCode: "NG",
              currencyCode: "NGN",
              productCategory: "Food staples",
              salesMethod: "In store",
              source: "store_setup",
            },
          },
        },
        name: "Main Branch",
        slug: "main-branch-1",
        status: "ACTIVE",
        supportEmail: "support@business.test",
        supportPhone: "08000000000",
        tenantId: "tenant_123",
      },
    })
    expect(getCall(db.calls, "onboardingSession.create")).toMatchObject({
      data: {
        completed: true,
        formData: {
          currencyCode: "NGN",
          flow: "retail_ops_store_setup",
          onboarding: {
            businessType: "Retail",
            countryCode: "NG",
            currencyCode: "NGN",
            productCategory: "Food staples",
            salesMethod: "In store",
            source: "store_setup",
          },
          store: {
            id: "store_123",
            name: "Main Branch",
            slug: "main-branch-1",
          },
          supportEmail: "support@business.test",
          supportPhone: "08000000000",
        },
        step: 1,
        tenantId: "tenant_123",
        userId: "user_owner",
      },
    })
  })

  test("rejects store creation when the business entitlement is at limit", async () => {
    const db = createMockStoreDb({
      storeCount: 3,
    })

    await expect(
      createTenantStore(db.client, {
        name: "Overflow branch",
        tenantId: "tenant_123",
      }),
    ).rejects.toBeInstanceOf(RetailOpsSubscriptionError)

    expect(getCall(db.calls, "store.count")).toMatchObject({
      where: {
        status: {
          not: "ARCHIVED",
        },
        tenantId: "tenant_123",
      },
    })
    expect(getCalls(db.calls, "store.create")).toHaveLength(0)
    expect(getCalls(db.calls, "onboardingSession.create")).toHaveLength(0)
  })

  test("stores dry-cleaning and other business template onboarding snapshots", async () => {
    const dryCleaningDb = createMockStoreDb()

    await createTenantStore(dryCleaningDb.client, {
      currencyCode: "NGN",
      name: "Sparkle Laundry",
      onboarding: {
        businessTemplateKey: "dry_cleaning_laundry",
        businessType: "Dry Cleaning / Laundry",
        serviceCategory: "Laundry and ironing",
        teamSize: "2-5 people",
      },
      tenantId: "tenant_123",
    })

    expect(getCall(dryCleaningDb.calls, "store.create")).toMatchObject({
      data: {
        metadata: {
          retailOps: {
            businessTemplate: {
              key: "dry_cleaning_laundry",
              label: "Dry Cleaning / Laundry",
            },
            dryCleaning: {
              notificationIntents: [],
              serviceItems: [],
              serviceOrders: [],
              serviceRequestLinks: [],
              serviceRequests: [],
            },
            onboarding: {
              businessTemplateKey: "dry_cleaning_laundry",
              businessTemplateLabel: "Dry Cleaning / Laundry",
              serviceCategory: "Laundry and ironing",
            },
          },
        },
      },
    })

    const otherDb = createMockStoreDb()

    await createTenantStore(otherDb.client, {
      currencyCode: "GHS",
      name: "Rental Desk",
      onboarding: {
        businessTemplateKey: "other_generic",
        businessType: "Other business",
        offeringCategory: "Equipment rentals",
        orderChannels: ["Phone", "WhatsApp"],
        otherBusinessDescription: "Equipment rental service",
        requestedCapabilities: ["bookings", "deposits"],
      },
      tenantId: "tenant_123",
    })

    expect(getCall(otherDb.calls, "store.create")).toMatchObject({
      data: {
        metadata: {
          retailOps: {
            businessTemplate: {
              key: "other_generic",
              label: "Other business",
            },
            onboarding: {
              businessTemplateKey: "other_generic",
              businessTemplateLabel: "Other business",
              offeringCategory: "Equipment rentals",
              orderChannels: ["Phone", "WhatsApp"],
              otherBusinessDescription: "Equipment rental service",
              requestedCapabilities: ["bookings", "deposits"],
            },
            unsupportedBusinessDemand: {
              description: "Equipment rental service",
              requestedCapabilities: ["bookings", "deposits"],
            },
          },
        },
      },
    })
  })
})
