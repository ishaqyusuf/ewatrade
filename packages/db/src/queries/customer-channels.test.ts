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

function createDb(input?: {
  activeAttendants?: number
  activeBindings?: Array<{ connection: { status: string }; status: string }>
  configuredBindings?: Array<{ status: string; storeId: string }>
  membershipStatus?: string | null
}) {
  const calls: Call[] = []
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    customerEntryPoint: {
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "entry.findFirst" })
        return null
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
        return { id: "assignment_1", revision: 1, status: "ACTIVE" }
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
    store: {
      findFirst: async (args: Record<string, unknown>) => {
        calls.push({ args, name: "store.findFirst" })
        return {
          countryCode: "NG",
          id: "store_1",
          name: "Main Store",
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
        return (where.id?.in ?? []).map((id) => ({ id }))
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
        return (
          input?.activeBindings ?? [
            { connection: { status: "ACTIVE" }, status: "ACTIVE" },
          ]
        )
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
      whatsAppStoreBinding: {
        findMany: async () => [
          { connection: { status: "ACTIVE" }, status: "ACTIVE" },
        ],
      },
      store: { findFirst: async () => ({ countryCode: "NG" }) },
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
      storeName: "Main Store",
    })
    expect(JSON.stringify(result)).not.toContain("tenant_1")
    expect(JSON.stringify(result)).not.toContain("store_1")
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
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      whatsAppStoreBinding: {
        findMany: async () => [
          { connection: { status: "ACTIVE" }, status: "ACTIVE" },
          { connection: { status: "ACTIVE" }, status: "ACTIVE" },
        ],
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
      store: { findFirst: async () => ({ countryCode: "NG" }) },
      whatsAppStoreBinding: {
        findMany: async (args: Record<string, unknown>) => {
          const select = args.select as Record<string, unknown> | undefined
          return select?.connection
            ? [
                {
                  connection: {
                    displayNumber: "+2348000000000",
                    status: "ACTIVE",
                  },
                  status: "ACTIVE",
                },
              ]
            : []
        },
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
