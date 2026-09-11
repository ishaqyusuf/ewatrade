import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  claimStoreConversationWhatsAppOutboundAttempt,
  completeStoreConversationWhatsAppOutboundAttempt,
  failStoreConversationWhatsAppOutboundAttempt,
  prepareStoreConversationWhatsAppOutboundAttemptInTransaction,
} from "./store-conversation-whatsapp-outbound-repository"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

const providerDigest = "d".repeat(64)
const eventDigest = "e".repeat(64)
const now = new Date("2026-08-16T14:00:00.000Z")

function routeDb(input: { bridge?: boolean; direct?: boolean } = {}) {
  const writes: Array<{ data: Record<string, unknown>; model: string }> = []
  const route = {
    connectionId: "connection_1",
    conversationId: "conversation_1",
    externalCustomerIdCiphertext: "recipient_ciphertext",
    id: input.direct ? "direct_1" : "bridge_1",
    sourceId: "inquiry_1",
    sourceKind: "COMMERCE_INQUIRY",
    sourceRevision: 2,
    status: "ACTIVE",
    storeId: "store_1",
    tenantId: "tenant_1",
  }
  const client = {
    storeConversationWhatsAppBridge: {
      findMany: async () => (input.bridge ? [{ ...route, id: "bridge_1" }] : []),
    },
    storeConversationWhatsAppDirectSession: {
      findMany: async () => (input.direct ? [{ ...route, id: "direct_1" }] : []),
    },
    storeConversationWhatsAppOutboundAttempt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "attempt" })
        return { ...data, id: "attempt_1" }
      },
    },
  }
  return { client: client as never, writes }
}

describe("Store Conversation WhatsApp outbound preparation", () => {
  test("creates one identifier-only outbox row for one exact current route", async () => {
    const db = routeDb({ bridge: true })
    const result = await prepareStoreConversationWhatsAppOutboundAttemptInTransaction(
      db.client,
      {
        conversationId: "conversation_1",
        messageId: "message_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    )

    expect(result).toEqual({
      attemptId: "attempt_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    })
    expect(db.writes).toEqual([
      {
        data: expect.objectContaining({
          bridgeId: "bridge_1",
          conversationId: "conversation_1",
          messageId: "message_1",
        }),
        model: "attempt",
      },
    ])
    expect(JSON.stringify(db.writes)).not.toMatch(/ciphertext|message body/i)
  })

  test("does nothing with no provider route and fails closed with two routes", async () => {
    const noRoute = routeDb()
    expect(
      await prepareStoreConversationWhatsAppOutboundAttemptInTransaction(
        noRoute.client,
        {
          conversationId: "conversation_1",
          messageId: "message_1",
          storeId: "store_1",
          tenantId: "tenant_1",
        },
      ),
    ).toBeNull()
    const ambiguous = routeDb({ bridge: true, direct: true })
    await expect(
      prepareStoreConversationWhatsAppOutboundAttemptInTransaction(
        ambiguous.client,
        {
          conversationId: "conversation_1",
          messageId: "message_1",
          storeId: "store_1",
          tenantId: "tenant_1",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(ambiguous.writes).toHaveLength(0)
  })
})

function lifecycleDb() {
  const writes: Array<{ data: Record<string, unknown>; model: string }> = []
  let attempt = {
    attemptCount: 0,
    bridge: {
      connectionId: "connection_1",
      conversationId: "conversation_1",
      externalCustomerIdCiphertext: "recipient_ciphertext",
      id: "bridge_1",
      sourceId: "inquiry_1",
      sourceKind: "COMMERCE_INQUIRY",
      sourceRevision: 2,
      status: "ACTIVE",
      storeId: "store_1",
      tenantId: "tenant_1",
    },
    bridgeId: "bridge_1",
    claimToken: null as string | null,
    connectionId: "connection_1",
    conversationId: "conversation_1",
    directSession: null,
    directSessionId: null,
    failureCode: null,
    id: "attempt_1",
    message: { body: "Your quote is ready", id: "message_1" },
    messageId: "message_1",
    nextAttemptAt: null,
    status: "PENDING",
    storeId: "store_1",
    tenantId: "tenant_1",
  }
  const client = {
    $queryRaw: async () => [{ id: "locked" }],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    commerceInquiry: {
      findFirst: async () => ({ revision: 2, status: "QUOTED" }),
    },
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
    storeConversationWhatsAppObservation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "observation" })
        return { ...data, id: "observation_1" }
      },
    },
    storeConversationWhatsAppObservationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "event" })
        return { ...data, id: "event_1" }
      },
    },
    storeConversationWhatsAppOutboundAttempt: {
      findUnique: async () => attempt,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "attempt" })
        attempt = { ...attempt, ...data }
        return attempt
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "attempt" })
        attempt = { ...attempt, ...data }
        return { count: 1 }
      },
    },
    whatsAppStoreBinding: {
      findMany: async () => [
        {
          connection: {
            businessVerified: true,
            credentialReference: "credential_ciphertext",
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
  return { client: client as unknown as PrismaClient, getAttempt: () => attempt, writes }
}

describe("Store Conversation WhatsApp outbound lifecycle", () => {
  test("claims once and completes with one outbound observation", async () => {
    const db = lifecycleDb()
    const claimed = await claimStoreConversationWhatsAppOutboundAttempt(db.client, {
      attemptId: "attempt_1",
      claimToken: "claim_1",
      now,
    })
    expect(claimed).toMatchObject({
      recipientCiphertext: "recipient_ciphertext",
      text: "Your quote is ready",
    })

    const completed = await completeStoreConversationWhatsAppOutboundAttempt(
      db.client,
      {
        attemptId: "attempt_1",
        claimToken: "claim_1",
        eventDigest,
        now,
        providerReferenceDigest: providerDigest,
      },
    )
    expect(completed).toMatchObject({ replayed: false, status: "sent" })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        direction: "OUTBOUND",
        provenance: "CLOUD_API_OUTBOUND",
      }),
      model: "observation",
    })
  })

  test("keeps an ambiguous provider outcome claimed and out of automatic retry", async () => {
    const db = lifecycleDb()
    await claimStoreConversationWhatsAppOutboundAttempt(db.client, {
      attemptId: "attempt_1",
      claimToken: "claim_1",
      now,
    })
    await failStoreConversationWhatsAppOutboundAttempt(db.client, {
      attemptId: "attempt_1",
      claimToken: "claim_1",
      failureCode: "provider_outcome_unknown",
      now,
      outcomeUnknown: true,
    })

    expect(db.getAttempt()).toMatchObject({
      nextAttemptAt: null,
      status: "OUTCOME_UNKNOWN",
    })
  })
})
