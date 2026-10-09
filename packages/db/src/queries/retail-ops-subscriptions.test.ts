import { describe, expect, test } from "bun:test"
import { getRetailOpsOrderPeriodStart } from "./retail-ops-subscription-plans"
import {
  RetailOpsSubscriptionError,
  assertRetailOpsOrderAllowance,
  assertRetailOpsPlanIdFeature,
  assertRetailOpsProductAllowance,
  createRetailOpsSubscriptionCheckoutIntent,
  getRetailOpsSubscriptionSnapshot,
  registerRetailOpsOfflineDevice,
  resolveRetailOpsPlanId,
} from "./retail-ops-subscriptions"
import type { DbClient } from "./types"

type SubscriptionCall = {
  data?: unknown
  kind: string
  where?: unknown
}

function createTenantRow(input?: { metadata?: unknown }) {
  return {
    createdAt: new Date("2026-07-01T08:00:00.000Z"),
    id: "tenant_123",
    metadata: input?.metadata ?? {},
    name: "Rice Store",
    slug: "rice-store",
    updatedAt: new Date("2026-07-12T08:00:00.000Z"),
  }
}

function createGrowthPlanRow() {
  return {
    description: "Growth plan",
    id: "plan_growth",
    key: "growth",
    limits: {
      businesses: 3,
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

function createMockSnapshotDb(
  subscriptionOverride: Record<string, unknown> = {},
) {
  const calls: SubscriptionCall[] = []
  const tenant = createTenantRow()
  const growthPlan = createGrowthPlanRow()

  const db = {
    membership: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "membership.count", where })

        return 3
      },
    },
    offlineDevice: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "offlineDevice.findMany", where })

        return [
          {
            appVersion: "1.0.0",
            deviceId: "device_android",
            deviceName: "Owner phone",
            id: "offline_device_1",
            lastSeenAt: new Date("2026-07-12T08:30:00.000Z"),
            platform: "ANDROID",
            registeredAt: new Date("2026-07-12T08:00:00.000Z"),
            registeredByUserId: "user_owner",
            storeId: "store_123",
          },
          {
            appVersion: "1.0.0",
            deviceId: "device_ios",
            deviceName: "Manager phone",
            id: "offline_device_2",
            lastSeenAt: new Date("2026-07-12T08:20:00.000Z"),
            platform: "IOS",
            registeredAt: new Date("2026-07-12T08:05:00.000Z"),
            registeredByUserId: "user_manager",
            storeId: "store_123",
          },
        ]
      },
    },
    offlineDeviceRevocation: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "offlineDeviceRevocation.findMany", where })

        return []
      },
    },
    commercialOrder: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "commercialOrder.count", where })

        return 7
      },
    },
    catalogItem: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "catalogItem.count", where })

        return 12
      },
    },
    store: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.count", where })

        return 2
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

        return tenant
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
          ...subscriptionOverride,
        }
      },
    },
  }

  return {
    calls,
    client: db as unknown as DbClient,
  }
}

function createMockCheckoutDb() {
  const calls: SubscriptionCall[] = []
  const tenant = createTenantRow()

  const db = {
    billingCheckoutSession: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ data, kind: "billingCheckoutSession.create" })

        return {
          createdAt: new Date("2026-07-12T09:00:00.000Z"),
          id: "checkout_session_123",
        }
      },
    },
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
    commercialOrder: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "commercialOrder.count", where })

        return 7
      },
    },
    catalogItem: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "catalogItem.count", where })

        return 2
      },
    },
    store: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.count", where })

        return 1
      },
    },
    subscriptionPlan: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "subscriptionPlan.findMany", where })

        return []
      },
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "subscriptionPlan.upsert",
          where,
        })

        return { id: "plan_pro" }
      },
    },
    tenant: {
      findFirstOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "tenant.findFirstOrThrow", where })

        return tenant
      },
    },
    tenantSubscription: {
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "tenantSubscription.findUnique", where })

        return null
      },
    },
  }

  return {
    calls,
    client: db as unknown as DbClient,
  }
}

