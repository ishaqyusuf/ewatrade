import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  bindStoreConversationWhatsAppDirectSession,
  recordStoreConversationWhatsAppObservationStatus,
} from "./store-conversation-whatsapp-discovery"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

const recipientDigest = "d".repeat(64)
const eventDigest = "e".repeat(64)
const messageDigest = "f".repeat(64)

function routingDependencies() {
  return {
    serviceCommercePolicyAuditEvent: { createMany: async () => ({ count: 8 }) },
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
      findFirst: async () => ({
        countryCode: "NG",
        prescriptionChannel: null,
        prescriptionRoles: [],
        prescriptionSettings: null,
        storeConversationAvailabilityConfiguration: null,
        storeConversationChannelConfiguration: { desiredMode: "BOTH", revision: 1 },
        tenant: { timezone: "Africa/Lagos" },
      }),
    },
    whatsAppStoreBinding: {
      findMany: async () => [
        {
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
        },
      ],
    },
  }
}

function createDirectDb() {
  const writes: Array<{ data: Record<string, unknown>; model: string }> = []
  const session = {
    connectionId: "connection_1",
    conversationId: "conversation_new",
    id: "direct_1",
    revision: 1,
    sourceId: "inquiry_new",
    sourceKind: "COMMERCE_INQUIRY",
    sourceRevision: 1,
    status: "ACTIVE",
    storeId: "store_1",
    tenantId: "tenant_1",
  }
  const client = {
    ...routingDependencies(),
    $queryRaw: async () => [{ id: "locked" }],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    commerceInquiry: {
      findFirst: async () => ({ revision: 1, status: "SUBMITTED" }),
    },
    storeConversation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "conversation_created" })
        return { id: "conversation_new" }
      },
      findFirst: async ({ select }: { select?: Record<string, unknown> }) =>
        select?.lastMessageSequence
          ? { lastMessageSequence: 0 }
          : { id: "conversation_new" },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "conversation" })
        return { count: 1 }
      },
    },
    storeConversationAuditEvent: { create: async () => ({ id: "audit_1" }) },
    storeConversationGuestIdentity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "guest_identity" })
        return { id: "guest_1" }
      },
    },
    storeConversationCommandReceipt: {
      create: async () => ({ id: "receipt_1" }),
      findUnique: async () => null,
    },
    storeConversationMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: "message_1",
      }),
    },
    storeConversationRequestLink: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: "link_1",
      }),
    },
    storeConversationWhatsAppDirectSession: {
      findUnique: async () => null,
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        writes.push({ data: create, model: "direct_session" })
        return { ...session, ...create }
      },
    },
    storeConversationWhatsAppObservation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "observation" })
        return { ...data, id: "observation_1" }
      },
      findUnique: async () => null,
    },
    storeConversationWhatsAppObservationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "observation_event" })
        return { ...data, id: "observation_event_1" }
      },
    },
    whatsAppInboundEvent: {
      findUnique: async () => ({
        connectionId: "connection_1",
        id: "event_1",
        status: "PROCESSING",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "inbound_event" })
        return { count: 1 }
      },
    },
  }
  return { client: client as unknown as PrismaClient, writes }
}

describe("Store Conversation direct WhatsApp sessions", () => {
  test("binds typed intake and one observed inbound message to an exact direct session", async () => {
    const db = createDirectDb()
    const result = await bindStoreConversationWhatsAppDirectSession(db.client, {
      connectionId: "connection_1",
      conversationId: "conversation_new",
      externalCustomerIdCiphertext: "recipient_ciphertext",
      externalCustomerIdDigest: recipientDigest,
      inboundEventId: "event_1",
      now: new Date("2026-08-16T13:00:00.000Z"),
      providerEventDigest: eventDigest,
      providerMessageDigest: messageDigest,
      sourceId: "inquiry_new",
      sourceKind: "COMMERCE_INQUIRY",
      sourceRevision: 1,
      storeId: "store_1",
      tenantId: "tenant_1",
      text: "I need a red bag",
    })

    expect(result).toMatchObject({ directSessionId: "direct_1", replayed: false })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        conversationId: "conversation_new",
        sourceId: "inquiry_new",
      }),
      model: "direct_session",
    })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({ directSessionId: "direct_1" }),
      model: "observation",
    })
  })

  test("creates a direct-only customer conversation after typed intake succeeds", async () => {
    const db = createDirectDb()
    const result = await bindStoreConversationWhatsAppDirectSession(db.client, {
      connectionId: "connection_1",
      externalCustomerIdCiphertext: "recipient_ciphertext",
      externalCustomerIdDigest: recipientDigest,
      inboundEventId: "event_1",
      now: new Date("2026-08-16T13:00:00.000Z"),
      providerEventDigest: eventDigest,
      providerMessageDigest: messageDigest,
      sourceId: "inquiry_new",
      sourceKind: "COMMERCE_INQUIRY",
      storeId: "store_1",
      tenantId: "tenant_1",
      text: "I need a red bag",
    })

    expect(result).toMatchObject({
      conversationId: "conversation_new",
      directSessionId: "direct_1",
    })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({ guestIdentityId: "guest_1" }),
      model: "conversation_created",
    })
  })
})

function createStatusDb() {
  const writes: Array<{ data: Record<string, unknown>; model: string }> = []
  let observation = {
    connectionId: "connection_1",
    id: "observation_1",
    providerMessageDigest: messageDigest,
    status: "READ",
    statusOccurredAt: new Date("2026-08-16T13:10:00.000Z"),
    storeId: "store_1",
    tenantId: "tenant_1",
  }
  const client = {
    $queryRaw: async () => [{ id: "locked" }],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    storeConversationWhatsAppObservation: {
      findUnique: async () => observation,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "observation" })
        observation = { ...observation, ...data }
        return observation
      },
    },
    storeConversationWhatsAppObservationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "event" })
        return { ...data, id: "event_1" }
      },
      findUnique: async () => null,
    },
  }
  return { client: client as unknown as PrismaClient, getObservation: () => observation, writes }
}

describe("Store Conversation observed WhatsApp status", () => {
  test("appends a late provider fact without downgrading the occurrence-time current status", async () => {
    const db = createStatusDb()
    const result = await recordStoreConversationWhatsAppObservationStatus(
      db.client,
      {
        connectionId: "connection_1",
        eventDigest,
        occurredAt: new Date("2026-08-16T13:09:00.000Z"),
        providerMessageDigest: messageDigest,
        status: "delivered",
      },
    )

    expect(result).toMatchObject({ replayed: false, status: "read" })
    expect(db.getObservation().status).toBe("READ")
    expect(db.writes.filter((write) => write.model === "event")).toHaveLength(1)
    expect(db.writes.some((write) => write.model === "observation")).toBe(false)
  })

  test("rejects a callback presented through a different Connection before writes", async () => {
    const db = createStatusDb()
    await expect(
      recordStoreConversationWhatsAppObservationStatus(db.client, {
        connectionId: "connection_other",
        eventDigest,
        occurredAt: new Date("2026-08-16T13:11:00.000Z"),
        providerMessageDigest: messageDigest,
        status: "delivered",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(db.writes).toHaveLength(0)
  })
})
