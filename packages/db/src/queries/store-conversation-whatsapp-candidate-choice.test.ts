import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { selectStoreConversationWhatsAppCandidateAction } from "./store-conversation-whatsapp-discovery"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

const digest = "d".repeat(64)
const actionDigest = "a".repeat(64)
const now = new Date("2026-08-16T12:05:00.000Z")

function candidate(
  action: "CONTINUE" | "NOT_MINE" | "START_NEW",
  replayed = false,
) {
  return {
    accountAccessId: null,
    accountUserId: null,
    action,
    candidate: {
      accountAccessId: null,
      accountUserId: null,
      connectionId: "connection_1",
      conversation: {
        guestIdentityId: "guest_1",
        id: "conversation_1",
        lifecycle: "ACTIVE",
        moderationState: "OPEN",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
      conversationId: "conversation_1",
      evidenceKind: "GUEST_VERIFIED_CONTACT",
      expiresAt: new Date("2026-08-16T12:10:00.000Z"),
      externalCustomerIdDigest: digest,
      id: "candidate_1",
      inboundEvent: {
        normalizedPayload: { text: "I need the red bag" },
        status: "AWAITING_CUSTOMER_CHOICE",
      },
      inboundEventId: "event_1",
      inboundProviderEventDigest: "e".repeat(64),
      notificationDestinationDigest: "f".repeat(64),
      notificationContactId: "contact_1",
      revision: 1,
      sourceId: "inquiry_1",
      sourceKind: "COMMERCE_INQUIRY",
      sourceRevision: 3,
      status: replayed
        ? action === "CONTINUE"
          ? "CONTINUED"
          : action === "START_NEW"
            ? "STARTED_NEW"
            : "REJECTED"
        : "PENDING",
      storeId: "store_1",
      tenantId: "tenant_1",
    },
    candidateId: "candidate_1",
    candidateRevision: 1,
    expiresAt: new Date("2026-08-16T12:10:00.000Z"),
    id: "capability_1",
    status: replayed ? "CONSUMED" : "ACTIVE",
  }
}

function createChoiceDb(
  action: "CONTINUE" | "NOT_MINE" | "START_NEW",
  replayed = false,
) {
  const writes: Array<{ data: Record<string, unknown>; model: string }> = []
  const capability = candidate(action, replayed)
  const client = {
    $queryRaw: async () => [{ id: "locked" }],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    commerceInquiry: {
      findFirst: async () => ({ revision: 3, status: "SUBMITTED" }),
      findMany: async () => [
        {
          createdAt: new Date("2026-08-15T12:00:00.000Z"),
          id: "inquiry_1",
          revision: 3,
          status: "SUBMITTED",
        },
      ],
    },
    prescriptionRequest: { findMany: async () => [] },
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
    serviceRequest: { findMany: async () => [] },
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
    storeConversation: {
      findFirst: async ({ select }: { select?: Record<string, unknown> }) =>
        select?.lastMessageSequence
          ? { lastMessageSequence: 0 }
          : { id: "conversation_1" },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "conversation" })
        return { count: 1 }
      },
    },
    storeConversationAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "audit" })
        return { ...data, id: "audit_1" }
      },
    },
    storeConversationCommandReceipt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "receipt" })
        return { ...data, id: "receipt_1" }
      },
      findUnique: async () => null,
    },
    storeConversationGuestNotificationContact: {
      findFirst: async () => ({ id: "contact_1" }),
    },
    storeConversationMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "message" })
        return { ...data, id: "message_1" }
      },
    },
    storeConversationRequestLink: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "request_link" })
        return { ...data, id: "link_1" }
      },
      findMany: async () => [
        {
          createdAt: new Date("2026-08-15T12:00:00.000Z"),
          kind: "COMMERCE_INQUIRY",
          sourceId: "inquiry_1",
        },
      ],
    },
    storeConversationWhatsAppBridge: {
      findUnique: async () =>
        replayed && action === "CONTINUE"
          ? { conversationId: "conversation_1", id: "bridge_1" }
          : null,
      upsert: async ({ create, update }: Record<string, Record<string, unknown>>) => {
        writes.push({ data: { create, update }, model: "bridge" })
        return {
          ...create,
          id: "bridge_1",
          revision: 1,
          status: "ACTIVE",
        }
      },
    },
    storeConversationWhatsAppBridgeAttempt: { updateMany: async () => ({ count: 0 }) },
    storeConversationWhatsAppBridgeChoiceCapability: { updateMany: async () => ({ count: 0 }) },
    storeConversationWhatsAppCandidate: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "candidate" })
        return { ...capability.candidate, ...data }
      },
    },
    storeConversationWhatsAppCandidateAttempt: {
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "candidate_attempt" })
        return { count: 1 }
      },
    },
    storeConversationWhatsAppCandidateActionCapability: {
      findUnique: async () => capability,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "candidate_capability" })
        return { ...capability, ...data }
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "candidate_capability_many" })
        return { count: 2 }
      },
    },
    storeConversationWhatsAppCandidateSuppression: {
      upsert: async ({ create, update }: Record<string, Record<string, unknown>>) => {
        writes.push({ data: { create, update }, model: "suppression" })
        return { ...create, id: "suppression_1" }
      },
    },
    storeConversationWhatsAppObservation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "observation" })
        return { ...data, id: "observation_1" }
      },
    },
    storeConversationWhatsAppObservationEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "observation_event" })
        return { ...data, id: "observation_event_1" }
      },
    },
    whatsAppInboundEvent: {
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "inbound_event" })
        return { count: 1 }
      },
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
  return { client: client as unknown as PrismaClient, writes }
}

