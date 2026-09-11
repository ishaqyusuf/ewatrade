import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationWhatsAppBridgeError,
  issueStoreConversationWhatsAppBridge,
} from "./store-conversation-whatsapp-bridge"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

const bridgeDigest = "d".repeat(64)
const credentialToken = "guest-credential-token-with-enough-entropy"
const publicToken = "public-entry-token-with-enough-entropy"

function conversation() {
  return {
    id: "conversation_1",
    lifecycle: "ACTIVE",
    moderationState: "OPEN",
    store: { id: "store_1", name: "Main Store" },
    storeId: "store_1",
    tenantId: "tenant_1",
  }
}

function createIssueDb(input?: {
  pharmacyConfigured?: boolean
  pharmacyPolicyAllowed?: boolean
}) {
  let capability: Record<string, unknown> | null = null
  const writes: Array<{ data: Record<string, unknown>; model: string }> = []
  const readyBinding = {
    connection: {
      businessVerified: true,
      displayNumber: "+2348000000000",
      id: "connection_1",
      numberVerified: true,
      outboundVerified: true,
      status: "ACTIVE",
      templatesReady: true,
      tenantId: "tenant_1",
      webhookSubscribed: true,
    },
    connectionId: "connection_1",
    status: "ACTIVE",
    tenantId: "tenant_1",
  }
  const policyDecisions = allowedServiceCommercePolicyDecisionRows().filter(
    (row) =>
      input?.pharmacyPolicyAllowed !== false ||
      row.vertical !== "PHARMACY" ||
      row.channel !== "WHATSAPP",
  )
  const client = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    commerceInquiry: { findMany: async () => [] },
    customerEntryPoint: {
      findFirst: async () => ({
        id: "entry_1",
        revision: 3,
        store: { name: "Main Store" },
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    },
    prescriptionRequest: { findMany: async () => [] },
    serviceCommercePolicyAuditEvent: {
      createMany: async () => ({ count: 8 }),
    },
    serviceCommercePolicyDecision: {
      findMany: async () => policyDecisions,
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
    serviceRequest: { findMany: async () => [] },
    serviceRequestForm: { findFirst: async () => null },
    store: {
      findFirst: async () => ({
        countryCode: "NG",
        prescriptionChannel: input?.pharmacyConfigured
          ? { status: "ACTIVE", webEnabled: true }
          : null,
        prescriptionRoles: input?.pharmacyConfigured
          ? [
              {
                credentialReference: "verified-pharmacist",
                credentialVerifiedAt: new Date("2026-08-01T00:00:00Z"),
                role: "PHARMACIST",
                status: "ACTIVE",
              },
            ]
          : [],
        prescriptionSettings: input?.pharmacyConfigured
          ? { status: "ACTIVE" }
          : null,
        serviceCommercePolicyDecisions: policyDecisions,
        serviceCommerceProfile: {
          intakeEnabled: true,
          status: "ACTIVE",
          webEnabled: true,
          whatsappEnabled: true,
        },
        serviceCommerceStoreTeamAssignments: [{ id: "assignment_1" }],
        serviceRequestForms: [],
        storeConversationAvailabilityConfiguration: null,
        storeConversationChannelConfiguration: {
          desiredMode: "BOTH",
          revision: 2,
        },
        tenant: { timezone: "Africa/Lagos" },
        whatsappStoreBindings: [readyBinding],
      }),
    },
    storeConversation: {
      findFirst: async () => conversation(),
    },
    storeConversationAccountAccess: {
      findFirst: async () => ({
        accountUserId: "account_1",
        conversation: conversation(),
        id: "account_access_1",
      }),
    },
    storeConversationGuestCredential: {
      findFirst: async () => ({
        guestIdentity: { id: "guest_1", status: "ACTIVE" },
        guestIdentityId: "guest_1",
        id: "credential_1",
      }),
    },
    storeConversationRequestLink: { findMany: async () => [] },
    storeConversationWhatsAppBridgeAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "audit" })
        return { ...data, id: "audit_1" }
      },
    },
    storeConversationWhatsAppBridgeCapability: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        capability = { ...data, id: "capability_1", status: "PENDING" }
        writes.push({ data, model: "capability" })
        return capability
      },
      findUnique: async () => capability,
    },
    user: { findUnique: async () => ({ id: "account_1" }) },
    whatsAppStoreBinding: { findMany: async () => [readyBinding] },
  }
  return {
    client: client as unknown as PrismaClient,
    writes,
  }
}

