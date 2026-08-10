import { describe, expect, test } from "bun:test"
import { Prisma } from "../../generated/prisma/client"

import {
  ServiceCommerceAccessError,
  getServiceCommerceWorkspaceAccess,
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "./service-commerce-access"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"
import type { DbClient } from "./types"

type Call = { args: Record<string, unknown>; name: string }

const profile = {
  attachmentsEnabled: false,
  attachmentsProviderReady: false,
  bookingEnabled: false,
  catalogAdoptionMode: "PROGRESSIVE",
  deliveryEnabled: false,
  id: "profile_123",
  intakeEnabled: true,
  paymentEnabled: false,
  pickupEnabled: false,
  policyRestrictedCapabilities: [] as string[],
  procureToOrderEnabled: false,
  progressiveCatalogEnabled: true,
  quoteEnabled: true,
  revision: 2,
  serviceCompletionEnabled: false,
  staffEnabled: true,
  status: "DISABLED",
  webEnabled: false,
  whatsappEnabled: false,
}

const settings = {
  capabilities: {
    attachments: false,
    booking: false,
    delivery: false,
    intake: true,
    payment: false,
    pickup: false,
    progressive_catalog: true,
    quote: true,
    service_completion: false,
    staff: true,
    web: false,
    whatsapp: false,
  },
  catalogAdoptionMode: "progressive" as const,
  procureToOrderEnabled: false,
}

function createDb(input?: {
  createError?: unknown
  profile?: typeof profile | null
  role?: string | null
  storeStatus?: string
  updateCount?: number
  whatsappBindings?: Array<{
    connection: { status: string }
    id: string
    status: string
  }>
}) {
  const calls: Call[] = []
  const storedProfile = input?.profile === undefined ? profile : input.profile
  const store = {
    countryCode: "NG",
    id: "store_123",
    name: "Main Store",
    serviceCommerceProfile: storedProfile,
    status: input?.storeStatus ?? "ACTIVE",
  }
  const client = {
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
      operation(client),
    membership: {
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "membership.findFirst" })
        return input?.role === null ? null : { role: input?.role ?? "OWNER" }
      },
    },
    serviceCommercePolicyAuditEvent: {
      createMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "policyAudit.createMany" })
        return { count: Array.isArray(args.data) ? args.data.length : 0 }
      },
    },
    serviceCommercePolicyDecision: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "policyDecision.findMany" })
        return allowedServiceCommercePolicyDecisionRows()
      },
    },
    serviceCommerceStoreAuditEvent: {
      create: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "audit.create" })
        return { id: "audit_123" }
      },
    },
    serviceCommerceStoreProfile: {
      create: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "profile.create" })
        if (input?.createError) throw input.createError
        return {
          ...profile,
          ...(args.data as object),
          id: "profile_new",
          revision: 1,
        }
      },
      findFirstOrThrow: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "profile.findFirstOrThrow" })
        return { ...profile, revision: 3 }
      },
      updateMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "profile.updateMany" })
        return { count: input?.updateCount ?? 1 }
      },
    },
    stockBalanceSource: {
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "stockBalanceSource.findFirst" })
        return null
      },
    },
    store: {
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "store.findFirst" })
        return store
      },
    },
    whatsAppStoreBinding: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "whatsAppStoreBinding.findMany" })
        return input?.whatsappBindings ?? []
      },
    },
  }
  return { calls, client: client as unknown as DbClient }
}

function call(calls: Call[], name: string) {
  const found = calls.find((entry) => entry.name === name)
  expect(found).toBeDefined()
  return found as Call
}

