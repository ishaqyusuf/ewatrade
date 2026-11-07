import { describe, expect, test } from "bun:test"
import { getOwnerBusinessCreationAllowance } from "./owner-businesses"
import { getRetailOpsOrderPeriodStart } from "./retail-ops-subscription-plans"
import {
  RetailOpsSubscriptionError,
  assertRetailOpsEntitlementAvailable,
  assertRetailOpsOrderAllowance,
  assertRetailOpsPlanIdFeature,
  assertRetailOpsProductAllowance,
  createRetailOpsSubscriptionCheckoutIntent,
  getRetailOpsOwnerPlanId,
  getRetailOpsOwnerPlanIds,
  getRetailOpsSubscriptionSnapshot,
  getRetailOpsTenantPlan,
  registerRetailOpsOfflineDevice,
  resolveRetailOpsPlanId,
  withOwnerSignupSubscription,
} from "./retail-ops-subscriptions"
import type { DbClient } from "./types"

async function withPaidRuntime(work: () => Promise<void>) {
  const keys = ["OWNER_BILLING_ENABLED", "STORE_BILLING_ENVIRONMENT"] as const
  const saved = keys.map((key) => process.env[key])
  process.env.OWNER_BILLING_ENABLED = "true"
  process.env.STORE_BILLING_ENVIRONMENT = "sandbox"
  try {
    await work()
  } finally {
    keys.forEach((key, i) => {
      const value = saved[i]
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    })
  }
}

function ownerPlanFixture() {
  const metadata = withOwnerSignupSubscription({}, "growth")
  const base = createPlanDb({ metadata, products: 1000, orders: 50 })
  const state = {
    planId: "growth",
    status: "ACTIVE",
    expires: new Date(Date.now() + 5 * 86400000),
    owned: true,
    enrolled: true,
    activeOwner: true,
    businessCount: 1,
    legacyGrant: false,
  }
  const calls: string[] = []
  const db = {
    ...base.client,
    $executeRaw: async () => {
      calls.push("lock")
      return 1
    },
    catalogItem: {
      count: async () => {
        calls.push("count")
        return 1000
      },
    },
    tenant: {
      ...base.client.tenant,
      findMany: async () => [{ id: "tenant_123", metadata }],
    },
    membership: {
      count: async () => 3,
      findMany: async () =>
        state.owned
          ? Array.from({ length: state.businessCount }, (_, index) => ({
              tenantId: index ? `extra_${index}` : "tenant_123",
              tenant: {
                metadata: state.legacyGrant
                  ? { retailOps: { subscription: { planId: "pro" } } }
                  : metadata,
                subscription: null,
              },
            }))
          : [],
    },
    ownerBillingAccount: {
      findUnique: async () => ({ id: "account", ownerUserId: "owner" }),
    },
    user: {
      findMany: async () => (state.activeOwner ? [{ id: "owner" }] : []),
    },
    ownerBusinessCoverage: {
      findUnique: async () =>
        state.enrolled ? { accountId: "account" } : null,
      findMany: async () =>
        state.enrolled
          ? [
              {
                accountId: "account",
                tenantId: "tenant_123",
                enrolledAt: new Date("2026-01-01"),
              },
            ]
          : [],
    },
    ownerBillingSubscription: {
      findUnique: async () => ({
        accountId: "account",
        provider: "PLAY_STORE",
        environment: "sandbox",
        purchaseDigest: "verified",
        planId: state.planId,
        status: state.status,
        currentPeriodEndsAt: state.expires,
      }),
    },
  }
  return { db: db as unknown as DbClient, state, calls, metadata }
}

test("separate business creation uses verified capacity, retains old grants and leaves surplus businesses intact", async () =>
  withPaidRuntime(async () => {
    const { db, state, calls } = ownerPlanFixture()
    state.businessCount = 3
    expect(await getOwnerBusinessCreationAllowance(db, "owner")).toEqual({
      used: 3,
      limit: 3,
    })
    expect(calls).toEqual(["lock", "lock"])
    state.expires = new Date(Date.now() - 1)
    expect(await getOwnerBusinessCreationAllowance(db, "owner")).toEqual({
      used: 3,
      limit: 1,
    })
    expect(state.businessCount).toBe(3)
    state.legacyGrant = true
    expect(await getOwnerBusinessCreationAllowance(db, "owner")).toEqual({
      used: 3,
      limit: 10,
    })
  }))

