import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  CustomerChannelsError,
  assignCustomerChannelAttendant,
  getCustomerChannelWorkspace,
  getPublicCustomerEntryPoint,
  publishCustomerEntryPoint,
  resolveCustomerEntryPointWhatsAppRedirect,
  revokeCustomerChannelAttendant,
  saveCustomerChannelStoreBindings,
} from "./customer-channels"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

type Call = { args: Record<string, unknown>; name: string }

function readyActiveBinding(
  overrides: Partial<{
    connection: {
      businessVerified: boolean
      displayNumber: string
      numberVerified: boolean
      outboundVerified: boolean
      status: string
      templatesReady: boolean
      tenantId: string
      webhookSubscribed: boolean
    }
    status: string
    tenantId: string
  }> = {},
) {
  return {
    connection: {
      businessVerified: true,
      displayNumber: "+2348000000000",
      numberVerified: true,
      outboundVerified: true,
      status: "ACTIVE",
      templatesReady: true,
      tenantId: "tenant_1",
      webhookSubscribed: true,
      ...overrides.connection,
    },
    status: overrides.status ?? "ACTIVE",
    tenantId: overrides.tenantId ?? "tenant_1",
  }
}

function channelProjectionStore(input?: {
  activeAttendants?: number
  activeBindings?: Array<ReturnType<typeof readyActiveBinding>>
  desiredMode?: "BOTH" | "EWATRADE_CHAT" | "WHATSAPP"
  pharmacyConfigured?: boolean
  serviceRequestFormAvailable?: boolean
}) {
  return {
    countryCode: "NG",
    prescriptionChannel: input?.pharmacyConfigured
      ? { status: "ACTIVE", webEnabled: true }
      : null,
    prescriptionRoles: input?.pharmacyConfigured
      ? [
          {
            credentialReference: "credential-ref",
            credentialVerifiedAt: new Date("2026-08-01T00:00:00.000Z"),
            role: "PHARMACIST",
            status: "ACTIVE",
          },
        ]
      : [],
    prescriptionSettings: input?.pharmacyConfigured
      ? { status: "ACTIVE" }
      : null,
    serviceCommercePolicyDecisions:
      allowedServiceCommercePolicyDecisionRows(),
    serviceCommerceProfile: {
      intakeEnabled: true,
      status: "ACTIVE",
      webEnabled: true,
      whatsappEnabled: true,
    },
    serviceCommerceStoreTeamAssignments:
      input?.activeAttendants === 0 ? [] : [{ id: "assignment_1" }],
    serviceRequestForms: input?.serviceRequestFormAvailable
      ? [{ id: "service_form_1" }]
      : [],
    storeConversationAvailabilityConfiguration: null,
    storeConversationChannelConfiguration: input?.desiredMode
      ? { desiredMode: input.desiredMode, revision: 1 }
      : null,
    tenant: { timezone: "Africa/Lagos" },
    whatsappStoreBindings: input?.activeBindings ?? [readyActiveBinding()],
  }
}