function createMockOfflineDeviceDb() {
  const calls: SubscriptionCall[] = []
  const tenant = createTenantRow()
  const registeredAt = new Date("2026-07-12T10:00:00.000Z")

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
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "offlineDevice.findUnique", where })

        return null
      },
      upsert: async ({ create, update, where }: Record<string, unknown>) => {
        calls.push({
          data: {
            create,
            update,
          },
          kind: "offlineDevice.upsert",
          where,
        })

        return {
          appVersion: "1.0.0",
          deviceId: "device_android",
          deviceName: "Owner phone",
          id: "offline_device_123",
          lastSeenAt: registeredAt,
          platform: "ANDROID",
          registeredAt,
          registeredByUserId: "user_owner",
          storeId: "store_123",
        }
      },
    },
    offlineDeviceRevocation: {
      findFirst: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "offlineDeviceRevocation.findFirst", where })

        return null
      },
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "offlineDeviceRevocation.findMany", where })

        return []
      },
    },
    commercialOrder: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "commercialOrder.count", where })

        return 7
      },
    },
    catalogItem: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "catalogItem.count", where })

        return 1
      },
    },
    store: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "store.count", where })

        return 1
      },
    },
    subscriptionPlan: {
      findMany: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "subscriptionPlan.findMany", where })

        return []
      },
    },
    tenant: {
      findFirstOrThrow: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "tenant.findFirstOrThrow", where })

        return tenant
      },
    },
    tenantSubscription: {
      findUnique: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "tenantSubscription.findUnique", where })

        return null
      },
    },
  }

  return {
    calls,
    client: db as unknown as DbClient,
    registeredAt,
  }
}

function getCall(calls: SubscriptionCall[], kind: string) {
  const call = calls.find((entry) => entry.kind === kind)
  if (!call) {
    throw new Error(`Expected ${kind} call`)
  }

  return call
}

describe("retail ops subscription queries", () => {
  test("returns durable subscription snapshot with usage and entitlement limits", async () => {
    const db = createMockSnapshotDb()

    const snapshot = await getRetailOpsSubscriptionSnapshot(db.client, {
      tenantId: "tenant_123",
    })

    expect(snapshot).toMatchObject({
      plan: {
        id: "growth",
        limits: {
          businesses: 3,
          offlineDevices: 5,
          products: 150,
          reportsHistoryDays: 180,
          staff: 10,
        },
        name: "Growth",
      },
      subscription: {
        currentPeriodEndsAt: "2026-08-01T08:00:00.000Z",
        planId: "growth",
        source: "tenant_subscription",
        status: "active",
        trialEndsAt: null,
        updatedAt: "2026-07-12T08:00:00.000Z",
      },
      tenant: {
        id: "tenant_123",
        name: "Rice Store",
        slug: "rice-store",
      },
      usage: {
        businesses: 2,
        offlineDevices: 2,
        ordersThisMonth: 7,
        products: 12,
        staff: 3,
      },
    })
    expect(snapshot.plans.map((plan) => plan.id)).toEqual([
      "free",
      "starter",
      "growth",
      "pro",
    ])
    // Durable rows predating ordersPerMonth stay unlimited; the catalogue
    // label replaces the row's legacy "Most popular".
    expect(snapshot.plan.limits.ordersPerMonth).toBeNull()
    expect(snapshot.plan.priceLabel).toBe("Free during launch")
    expect(snapshot.entitlements).toContainEqual({
      isAtLimit: false,
      key: "ordersPerMonth",
      limit: null,
      used: 7,
    })
    expect(snapshot.entitlements).toContainEqual({
      isAtLimit: false,
      key: "offlineDevices",
      limit: 5,
      used: 2,
    })
    expect(getCall(db.calls, "membership.count").where).toMatchObject({
      role: {
        in: ["CASHIER", "MANAGER", "OPERATOR"],
      },
      status: {
        in: ["ACTIVE", "INVITED", "SUSPENDED"],
      },
      tenantId: "tenant_123",
    })
    expect(getCall(db.calls, "catalogItem.count").where).toEqual({
      tenantId: "tenant_123",
      status: { not: "ARCHIVED" },
    })
  })

  test("removes expired store access from the actual subscription snapshot", async () => {
    const db = createMockSnapshotDb({
      provider: "PLAY_STORE",
      currentPeriodEndsAt: new Date("2020-01-01T00:00:00.000Z"),
    })

    const snapshot = await getRetailOpsSubscriptionSnapshot(db.client, {
      tenantId: "tenant_123",
    })

    expect(snapshot.subscription.status).toBe("cancelled")
    expect(snapshot.plan.limits).toEqual({
      businesses: 0,
      offlineDevices: 0,
      ordersPerMonth: 0,
      products: 0,
      reportsHistoryDays: 0,
      staff: 0,
    })
    expect(snapshot.entitlements).toContainEqual({
      isAtLimit: true,
      key: "products",
      limit: 0,
      used: 12,
    })
  })

  test("creates provider-neutral checkout intent for a non-current tier", async () => {
    const db = createMockCheckoutDb()

    const intent = await createRetailOpsSubscriptionCheckoutIntent(db.client, {
      planId: "pro",
      requestedByUserId: "user_owner",
      surface: "mobile",
      tenantId: "tenant_123",
    })

    expect(intent).toMatchObject({
      checkoutUrl: null,
      createdAt: "2026-07-12T09:00:00.000Z",
      currentPlan: {
        id: "starter",
      },
      intent: {
        id: "checkout_session_123",
        requestedByUserId: "user_owner",
        status: "provider_not_configured",
        surface: "mobile",
      },
      provider: "none",
      targetPlan: {
        id: "pro",
      },
      tenant: {
        id: "tenant_123",
      },
    })
    expect(intent.message).toContain("Billing checkout is not configured yet")

    const planUpsert = getCall(db.calls, "subscriptionPlan.upsert")
    expect(planUpsert.where).toEqual({ key: "pro" })
    expect(planUpsert.data).toMatchObject({
      create: {
        isActive: true,
        key: "pro",
        name: "Pro",
      },
    })

    const checkoutCreate = getCall(db.calls, "billingCheckoutSession.create")
    expect(checkoutCreate.data).toMatchObject({
      planId: "plan_pro",
      provider: "NONE",
      requestedByUserId: "user_owner",
      status: "CREATED",
      surface: "mobile",
      tenantId: "tenant_123",
      tenantSubscriptionId: null,
    })
    expect(
      String((checkoutCreate.data as Record<string, unknown>).externalId),
    ).toContain("retail_ops_checkout:tenant_123:pro:user_owner:")
  })

  test("registers a durable offline device inside the active plan limit", async () => {
    const db = createMockOfflineDeviceDb()

    const device = await registerRetailOpsOfflineDevice(db.client, {
      actorUserId: "user_owner",
      appVersion: " 1.0.0 ",
      deviceId: " device_android ",
      deviceName: " Owner phone ",
      platform: "android",
      storeId: "store_123",
      tenantId: "tenant_123",
    })

    expect(device).toEqual({
      actorUserId: "user_owner",
      appVersion: "1.0.0",
      deviceId: "device_android",
      deviceName: "Owner phone",
      lastSeenAt: db.registeredAt.toISOString(),
      platform: "android",
      registeredAt: db.registeredAt.toISOString(),
      storeId: "store_123",
    })

    const upsert = getCall(db.calls, "offlineDevice.upsert")
    expect(upsert.where).toEqual({
      tenantId_deviceId: {
        deviceId: "device_android",
        tenantId: "tenant_123",
      },
    })
    expect(upsert.data).toMatchObject({
      create: {
        appVersion: "1.0.0",
        deviceId: "device_android",
        deviceName: "Owner phone",
        platform: "ANDROID",
        registeredByUserId: "user_owner",
        status: "ACTIVE",
        storeId: "store_123",
        tenantId: "tenant_123",
      },
      update: {
        appVersion: "1.0.0",
        deviceName: "Owner phone",
        platform: "ANDROID",
        registeredByUserId: "user_owner",
        revokedAt: null,
        revokedByUserId: null,
        status: "ACTIVE",
        storeId: "store_123",
      },
    })
  })
})

