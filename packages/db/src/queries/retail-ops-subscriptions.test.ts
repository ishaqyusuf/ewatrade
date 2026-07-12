import { describe, expect, test } from "bun:test"
import {
  createRetailOpsSubscriptionCheckoutIntent,
  getRetailOpsSubscriptionSnapshot,
  registerRetailOpsOfflineDevice,
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

function createMockSnapshotDb() {
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
    product: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.count", where })

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
    product: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.count", where })

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
    product: {
      count: async ({ where }: { where: unknown }) => {
        calls.push({ kind: "product.count", where })

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
        products: 12,
        staff: 3,
      },
    })
    expect(snapshot.plans.map((plan) => plan.id)).toEqual([
      "starter",
      "growth",
      "pro",
    ])
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