const baseInput = {
  actionTokenDigest: actionDigest,
  connectionId: "connection_1",
  externalCustomerIdCiphertext: "recipient_ciphertext",
  externalCustomerIdDigest: digest,
  normalizedExternalCustomerId: "+2348000000000",
  now,
  storeId: "store_1",
  tenantId: "tenant_1",
}

describe("Store Conversation direct WhatsApp candidate choices", () => {
  test("continues only after current evidence and source checks, then records one observed message", async () => {
    const db = createChoiceDb("CONTINUE")
    const result = await selectStoreConversationWhatsAppCandidateAction(
      db.client,
      baseInput,
    )

    expect(result).toMatchObject({
      bridgeId: "bridge_1",
      conversationId: "conversation_1",
      state: "continued",
    })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        create: expect.objectContaining({
          capabilityId: null,
          candidateId: "candidate_1",
        }),
      }),
      model: "bridge",
    })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({ status: "CONTINUED" }),
      model: "candidate",
    })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        direction: "INBOUND",
        provenance: "CLOUD_API_INBOUND",
        status: "RECEIVED",
      }),
      model: "observation",
    })
    expect(JSON.stringify(db.writes)).not.toContain("+2348000000000")
    expect(JSON.stringify(db.writes)).not.toMatch(/watermark/i)
  })

  test("releases Start new for typed intake without creating a bridge", async () => {
    const db = createChoiceDb("START_NEW")
    const result = await selectStoreConversationWhatsAppCandidateAction(
      db.client,
      baseInput,
    )

    expect(result).toMatchObject({ inboundEventId: "event_1", state: "start_new" })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({ status: "STARTED_NEW" }),
      model: "candidate",
    })
    expect(db.writes).toContainEqual({ data: { status: "RECEIVED" }, model: "inbound_event" })
    expect(db.writes.some((write) => write.model === "bridge")).toBe(false)
  })

  test("records a bounded suppression and ignores the held event for Not mine", async () => {
    const db = createChoiceDb("NOT_MINE")
    const result = await selectStoreConversationWhatsAppCandidateAction(
      db.client,
      baseInput,
    )

    expect(result.state).toBe("rejected")
    expect(db.writes.some((write) => write.model === "suppression")).toBe(true)
    expect(db.writes).toContainEqual({ data: { status: "IGNORED" }, model: "inbound_event" })
    expect(db.writes.some((write) => write.model === "message")).toBe(false)
  })

  test("rejects a different recipient before any mutation", async () => {
    const db = createChoiceDb("CONTINUE")
    await expect(
      selectStoreConversationWhatsAppCandidateAction(db.client, {
        ...baseInput,
        externalCustomerIdDigest: "f".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(db.writes).toHaveLength(0)
  })

  test("replays an already committed choice without repeating domain writes", async () => {
    const db = createChoiceDb("CONTINUE", true)
    const result = await selectStoreConversationWhatsAppCandidateAction(
      db.client,
      baseInput,
    )

    expect(result).toEqual({
      bridgeId: "bridge_1",
      conversationId: "conversation_1",
      replayed: true,
      state: "continued",
    })
    expect(db.writes).toHaveLength(0)
  })
})