function createPlanDb(input: {
  durablePlan?: Record<string, unknown>
  metadata?: unknown
  orders?: number
  products?: number
}) {
  const calls: SubscriptionCall[] = []
  const tenant = createTenantRow({ metadata: input.metadata })
  const db = {
    $executeRaw: async () => 1,
    catalogItem: { count: async () => input.products ?? 0 },
    commercialOrder: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "commercialOrder.count", where })
        return input.orders ?? 0
      },
    },
    membership: { count: async () => 0 },
    offlineDevice: { findMany: async () => [] },
    offlineDeviceRevocation: { findMany: async () => [] },
    store: { count: async () => 1 },
    subscriptionPlan: {
      findMany: async () => (input.durablePlan ? [input.durablePlan] : []),
    },
    tenant: {
      findFirstOrThrow: async () => tenant,
      findUniqueOrThrow: async () => tenant,
    },
    tenantSubscription: {
      findUnique: async () =>
        input.durablePlan
          ? {
              currentPeriodEndsAt: null,
              limitsSnapshot: input.durablePlan.limits,
              plan: input.durablePlan,
              planId: "plan_row",
              status: "ACTIVE",
              trialEndsAt: null,
              updatedAt: new Date("2026-10-01T00:00:00.000Z"),
            }
          : null,
    },
  }

  return { calls, client: db as unknown as DbClient }
}

const FREE_METADATA = { retailOps: { subscription: { planId: "free" } } }