describe("service commerce access", () => {
  test("derives owner/admin management, operator assistance, and staff read-only access", async () => {
    for (const [role, expected] of [
      ["OWNER", { canManage: true, canOperate: true }],
      ["ADMIN", { canManage: true, canOperate: true }],
      ["MANAGER", { canManage: false, canOperate: true }],
      ["CASHIER", { canManage: false, canOperate: true }],
      ["OPERATOR", { canManage: false, canOperate: true }],
      ["SUPPORT", { canManage: false, canOperate: false }],
      ["MEMBER", { canManage: false, canOperate: false }],
    ] as const) {
      const db = createDb({ role })
      const result = await getServiceCommerceWorkspaceAccess(db.client, {
        actorUserId: "user_123",
        storeId: "store_123",
        tenantId: "tenant_123",
      })
      expect(result.access).toMatchObject(expected)
    }
  })

  test("scopes membership, Store, inventory, and profile mutations by Tenant and Store", async () => {
    const db = createDb()
    await updateServiceCommerceStoreProfile(db.client, {
      actorUserId: "user_123",
      expectedRevision: 2,
      reason: "Enable assisted quoting",
      settings,
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    expect(call(db.calls, "membership.findFirst").args).toMatchObject({
      where: { status: "ACTIVE", tenantId: "tenant_123", userId: "user_123" },
    })
    expect(call(db.calls, "store.findFirst").args).toMatchObject({
      where: { id: "store_123", tenantId: "tenant_123" },
    })
    expect(call(db.calls, "profile.updateMany").args).toMatchObject({
      where: {
        id: "profile_123",
        revision: 2,
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    })
    expect(call(db.calls, "stockBalanceSource.findFirst").args).toMatchObject({
      where: { storeId: "store_123", tenantId: "tenant_123" },
    })
  })

  test("fails closed for non-managers before profile mutation", async () => {
    const db = createDb({ role: "OPERATOR" })
    await expect(
      updateServiceCommerceStoreProfile(db.client, {
        actorUserId: "user_123",
        expectedRevision: 2,
        reason: "Attempt config change",
        settings,
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(db.calls.some((entry) => entry.name === "profile.updateMany")).toBe(
      false,
    )
  })

  test("keeps a disabled profile unavailable and blocks activation without required readiness", async () => {
    const db = createDb({ storeStatus: "DRAFT" })
    const workspace = await getServiceCommerceWorkspaceAccess(db.client, {
      actorUserId: "user_123",
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    expect(workspace.configuration.status).toBe("disabled")
    expect(workspace.readiness.capabilities.intake.readiness).not.toBe(
      "available",
    )
    await expect(
      setServiceCommerceStoreProfileActivation(db.client, {
        active: true,
        actorUserId: "user_123",
        expectedRevision: 2,
        reason: "Go live",
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).rejects.toMatchObject({ code: "ACTIVATION_BLOCKED" })
  })

  test("rejects a stale revision without writing an audit event", async () => {
    const db = createDb({ updateCount: 0 })
    await expect(
      updateServiceCommerceStoreProfile(db.client, {
        actorUserId: "user_123",
        expectedRevision: 2,
        reason: "Concurrent update",
        settings,
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(db.calls.some((entry) => entry.name === "audit.create")).toBe(false)
  })

  test("translates a concurrent initial-create unique conflict", async () => {
    const createError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { clientVersion: "test", code: "P2002" },
    )
    const db = createDb({ createError, profile: null })

    await expect(
      updateServiceCommerceStoreProfile(db.client, {
        actorUserId: "user_123",
        expectedRevision: 0,
        reason: "Concurrent initial setup",
        settings,
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(db.calls.some((entry) => entry.name === "audit.create")).toBe(false)
  })

  test("projects provider outage, active rotation and server-owned restriction distinctly", async () => {
    const whatsappProfile = {
      ...profile,
      staffEnabled: false,
      status: "ACTIVE",
      whatsappEnabled: true,
    }
    const unavailableDb = createDb({
      profile: whatsappProfile,
      whatsappBindings: [
        {
          connection: { status: "RECONNECTING" },
          id: "binding_123",
          status: "ACTIVE",
        },
      ],
    })
    const unavailable = await getServiceCommerceWorkspaceAccess(
      unavailableDb.client,
      {
        actorUserId: "user_123",
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    )
    expect(unavailable.readiness.capabilities.whatsapp).toMatchObject({
      blockers: ["provider_unavailable"],
      readiness: "unavailable",
      recovery: "retry_provider",
    })

    const rotatingDb = createDb({
      profile: whatsappProfile,
      whatsappBindings: [
        {
          connection: { status: "ACTIVE" },
          id: "binding_123",
          status: "ACTIVE",
        },
        {
          connection: { status: "SUSPENDED" },
          id: "binding_456",
          status: "SUSPENDED",
        },
      ],
    })
    const rotating = await getServiceCommerceWorkspaceAccess(
      rotatingDb.client,
      {
        actorUserId: "user_123",
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    )
    expect(rotating.readiness.capabilities.whatsapp).toMatchObject({
      blockers: [],
      readiness: "available",
      recovery: null,
    })

    const restrictedDb = createDb({
      profile: {
        ...whatsappProfile,
        policyRestrictedCapabilities: ["whatsapp"],
      },
      whatsappBindings: [
        {
          connection: { status: "ACTIVE" },
          id: "binding_123",
          status: "ACTIVE",
        },
      ],
    })
    const restricted = await getServiceCommerceWorkspaceAccess(
      restrictedDb.client,
      {
        actorUserId: "user_123",
        storeId: "store_123",
        tenantId: "tenant_123",
      },
    )
    expect(restricted.readiness.capabilities.whatsapp).toMatchObject({
      blockers: ["policy_restricted"],
      readiness: "restricted",
      recovery: "review_policy",
    })
  })

  test("prevents generic activation of a suspended profile", async () => {
    const db = createDb({ profile: { ...profile, status: "SUSPENDED" } })

    for (const active of [true, false]) {
      await expect(
        setServiceCommerceStoreProfileActivation(db.client, {
          active,
          actorUserId: "user_123",
          expectedRevision: 2,
          reason: "Attempt generic suspension bypass",
          storeId: "store_123",
          tenantId: "tenant_123",
        }),
      ).rejects.toMatchObject({ code: "ACTIVATION_BLOCKED" })
    }
    expect(db.calls.some((entry) => entry.name === "profile.updateMany")).toBe(
      false,
    )
  })

  test("requires a server-ready channel during activation and active updates", async () => {
    const whatsappOnlyProfile = {
      ...profile,
      staffEnabled: false,
      status: "DISABLED",
      whatsappEnabled: true,
    }
    const unavailableDb = createDb({ profile: whatsappOnlyProfile })

    await expect(
      setServiceCommerceStoreProfileActivation(unavailableDb.client, {
        active: true,
        actorUserId: "user_123",
        expectedRevision: 2,
        reason: "Activate unavailable WhatsApp",
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).rejects.toMatchObject({
      code: "ACTIVATION_BLOCKED",
      message: expect.stringContaining("channel_unavailable"),
    })

    const activeRestrictedDb = createDb({
      profile: {
        ...whatsappOnlyProfile,
        policyRestrictedCapabilities: ["whatsapp"],
        status: "ACTIVE",
      },
    })
    await expect(
      updateServiceCommerceStoreProfile(activeRestrictedDb.client, {
        actorUserId: "user_123",
        expectedRevision: 2,
        reason: "Keep restricted WhatsApp only",
        settings: {
          ...settings,
          capabilities: {
            ...settings.capabilities,
            staff: false,
            whatsapp: true,
          },
        },
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).rejects.toMatchObject({
      code: "ACTIVATION_BLOCKED",
      message: expect.stringContaining("channel_unavailable"),
    })
  })

  test("prevents invalid settings from leaving an active profile enabled", async () => {
    const db = createDb({ profile: { ...profile, status: "ACTIVE" } })

    await expect(
      updateServiceCommerceStoreProfile(db.client, {
        actorUserId: "user_123",
        expectedRevision: 2,
        reason: "Remove every outcome",
        settings: {
          ...settings,
          capabilities: {
            ...settings.capabilities,
            booking: false,
            quote: false,
          },
        },
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).rejects.toMatchObject({ code: "ACTIVATION_BLOCKED" })
    expect(db.calls.some((entry) => entry.name === "profile.updateMany")).toBe(
      false,
    )
  })

  test("records trimmed reason and before/after snapshots for an authorized change", async () => {
    const db = createDb()
    await updateServiceCommerceStoreProfile(db.client, {
      actorUserId: "user_123",
      expectedRevision: 2,
      reason: "  Enable assisted quoting  ",
      settings,
      storeId: "store_123",
      tenantId: "tenant_123",
    })
    expect(call(db.calls, "audit.create").args).toMatchObject({
      data: {
        actorUserId: "user_123",
        previousSnapshot: expect.objectContaining({ revision: 2 }),
        reason: "Enable assisted quoting",
        storeId: "store_123",
        tenantId: "tenant_123",
        type: "SETTINGS_UPDATED",
      },
    })
  })

  test("requires a non-empty reason before opening a transaction", async () => {
    const db = createDb()
    await expect(
      updateServiceCommerceStoreProfile(db.client, {
        actorUserId: "user_123",
        expectedRevision: 2,
        reason: "  ",
        settings,
        storeId: "store_123",
        tenantId: "tenant_123",
      }),
    ).rejects.toBeInstanceOf(ServiceCommerceAccessError)
    expect(db.calls).toEqual([])
  })
})