describe("Store Conversation WhatsApp bridge issuance", () => {
  test("binds a guest operation to safe current scope and replays without raw values", async () => {
    const db = createIssueDb()
    const issue = {
      bridgeTokenDigest: bridgeDigest,
      clientOperationId: "bridge-operation-0001",
      conversationId: "conversation_1",
      now: new Date("2026-08-16T09:00:00Z"),
      principal: {
        credentialToken,
        kind: "guest" as const,
        purpose: "WEB_DEVICE" as const,
      },
      publicToken,
    }

    const first = await issueStoreConversationWhatsAppBridge(db.client, issue)
    const replay = await issueStoreConversationWhatsAppBridge(db.client, issue)

    expect(first).toMatchObject({
      connectionId: "connection_1",
      displayNumber: "+2348000000000",
      replayed: false,
    })
    expect(replay).toMatchObject({ replayed: true })
    const persisted = JSON.stringify(db.writes)
    expect(persisted).not.toContain(credentialToken)
    expect(persisted).not.toContain(publicToken)
    expect(persisted).not.toContain("wa.me")
    expect(persisted).not.toMatch(/prescription|quote|customer/i)
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        guestIdentityId: "guest_1",
        tokenDigest: bridgeDigest,
      }),
      model: "capability",
    })
  })

  test("rejects a changed token on the same client operation", async () => {
    const db = createIssueDb()
    const base = {
      bridgeTokenDigest: bridgeDigest,
      clientOperationId: "bridge-operation-0002",
      conversationId: "conversation_1",
      now: new Date("2026-08-16T09:00:00Z"),
      principal: {
        credentialToken,
        kind: "guest" as const,
        purpose: "WEB_DEVICE" as const,
      },
      publicToken,
    }
    await issueStoreConversationWhatsAppBridge(db.client, base)

    await expect(
      issueStoreConversationWhatsAppBridge(db.client, {
        ...base,
        bridgeTokenDigest: "e".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  test("binds an authenticated Customer Account through exact conversation access", async () => {
    const db = createIssueDb()
    await issueStoreConversationWhatsAppBridge(db.client, {
      bridgeTokenDigest: bridgeDigest,
      clientOperationId: "bridge-operation-0003",
      conversationId: "conversation_1",
      now: new Date("2026-08-16T09:00:00Z"),
      principal: { accountUserId: "account_1", kind: "account" },
      publicToken,
    })

    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        accountAccessId: "account_access_1",
        guestIdentityId: null,
      }),
      model: "capability",
    })
  })

  test("fails closed for a Nigeria Pharmacy without current WhatsApp approval", async () => {
    const db = createIssueDb({
      pharmacyConfigured: true,
      pharmacyPolicyAllowed: false,
    })

    await expect(
      issueStoreConversationWhatsAppBridge(db.client, {
        bridgeTokenDigest: bridgeDigest,
        clientOperationId: "bridge-operation-0004",
        conversationId: "conversation_1",
        now: new Date("2026-08-16T09:00:00Z"),
        principal: {
          credentialToken,
          kind: "guest",
          purpose: "WEB_DEVICE",
        },
        publicToken,
      }),
    ).rejects.toBeInstanceOf(StoreConversationWhatsAppBridgeError)
    expect(db.writes).toHaveLength(0)
  })
})