test("paid-cohort expiry reduces new-admission quotas without hiding retained operations or mutating records", async () =>
  withPaidRuntime(async () => {
    const { db, state } = ownerPlanFixture()
    const input = { tenantId: "tenant_123" }
    expect((await getRetailOpsTenantPlan(db, input)).plan).toMatchObject({
      id: "growth",
      limits: { products: 1000, ordersPerMonth: null, staff: 10 },
    })
    await assertRetailOpsOrderAllowance(db, input)
    state.expires = new Date(Date.now() - 1)
    const expired = await getRetailOpsTenantPlan(db, input)
    expect(expired.plan).toMatchObject({
      id: "free",
      limits: {
        products: 10,
        ordersPerMonth: 50,
        staff: 0,
        reportsHistoryDays: 180,
      },
    })
    expect(expired.plan.features).toContain("finance")
    expect(expired.subscription.source).toBe("owner_billing_free")
    expect(await getRetailOpsOwnerPlanId(db, input.tenantId)).toBe("growth")
    await expect(
      assertRetailOpsProductAllowance(db, input),
    ).rejects.toMatchObject({ entitlement: { limit: 10, used: 1000 } })
    await expect(
      assertRetailOpsOrderAllowance(db, input),
    ).rejects.toMatchObject({ entitlement: { limit: 50, used: 50 } })
    await expect(
      assertRetailOpsEntitlementAvailable(db, { ...input, key: "staff" }),
    ).rejects.toMatchObject({ entitlement: { limit: 0, used: 3 } })
    state.expires = new Date(Date.now() + 86400000)
    expect((await getRetailOpsTenantPlan(db, input)).plan.id).toBe("growth")
  }))

test("paid product caps serialize before reading the current allowance; Pro is unlimited", async () =>
  withPaidRuntime(async () => {
    const { db, state, calls } = ownerPlanFixture()
    await expect(
      assertRetailOpsProductAllowance(db, { tenantId: "tenant_123" }),
    ).rejects.toMatchObject({ entitlement: { limit: 1000, used: 1000 } })
    expect(calls).toEqual(["lock", "count"])
    state.planId = "pro"
    calls.length = 0
    await assertRetailOpsProductAllowance(db, { tenantId: "tenant_123" })
    expect(calls).toEqual(["lock"])
    expect(
      (await getRetailOpsTenantPlan(db, { tenantId: "tenant_123" })).plan.limits
        .products,
    ).toBeNull()
  }))

