import { describe, expect, test } from "bun:test"

import { createCallerFactory } from "../../init"
import { serviceCommerceChannelsRouter } from "./channels"

const createCaller = createCallerFactory(serviceCommerceChannelsRouter)

describe("Service Commerce channels router", () => {
  test("derives availability settings from the authenticated Tenant and Store", async () => {
    let storeRead = 0
    const db = {
      membership: {
        findFirst: async () => ({ id: "membership_owner" }),
      },
      store: {
        findFirst: async () => {
          storeRead += 1
          return storeRead === 1
            ? { id: "store_1", tenant: { timezone: "Africa/Lagos" } }
            : {
                storeConversationAvailabilityConfiguration: null,
                tenant: { timezone: "Africa/Lagos" },
              }
        },
      },
    }
    const caller = createCaller({
      db,
      session: { user: { id: "owner_1" } },
      tenantContext: {
        activeStore: { id: "store_1" },
        membership: { role: "OWNER" },
        stores: [{ id: "store_1" }],
        tenant: { id: "tenant_1" },
      },
    } as never)

    const result = await caller.storeConversationAvailabilitySettings({
      storeId: "store_1",
    })

    expect(result).toMatchObject({
      manualPaused: false,
      revision: 0,
      timezone: "Africa/Lagos",
    })
    expect(result.weeklyHours).toHaveLength(7)
    expect(storeRead).toBe(2)
  })

  test("binds a manual pause to the authenticated actor, Tenant and Store", async () => {
    let configurationWrite: Record<string, unknown> | null = null
    let auditWrite: Record<string, unknown> | null = null
    const db = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(db),
      membership: {
        findFirst: async () => ({ id: "membership_owner" }),
      },
      store: {
        findFirst: async () => ({
          id: "store_1",
          tenant: { timezone: "Africa/Lagos" },
        }),
      },
      storeConversationAvailabilityAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          auditWrite = data
          return data
        },
        findUnique: async () => null,
      },
      storeConversationAvailabilityConfiguration: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          configurationWrite = data
          return {
            ...data,
            id: "availability_1",
            revision: 1,
          }
        },
        findUnique: async () => null,
      },
    }
    const caller = createCaller({
      db,
      session: { user: { id: "owner_1" } },
      tenantContext: {
        activeStore: { id: "store_1" },
        membership: { role: "OWNER" },
        stores: [{ id: "store_1" }],
        tenant: { id: "tenant_1" },
      },
    } as never)

    const result = await caller.setStoreConversationManualPause({
      clientOperationId: "pause-operation-1",
      customerWording: "temporarily_unavailable",
      expectedRevision: 0,
      paused: true,
      reason: "Unexpected staffing gap",
      storeId: "store_1",
    })

    expect(result).toMatchObject({
      manualPaused: true,
      replayed: false,
      revision: 1,
      timezone: "Africa/Lagos",
    })
    expect(configurationWrite).toMatchObject({
      manualPaused: true,
      pausedByUserId: "owner_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    })
    expect(auditWrite).toMatchObject({
      actorUserId: "owner_1",
      clientOperationId: "pause-operation-1",
      storeId: "store_1",
      tenantId: "tenant_1",
      type: "PAUSED",
    })
  })

  test("binds a desired conversation mode to the authenticated actor, Tenant and Store", async () => {
    let commandWrite: Record<string, unknown> | null = null
    let auditWrite: Record<string, unknown> | null = null
    const db = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(db),
      membership: {
        findFirst: async () => ({ id: "membership_owner" }),
      },
      store: {
        findFirst: async () => ({ id: "store_1" }),
      },
      storeConversationChannelConfiguration: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          ...data,
          id: "channel_mode_1",
          revision: 1,
        }),
        findUnique: async () => null,
      },
      storeConversationChannelConfigurationAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          auditWrite = data
          return data
        },
      },
      storeConversationChannelConfigurationCommand: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          commandWrite = data
          return data
        },
      },
    }
    const caller = createCaller({
      db,
      session: { user: { id: "owner_1" } },
      tenantContext: {
        activeStore: { id: "store_1" },
        membership: { role: "OWNER" },
        stores: [{ id: "store_1" }],
        tenant: { id: "tenant_1" },
      },
    } as never)

    await expect(
      caller.updateStoreConversationChannelMode({
        clientOperationId: "channel-mode-operation-1",
        desiredMode: "both",
        expectedRevision: 0,
        reason: "Offer Store Chat with an optional WhatsApp route",
        storeId: "store_1",
      }),
    ).resolves.toEqual({
      desiredMode: "both",
      replayed: false,
      revision: 1,
    })
    expect(commandWrite).toMatchObject({
      clientOperationId: "channel-mode-operation-1",
      desiredMode: "BOTH",
      storeId: "store_1",
      tenantId: "tenant_1",
    })
    expect(auditWrite).toMatchObject({
      actorUserId: "owner_1",
      reason: "Offer Store Chat with an optional WhatsApp route",
      storeId: "store_1",
      tenantId: "tenant_1",
      toMode: "BOTH",
    })
  })

  test("resolves quotation-release settings inside the authenticated Tenant and Store", async () => {
    const db = {
      membership: {
        findFirst: async () => ({ id: "membership_owner" }),
        findMany: async () => [],
      },
      serviceCommerceQuoteReleasePolicy: {
        findFirst: async () => null,
      },
      serviceCommerceStoreTeamAssignment: {
        findMany: async () => [],
      },
      store: {
        findFirst: async () => ({ id: "store_1" }),
      },
    }
    const caller = createCaller({
      db,
      session: { user: { id: "owner_1" } },
      tenantContext: {
        activeStore: { id: "store_1" },
        membership: { role: "OWNER" },
        stores: [{ id: "store_1" }],
        tenant: { id: "tenant_1" },
      },
    } as never)

    const result = await caller.quoteReleaseSettings({ storeId: "store_1" })

    expect(result).toMatchObject({
      approvers: [],
      policy: {
        mode: "attendant_can_release",
        persisted: false,
        revision: 0,
      },
      teamOptions: [],
    })
  })

  test("fails a stale direct approval lookup closed inside Store scope", async () => {
    const db = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(db),
      membership: {
        findFirst: async () => ({ id: "membership_approver" }),
      },
      serviceCommerceQuoteApproval: {
        findFirst: async () => null,
      },
      serviceCommerceQuoteReleasePolicy: {
        findFirst: async () => null,
      },
      serviceCommerceStoreTeamAssignment: {
        findMany: async () => [],
      },
    }
    const caller = createCaller({
      db,
      session: { user: { id: "approver_1" } },
      tenantContext: {
        activeStore: { id: "store_1" },
        membership: { role: "MANAGER" },
        stores: [{ id: "store_1" }],
        tenant: { id: "tenant_1" },
      },
    } as never)

    await expect(
      caller.quoteApprovalDetail({
        approvalId: "stale_approval",
        storeId: "store_1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})