describe("Free plan and launch default", () => {
  test("a business without a record is on the launch Starter plan, not a trial", async () => {
    const snapshot = await getRetailOpsSubscriptionSnapshot(
      createPlanDb({}).client,
      { tenantId: "tenant_123" },
    )

    expect(snapshot.plan.id).toBe("starter")
    expect(snapshot.plan.priceLabel).toBe("Free during launch")
    expect(snapshot.subscription).toMatchObject({
      source: "launch_default",
      status: "active",
      trialEndsAt: null,
    })
  })

  test("resolves Free from metadata with its caps and no paid features", async () => {
    const snapshot = await getRetailOpsSubscriptionSnapshot(
      createPlanDb({ metadata: FREE_METADATA, orders: 12 }).client,
      { tenantId: "tenant_123" },
    )

    expect(snapshot.plan).toMatchObject({
      features: [],
      id: "free",
      limits: { ordersPerMonth: 30, products: 2, staff: 0 },
    })
    expect(snapshot.entitlements).toContainEqual({
      isAtLimit: true,
      key: "staff",
      limit: 0,
      used: 0,
    })
    expect(snapshot.entitlements).toContainEqual({
      isAtLimit: false,
      key: "ordersPerMonth",
      limit: 30,
      used: 12,
    })
  })

  test("resolves the context plan id from durable key, metadata, then default", () => {
    expect(
      resolveRetailOpsPlanId({
        metadata: FREE_METADATA,
        subscriptionPlanKey: "growth",
      }),
    ).toBe("growth")
    expect(resolveRetailOpsPlanId({ metadata: FREE_METADATA })).toBe("free")
    expect(
      resolveRetailOpsPlanId({ metadata: {}, subscriptionPlanKey: "legacy" }),
    ).toBe("starter")
  })

  test("durable limits keep JSON null as unlimited and numbers as caps", async () => {
    const plan = {
      description: null,
      id: "plan_row",
      key: "starter",
      limits: { ordersPerMonth: 500 },
      name: "Starter",
      priceLabel: "Trial",
      supportLabel: null,
    }
    const capped = await getRetailOpsSubscriptionSnapshot(
      createPlanDb({ durablePlan: plan }).client,
      { tenantId: "tenant_123" },
    )
    expect(capped.plan.limits.ordersPerMonth).toBe(500)
    expect(capped.plan.priceLabel).toBe("Free during launch")

    const unlimited = await getRetailOpsSubscriptionSnapshot(
      createPlanDb({
        durablePlan: { ...plan, limits: { ordersPerMonth: null } },
      }).client,
      { tenantId: "tenant_123" },
    )
    expect(unlimited.plan.limits.ordersPerMonth).toBeNull()
  })

  test("blocks the 31st Free order in a UTC calendar month", async () => {
    const now = new Date("2026-10-31T23:30:00.000-05:00")
    const atCap = createPlanDb({ metadata: FREE_METADATA, orders: 30 })
    const error = await assertRetailOpsOrderAllowance(atCap.client, {
      now,
      tenantId: "tenant_123",
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RetailOpsSubscriptionError)
    expect(error).toMatchObject({
      code: "ENTITLEMENT_LIMIT_REACHED",
      entitlement: { key: "ordersPerMonth", limit: 30, used: 30 },
      message:
        "Free includes 30 orders a month. Upgrade your plan to record more orders this month.",
    })
    // 23:30 in UTC-5 is already 1 November in UTC.
    expect(atCap.calls[0]?.where).toEqual({
      createdAt: { gte: new Date("2026-11-01T00:00:00.000Z") },
      tenantId: "tenant_123",
    })

    await assertRetailOpsOrderAllowance(
      createPlanDb({ metadata: FREE_METADATA, orders: 29 }).client,
      { now, tenantId: "tenant_123" },
    )
  })

  test("uncapped plans skip the monthly order count", async () => {
    const starter = createPlanDb({ orders: 10_000 })

    await assertRetailOpsOrderAllowance(starter.client, {
      tenantId: "tenant_123",
    })
    expect(starter.calls).toEqual([])
  })

  test("enforces the two-product cap only on Free", async () => {
    await expect(
      assertRetailOpsProductAllowance(
        createPlanDb({ metadata: FREE_METADATA, products: 2 }).client,
        { tenantId: "tenant_123" },
      ),
    ).rejects.toMatchObject({
      message: "Free includes 2 products. Upgrade your plan to add more.",
    })
    await assertRetailOpsProductAllowance(
      createPlanDb({ metadata: FREE_METADATA, products: 1 }).client,
      { tenantId: "tenant_123" },
    )
    await assertRetailOpsProductAllowance(
      createPlanDb({ products: 40 }).client,
      { tenantId: "tenant_123" },
    )
  })

  test("gates Free features with upgrade messages", () => {
    expect(() => assertRetailOpsPlanIdFeature("free", "finance")).toThrow(
      "Upgrade from Free to use finance.",
    )
    expect(() => assertRetailOpsPlanIdFeature("free", "invoices")).toThrow(
      "Upgrade from Free to generate receipts.",
    )
    expect(assertRetailOpsPlanIdFeature("starter", "finance").id).toBe(
      "starter",
    )
    expect(
      getRetailOpsOrderPeriodStart(new Date("2026-02-28T10:00:00Z")),
    ).toEqual(new Date("2026-02-01T00:00:00.000Z"))
  })
})