test("provider suspension downgrades capacity immediately; retention never bypasses lost ownership or release", async () =>
  withPaidRuntime(async () => {
    const { db, state } = ownerPlanFixture()
    state.status = "SUSPENDED"
    expect(
      (await getRetailOpsTenantPlan(db, { tenantId: "tenant_123" })).plan.id,
    ).toBe("free")
    state.owned = false
    expect(await getRetailOpsOwnerPlanId(db, "tenant_123")).toBeNull()
    expect(
      (await getRetailOpsTenantPlan(db, { tenantId: "tenant_123" })).plan
        .features,
    ).toEqual([])
    state.owned = true
    state.enrolled = false
    expect(
      (await getRetailOpsTenantPlan(db, { tenantId: "tenant_123" })).plan.id,
    ).toBe("free")
    expect(await getRetailOpsOwnerPlanId(db, "tenant_123")).toBeNull()
  }))

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
    expect(snapshot.plan.priceLabel).toBe("₦15,000/month")
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
      systemRole: null,
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
    expect(snapshot.plan.features).toEqual([])
    expect(snapshot.plan.limits).toEqual({
      businesses: 0,
      offlineDevices: 0,
      ordersPerMonth: 0,
      products: 0,
      reportsHistoryDays: 0,
      staff: 0,
      storefrontItems: 0,
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
    expect(intent.message).toContain(
      "Subscription checkout is not available here",
    )

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
  subscription?: Record<string, unknown>
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
              ...input.subscription,
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
    expect(snapshot.plan.priceLabel).toBe("₦5,000/month")
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
      limits: { ordersPerMonth: 50, products: 10, staff: 0 },
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
      limit: 50,
      used: 12,
    })
  })

  test("resolves the context plan id from durable key, metadata, then default", () => {
    expect(
      resolveRetailOpsPlanId({
        metadata: FREE_METADATA,
        subscription: { plan: { key: "growth" } },
      }),
    ).toBe("growth")
    expect(resolveRetailOpsPlanId({ metadata: FREE_METADATA })).toBe("free")
    expect(
      resolveRetailOpsPlanId({
        metadata: {},
        subscription: { plan: { key: "legacy" } },
      }),
    ).toBe("starter")
  })

  test("owner-wide coverage raises the context plan and never lowers it", () => {
    const lapsed = {
      provider: "PLAY_STORE",
      status: "ACTIVE",
      billingSubscriptionId: "fixture",
      currentPeriodEndsAt: new Date("2020-01-01T00:00:00Z"),
      plan: { key: "pro" },
    }
    expect(
      resolveRetailOpsPlanId({
        metadata: FREE_METADATA,
        ownerPlanId: "growth",
      }),
    ).toBe("growth")
    // Current coverage outlives a lapsed Tenant-bound receipt.
    expect(
      resolveRetailOpsPlanId({
        metadata: {},
        subscription: lapsed,
        ownerPlanId: "starter",
      }),
    ).toBe("starter")
    // A higher legacy, manual or launch grant is kept.
    expect(
      resolveRetailOpsPlanId({
        metadata: {},
        subscription: { plan: { key: "pro" } },
        ownerPlanId: "starter",
      }),
    ).toBe("pro")
    expect(resolveRetailOpsPlanId({ metadata: {}, ownerPlanId: null })).toBe(
      "starter",
    )
  })

  test("owner plan readers make no query while the switch is off", async () => {
    const previous = process.env.OWNER_BILLING_ENABLED
    process.env.OWNER_BILLING_ENABLED = "false"
    try {
      const db = new Proxy(
        {},
        {
          get() {
            throw new Error("unexpected owner billing read")
          },
        },
      ) as DbClient
      expect(await getRetailOpsOwnerPlanIds(db, ["tenant_123"])).toEqual(
        new Map(),
      )
      expect(await getRetailOpsOwnerPlanId(db, "tenant_123")).toBeNull()
    } finally {
      if (previous === undefined)
        Reflect.deleteProperty(process.env, "OWNER_BILLING_ENABLED")
      else process.env.OWNER_BILLING_ENABLED = previous
    }
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
    expect(capped.plan.priceLabel).toBe("₦5,000/month")

    const unlimited = await getRetailOpsSubscriptionSnapshot(
      createPlanDb({
        durablePlan: { ...plan, limits: { ordersPerMonth: null } },
      }).client,
      { tenantId: "tenant_123" },
    )
    expect(unlimited.plan.limits.ordersPerMonth).toBeNull()
  })

  test("blocks the 51st Free order in a UTC calendar month", async () => {
    const now = new Date("2026-10-31T23:30:00.000-05:00")
    const atCap = createPlanDb({ metadata: FREE_METADATA, orders: 50 })
    const error = await assertRetailOpsOrderAllowance(atCap.client, {
      now,
      tenantId: "tenant_123",
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RetailOpsSubscriptionError)
    expect(error).toMatchObject({
      code: "ENTITLEMENT_LIMIT_REACHED",
      entitlement: { key: "ordersPerMonth", limit: 50, used: 50 },
      message:
        "Free includes 50 orders a month. Upgrade your plan to record more orders this month.",
    })
    // 23:30 in UTC-5 is already 1 November in UTC.
    expect(atCap.calls[0]?.where).toEqual({
      createdAt: { gte: new Date("2026-11-01T00:00:00.000Z") },
      tenantId: "tenant_123",
    })

    await assertRetailOpsOrderAllowance(
      createPlanDb({ metadata: FREE_METADATA, orders: 49 }).client,
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

  test("enforces the ten-product Free cap while retaining legacy grants", async () => {
    await expect(
      assertRetailOpsProductAllowance(
        createPlanDb({ metadata: FREE_METADATA, products: 10 }).client,
        { tenantId: "tenant_123" },
      ),
    ).rejects.toMatchObject({
      message: "Free includes 10 products. Upgrade your plan to add more.",
    })
    await assertRetailOpsProductAllowance(
      createPlanDb({ metadata: FREE_METADATA, products: 9 }).client,
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

  test("expired paid plans cannot bypass the zero-access Catalog admission limit", async () => {
    const fixture = createPlanDb({
      durablePlan: createGrowthPlanRow(),
      subscription: {
        provider: "PLAY_STORE",
        currentPeriodEndsAt: new Date("2020-01-01T00:00:00Z"),
      },
    })
    await expect(
      assertRetailOpsProductAllowance(fixture.client, {
        tenantId: "tenant_123",
      }),
    ).rejects.toMatchObject({
      code: "ENTITLEMENT_LIMIT_REACHED",
      entitlement: { key: "products", limit: 0 },
    })
  })

  test("saved paid keys cannot grant features after store or reviewer access ends", () => {
    const future = new Date(Date.now() + 86_400_000)
    const past = new Date("2020-01-01T00:00:00Z")
    for (const provider of ["PLAY_STORE", "APP_STORE", "MANUAL"]) {
      const subscription = {
        provider,
        status: "ACTIVE",
        billingSubscriptionId:
          provider === "MANUAL" ? "play-review:fixture" : "fixture",
        currentPeriodEndsAt: future,
        plan: { key: "growth" },
      }
      expect(resolveRetailOpsPlanId({ metadata: {}, subscription })).toBe(
        "growth",
      )
      for (const change of [
        { currentPeriodEndsAt: past },
        { currentPeriodEndsAt: null },
        { status: "CANCELLED" },
        { status: "PAST_DUE" },
      ]) {
        const id = resolveRetailOpsPlanId({
          metadata: { retailOps: { subscription: { planId: "pro" } } },
          subscription: { ...subscription, ...change },
        })
        expect(id).toBe("free")
        expect(() => assertRetailOpsPlanIdFeature(id, "finance")).toThrow(
          RetailOpsSubscriptionError,
        )
      }
    }
    // Unbounded, explicit manual grants retain their existing authority.
    expect(
      resolveRetailOpsPlanId({
        metadata: {},
        subscription: {
          provider: "MANUAL",
          status: "ACTIVE",
          currentPeriodEndsAt: null,
          billingSubscriptionId: "owner-grant",
          plan: { key: "growth" },
        },
      }),
    ).toBe("growth")
  })
})