function createDb(input?: {
  activeAttendants?: number
  activeBindings?: Array<ReturnType<typeof readyActiveBinding>>
  configuredBindings?: Array<{ status: string; storeId: string }>
  existingEntry?: {
    id: string
    publicToken: string
    revision: number
    status: string
  } | null
  membershipStatus?: string | null
}) {
  const calls: Call[] = []
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    customerEntryPoint: {
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "entry.findFirst" })
        return input?.existingEntry ?? null
      },
      upsert: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "entry.upsert" })
        return {
          id: "entry_1",
          publicToken: (args.create as { publicToken: string }).publicToken,
          revision: 1,
          status: "PUBLISHED",
        }
      },
    },
    customerEntryPointAuditEvent: {
      create: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "entryAudit.create" })
        return { id: "entry_audit_1" }
      },
    },
    membership: {
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "membership.findFirst" })
        const where = args.where as { userId?: string }
        if (where.userId === "manager_1") {
          return { id: "manager_membership", role: "OWNER", status: "ACTIVE" }
        }
        return input?.membershipStatus === null
          ? null
          : {
              id: "membership_1",
              role: "OPERATOR",
              status: input?.membershipStatus ?? "ACTIVE",
              user: { displayName: "Ada", id: "user_1", name: "Ada" },
            }
      },
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "membership.findMany" })
        return [
          {
            id: "membership_1",
            role: "OPERATOR",
            user: { displayName: "Ada", id: "user_1", name: "Ada" },
          },
        ]
      },
    },
    serviceCommerceStoreTeamAssignment: {
      count: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "team.count" })
        return input?.activeAttendants ?? 1
      },
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "team.findMany" })
        return []
      },
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "team.findFirst" })
        return {
          id: "assignment_1",
          membershipId: "membership_1",
          revision: 1,
          status: "ACTIVE",
        }
      },
      updateMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "team.updateMany" })
        return { count: 1 }
      },
      upsert: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "team.upsert" })
        return { id: "assignment_1", revision: 1, status: "ACTIVE" }
      },
    },
    serviceCommerceStoreTeamAuditEvent: {
      create: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "teamAudit.create" })
        return { id: "team_audit_1" }
      },
    },
    serviceCommerceStoreProfile: {
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "profile.findFirst" })
        return {
          intakeEnabled: true,
          status: "ACTIVE",
          webEnabled: true,
          whatsappEnabled: true,
        }
      },
    },
    serviceCommercePolicyAuditEvent: {
      createMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "policyAudit.createMany" })
        return { count: 1 }
      },
    },
    serviceCommercePolicyDecision: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "policyDecision.findMany" })
        return allowedServiceCommercePolicyDecisionRows()
      },
    },
    stockBalanceSource: {
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "stockBalanceSource.findFirst" })
        return null
      },
    },
    storeConversation: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "conversation.findMany" })
        return []
      },
    },
    store: {
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "store.findFirst" })
        return {
          id: "store_1",
          metadata: {
            retailOps: {
              onboarding: {
                businessProfileKey: "fashion-apparel",
                operatingModel: "products",
                orderChannels: ["phone_whatsapp"],
                teamSize: "6_10",
              },
            },
          },
          name: "Main Store",
          ...channelProjectionStore({
            activeAttendants: input?.activeAttendants,
            activeBindings: input?.activeBindings,
          }),
          serviceCommerceProfile: {
            bookingEnabled: false,
            catalogAdoptionMode: "PROGRESSIVE",
            deliveryEnabled: false,
            id: "profile_1",
            intakeEnabled: true,
            paymentEnabled: false,
            pickupEnabled: false,
            policyRestrictedCapabilities: [],
            procureToOrderEnabled: false,
            progressiveCatalogEnabled: false,
            quoteEnabled: true,
            revision: 1,
            serviceCompletionEnabled: false,
            staffEnabled: false,
            status: "ACTIVE",
            webEnabled: true,
            whatsappEnabled: true,
          },
          status: "ACTIVE",
          tenantId: "tenant_1",
        }
      },
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "store.findMany" })
        const where = args.where as { id?: { in?: string[] } }
        if (where.id?.in) return where.id.in.map((id) => ({ id }))
        return [
          { id: "store_1", name: "Main Store" },
          { id: "store_2", name: "Branch Store" },
        ]
      },
    },
    whatsAppConnection: {
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "connection.findFirst" })
        return { id: "connection_1" }
      },
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "connection.findMany" })
        return [
          {
            bindings: [],
            credentialReference: "encrypted-secret",
            id: "connection_1",
            pendingCredentialReference: "pending-secret",
            status: "ACTIVE",
          },
        ]
      },
    },
    whatsAppStoreBinding: {
      findMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "binding.findMany" })
        const select = args.select as Record<string, unknown> | undefined
        if (select?.storeId) return input?.configuredBindings ?? []
        return input?.activeBindings ?? [readyActiveBinding()]
      },
      upsert: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "binding.upsert" })
        return { id: "binding_1" }
      },
      updateMany: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "binding.updateMany" })
        return { count: 1 }
      },
    },
    whatsAppConnectionAuditEvent: {
      create: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "connectionAudit.create" })
        return { id: "connection_audit_1" }
      },
    },
  }
  return { calls, client: client as unknown as PrismaClient }
}

function findCall(calls: Call[], name: string) {
  const value = calls.find((call) => call.name === name)
  expect(value).toBeDefined()
  return value as Call
}

describe("customer channels workspace", () => {
  test("is Tenant and Store scoped and never returns credential references", async () => {
    const db = createDb()
    const result = await getCustomerChannelWorkspace(db.client, {
      actorUserId: "manager_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    })

    expect(findCall(db.calls, "connection.findMany").args).toMatchObject({
      where: { tenantId: "tenant_1" },
    })
    expect(findCall(db.calls, "team.findMany").args).toMatchObject({
      where: { storeId: "store_1", tenantId: "tenant_1" },
    })
    expect(JSON.stringify(result)).not.toContain("secret")
    expect(result.recommendation).toEqual({
      advisoryOnly: true,
      attendantMode: "team_attendants",
      authorizationEffect: "none",
      connectionMode: "central_with_branch_choice",
      policyReviewRequired: false,
      reasons: [
        "onboarding_whatsapp",
        "category_conversational_sales",
        "multi_store_team",
      ],
      recommendedChannels: ["web", "whatsapp"],
      setupSteps: [
        "connect_whatsapp",
        "assign_attendants",
        "configure_store_routing",
        "publish_entry_point",
      ],
    })
    expect(JSON.stringify(result.recommendation)).not.toContain("readiness")
    expect(findCall(db.calls, "store.findFirst").args).toMatchObject({
      select: { id: true, metadata: true, name: true },
      where: { id: "store_1", tenantId: "tenant_1" },
    })
  })
})

describe("customer channel team routing", () => {
  test("assigns only an accepted active Tenant membership and writes audit atomically", async () => {
    const db = createDb()
    await assignCustomerChannelAttendant(db.client, {
      actorUserId: "manager_1",
      membershipId: "membership_1",
      reason: "Route customer requests",
      storeId: "store_1",
      tenantId: "tenant_1",
    })

    expect(
      db.calls.some(
        (call) =>
          call.name === "membership.findFirst" &&
          JSON.stringify(call.args).includes('"id":"membership_1"'),
      ),
    ).toBe(true)
    expect(findCall(db.calls, "team.upsert").args).toMatchObject({
      create: {
        capability: "ATTENDANT",
        membershipId: "membership_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    })
    expect(findCall(db.calls, "teamAudit.create").args).toMatchObject({
      data: {
        actorUserId: "manager_1",
        subjectMembershipId: "membership_1",
        tenantId: "tenant_1",
      },
    })
  })

  test("fails closed for an inactive or cross-Tenant membership", async () => {
    const db = createDb({ membershipStatus: null })
    await expect(
      assignCustomerChannelAttendant(db.client, {
        actorUserId: "manager_1",
        membershipId: "membership_other",
        reason: "Route customer requests",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    ).rejects.toBeInstanceOf(CustomerChannelsError)
    expect(db.calls.some((call) => call.name === "team.upsert")).toBe(false)
  })

  test("revokes the exact Store assignment with an optimistic revision", async () => {
    const db = createDb()
    await revokeCustomerChannelAttendant(db.client, {
      actorUserId: "manager_1",
      assignmentId: "assignment_1",
      expectedRevision: 1,
      reason: "Membership suspended",
      storeId: "store_1",
      tenantId: "tenant_1",
    })
    expect(findCall(db.calls, "team.updateMany").args).toMatchObject({
      where: {
        id: "assignment_1",
        revision: 1,
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    })
  })
})

describe("customer channel Store bindings", () => {
  test("saves only validated same-Tenant Stores and suspends removed bindings", async () => {
    const db = createDb()
    await saveCustomerChannelStoreBindings(db.client, {
      actorUserId: "manager_1",
      connectionId: "connection_1",
      storeIds: ["store_1", "store_2"],
      tenantId: "tenant_1",
    })
    expect(findCall(db.calls, "store.findMany").args).toMatchObject({
      where: { id: { in: ["store_1", "store_2"] }, tenantId: "tenant_1" },
    })
    expect(findCall(db.calls, "binding.updateMany").args).toMatchObject({
      where: {
        connectionId: "connection_1",
        storeId: { notIn: ["store_1", "store_2"] },
        tenantId: "tenant_1",
      },
    })
  })

  test("preserves a working active binding while configuration is saved", async () => {
    const db = createDb({
      configuredBindings: [{ status: "ACTIVE", storeId: "store_1" }],
    })
    await saveCustomerChannelStoreBindings(db.client, {
      actorUserId: "manager_1",
      connectionId: "connection_1",
      storeIds: ["store_1"],
      tenantId: "tenant_1",
    })

    expect(findCall(db.calls, "binding.upsert").args).toMatchObject({
      update: { status: undefined, suspendedAt: null },
    })
  })
})

describe("stable customer entry point", () => {
  test("blocks publish without an active Store attendant", async () => {
    const db = createDb({ activeAttendants: 0 })
    await expect(
      publishCustomerEntryPoint(db.client, {
        actorUserId: "manager_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    ).rejects.toMatchObject({ code: "PUBLISH_BLOCKED" })
    expect(db.calls.some((call) => call.name === "entry.upsert")).toBe(false)
  })

  test("publishes one stable opaque capability and audits without raw token", async () => {
    const db = createDb()
    const result = await publishCustomerEntryPoint(db.client, {
      actorUserId: "manager_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    })

    expect(result.publicToken.length).toBeGreaterThanOrEqual(32)
    const upsert = findCall(db.calls, "entry.upsert").args
    expect(upsert).toMatchObject({
      create: {
        publicTokenDigest: expect.any(String),
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    })
    expect(
      JSON.stringify(findCall(db.calls, "entryAudit.create").args),
    ).not.toContain(result.publicToken)
  })

  test("replays publication with the existing opaque capability", async () => {
    const publicToken = "stable-opaque-public-token-with-enough-entropy"
    const db = createDb({
      existingEntry: {
        id: "entry_1",
        publicToken,
        revision: 4,
        status: "PUBLISHED",
      },
    })

    await expect(
      publishCustomerEntryPoint(db.client, {
        actorUserId: "manager_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    ).resolves.toMatchObject({ publicToken })
    expect(findCall(db.calls, "entry.upsert").args).toMatchObject({
      update: { publicToken: undefined },
    })
  })

  test("public projection is digest-scoped and leaks no Tenant, Store or provider ids", async () => {
    const calls: Call[] = []
    const transaction = {
      customerEntryPoint: {
        findFirst: async (args: Record<string, unknown>) => {
          calls.push({ args, name: "entry.findFirst" })
          return {
            status: "PUBLISHED",
            store: { name: "Main Store" },
            storeId: "store_1",
            tenantId: "tenant_1",
          }
        },
      },
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 8 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () => allowedServiceCommercePolicyDecisionRows(),
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => ({
          intakeEnabled: true,
          status: "ACTIVE",
          webEnabled: true,
          whatsappEnabled: true,
        }),
      },
      serviceCommerceStoreTeamAssignment: {
        findFirst: async () => ({ id: "assignment_1" }),
      },
      serviceRequestForm: {
        findFirst: async () => ({ id: "service_form_1" }),
      },
      whatsAppStoreBinding: {
        findMany: async () => [readyActiveBinding()],
      },
      store: {
        findFirst: async () =>
          channelProjectionStore({
            desiredMode: "BOTH",
            serviceRequestFormAvailable: true,
          }),
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    const result = await getPublicCustomerEntryPoint(db, {
      publicToken: "opaque-public-token-with-enough-entropy",
    })
    expect(findCall(calls, "entry.findFirst").args).toMatchObject({
      where: {
        publicTokenDigest: expect.any(String),
        status: "PUBLISHED",
      },
    })
    expect(result).toEqual({
      actions: ["request_online", "chat_on_whatsapp"],
      availability: {
        available: true,
        customerMessage: null,
        reason: null,
        recovery: [],
        reopensAt: null,
        state: "available",
      },
      channelMode: {
        chat: { available: true, blockers: [] },
        composerEnabled: true,
        desiredMode: "both",
        effectiveMode: "both",
        historyReadable: true,
        revision: 1,
        whatsapp: { available: true, blockers: [] },
        whatsappAction: "reach_store_faster_on_whatsapp",
      },
      requestKinds: ["product_inquiry", "service"],
      storeName: "Main Store",
    })
    expect(JSON.stringify(result)).not.toContain("tenant_1")
    expect(JSON.stringify(result)).not.toContain("store_1")
  })

  test("rejects unavailable entry classes before policy, customer, request, media or provider writes", async () => {
    for (const publicToken of [
      "unknown-opaque-public-token-with-enough-entropy",
      "revoked-opaque-public-token-with-enough-entropy",
      "unpublished-opaque-public-token-with-enough-entropy",
      "foreign-opaque-public-token-with-enough-entropy",
    ]) {
      const calls: string[] = []
      const transaction = {
        customerEntryPoint: {
          findFirst: async () => {
            calls.push("entry.read")
            return null
          },
        },
        serviceCommerceCustomerActionCapability: {
          findFirst: async () => {
            calls.push("compatibility-capability.read")
            return null
          },
        },
        serviceCommercePolicyAuditEvent: {
          createMany: async () => {
            calls.push("policy.write")
            return { count: 1 }
          },
        },
      }
      const db = {
        $transaction: async (callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
      } as unknown as PrismaClient

      await expect(
        getPublicCustomerEntryPoint(db, { publicToken }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" })
      expect(calls).toEqual(["entry.read", "compatibility-capability.read"])
    }
  })

  test("does not advertise WhatsApp when Store routing has multiple active senders", async () => {
    const transaction = {
      customerEntryPoint: {
        findFirst: async () => ({
          store: { name: "Main Store" },
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 8 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () => allowedServiceCommercePolicyDecisionRows(),
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => ({
          intakeEnabled: true,
          status: "ACTIVE",
          webEnabled: true,
          whatsappEnabled: true,
        }),
      },
      serviceCommerceStoreTeamAssignment: {
        findFirst: async () => ({ id: "assignment_1" }),
      },
      store: {
        findFirst: async () =>
          channelProjectionStore({
            activeBindings: [readyActiveBinding(), readyActiveBinding()],
            desiredMode: "BOTH",
          }),
      },
      whatsAppStoreBinding: {
        findMany: async () => [readyActiveBinding(), readyActiveBinding()],
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      getPublicCustomerEntryPoint(db, {
        publicToken: "opaque-public-token-with-enough-entropy",
      }),
    ).resolves.toEqual({
      actions: ["request_online"],
      availability: {
        available: true,
        customerMessage: null,
        reason: null,
        recovery: [],
        reopensAt: null,
        state: "available",
      },
      channelMode: {
        chat: { available: true, blockers: [] },
        composerEnabled: true,
        desiredMode: "both",
        effectiveMode: "ewatrade_chat",
        historyReadable: true,
        revision: 1,
        whatsapp: {
          available: false,
          blockers: ["whatsapp_routing_unavailable"],
        },
        whatsappAction: null,
      },
      requestKinds: ["product_inquiry"],
      storeName: "Main Store",
    })
  })

  test("resolves one current WhatsApp sender behind the opaque entry token", async () => {
    const transaction = {
      customerEntryPoint: {
        findFirst: async () => ({
          status: "PUBLISHED",
          store: { name: "Main Store" },
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      serviceCommercePolicyAuditEvent: {
        createMany: async () => ({ count: 8 }),
      },
      serviceCommercePolicyDecision: {
        findMany: async () => allowedServiceCommercePolicyDecisionRows(),
      },
      serviceCommerceStoreProfile: {
        findFirst: async () => ({
          intakeEnabled: true,
          status: "ACTIVE",
          webEnabled: true,
          whatsappEnabled: true,
        }),
      },
      serviceCommerceStoreTeamAssignment: {
        findFirst: async () => ({ id: "assignment_1" }),
      },
      store: {
        findFirst: async () => channelProjectionStore({ desiredMode: "BOTH" }),
      },
      whatsAppStoreBinding: {
        findMany: async () => [readyActiveBinding()],
      },
    }
    const db = {
      $transaction: async (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction),
    } as unknown as PrismaClient

    await expect(
      resolveCustomerEntryPointWhatsAppRedirect(db, {
        publicToken: "opaque-public-token-with-enough-entropy",
      }),
    ).resolves.toEqual({
      contextToken: "opaque-public-token-with-enough-entropy",
      displayNumber: "+2348000000000",
    })
  })
})
