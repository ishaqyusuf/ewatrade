import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { discoverStoreConversationWhatsAppCandidate } from "./store-conversation-whatsapp-discovery"

const recipientDigest = "d".repeat(64)
const normalizedRecipient = "+2348000000000"
const now = new Date("2026-08-16T12:00:00.000Z")

type CandidateConversation = {
  accountAccess: { accountUserId: string; id: string } | null
  guestIdentity: { notificationContacts: Array<{ id: string }> }
  id: string
  lastActivityAt: Date
  storeId: string
  tenantId: string
}

function conversation(
  input: Partial<CandidateConversation> = {},
): CandidateConversation {
  return {
    accountAccess: null,
    guestIdentity: { notificationContacts: [{ id: "contact_1" }] },
    id: "conversation_1",
    lastActivityAt: new Date("2026-08-15T12:00:00.000Z"),
    storeId: "store_1",
    tenantId: "tenant_1",
    ...input,
  }
}

function createDb(input: {
  conversations: CandidateConversation[]
  existingCandidate?: Record<string, unknown> | null
}) {
  const writes: Array<{ data: Record<string, unknown>; model: string }> = []
  const queries: Array<Record<string, unknown>> = []
  const candidate =
    input.existingCandidate ??
    ({
      connectionId: "connection_1",
      conversationId: "conversation_1",
      expiresAt: new Date("2026-08-16T12:10:00.000Z"),
      id: "candidate_1",
      inboundEventId: "event_1",
      revision: 1,
      status: "PENDING",
      storeId: "store_1",
      tenantId: "tenant_1",
    } as const)
  const client = {
    $queryRaw: async () => [{ id: "event_1" }],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    commerceInquiry: {
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
    serviceRequest: { findMany: async () => [] },
    storeConversation: {
      findMany: async (query: Record<string, unknown>) => {
        queries.push(query)
        return input.conversations
      },
    },
    storeConversationRequestLink: {
      findMany: async () => [
        {
          createdAt: new Date("2026-08-15T12:00:00.000Z"),
          kind: "COMMERCE_INQUIRY",
          sourceId: "inquiry_1",
        },
      ],
    },
    storeConversationWhatsAppCandidate: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "candidate" })
        return { ...candidate, ...data }
      },
      findUnique: async () => input.existingCandidate ?? null,
    },
    storeConversationWhatsAppCandidateActionCapability: {
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        for (const row of data) writes.push({ data: row, model: "capability" })
        return { count: data.length }
      },
    },
    storeConversationWhatsAppCandidateAttempt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "attempt" })
        return { ...data, id: "attempt_1" }
      },
    },
    whatsAppInboundEvent: {
      findUnique: async () => ({
        connectionId: "connection_1",
        id: "event_1",
        status: "RECEIVED",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
      updateMany: async ({ data, where }: Record<string, unknown>) => {
        writes.push({ data: { data, where }, model: "inbound_event" })
        return { count: 1 }
      },
    },
  }
  return {
    client: client as unknown as PrismaClient,
    queries,
    writes,
  }
}

const tokenServices = {
  deriveActionToken: (input: { action: string }) =>
    `ewc1_${input.action.charCodeAt(0).toString(16).padStart(2, "0")}${"a".repeat(41)}`,
  digestToken: (value: string) => {
    const marker = value.slice(5, 7)
    return marker === "63"
      ? "a".repeat(64)
      : marker === "73"
        ? "b".repeat(64)
        : "c".repeat(64)
  },
}
const providerEventDigest = "e".repeat(64)
const notificationDestinationDigest = "f".repeat(64)

describe("Store Conversation direct WhatsApp discovery", () => {
  test("holds one exact Store-scoped verified Guest candidate behind three neutral actions", async () => {
    const db = createDb({ conversations: [conversation()] })

    const result = await discoverStoreConversationWhatsAppCandidate(db.client, {
      connectionId: "connection_1",
      externalCustomerIdDigest: recipientDigest,
      inboundEventId: "event_1",
      notificationDestinationDigest,
      normalizedExternalCustomerId: normalizedRecipient,
      now,
      providerEventDigest,
      storeId: "store_1",
      tenantId: "tenant_1",
      tokenServices,
    })

    expect(result).toMatchObject({ candidateId: "candidate_1", state: "held" })
    expect(db.writes.filter((write) => write.model === "capability")).toHaveLength(3)
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        evidenceKind: "GUEST_VERIFIED_CONTACT",
        notificationContactId: "contact_1",
        sourceId: "inquiry_1",
        sourceRevision: 3,
      }),
      model: "candidate",
    })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        data: { status: "AWAITING_CUSTOMER_CHOICE" },
      }),
      model: "inbound_event",
    })
    const serializedQuery = JSON.stringify(db.queries[0])
    expect(serializedQuery).toContain('"tenantId":"tenant_1"')
    expect(serializedQuery).toContain('"storeId":"store_1"')
    expect(serializedQuery).toContain(
      '"destinationDigest":"' + notificationDestinationDigest + '"',
    )
    expect(serializedQuery).toContain(
      '"externalCustomerIdDigest":"' + recipientDigest + '"',
    )
    expect(serializedQuery).toContain('"phoneVerifiedAt":{"not":null}')
    expect(serializedQuery).toContain('"phone":"' + normalizedRecipient + '"')
    expect(serializedQuery).toContain(
      '"whatsAppCandidateSuppressions":{"none"',
    )
  })

  test("records Account evidence only through exact active access and a verified phone", async () => {
    const db = createDb({
      conversations: [
        conversation({
          accountAccess: { accountUserId: "user_1", id: "access_1" },
          guestIdentity: { notificationContacts: [] },
        }),
      ],
    })

    await discoverStoreConversationWhatsAppCandidate(db.client, {
      connectionId: "connection_1",
      externalCustomerIdDigest: recipientDigest,
      inboundEventId: "event_1",
      notificationDestinationDigest,
      normalizedExternalCustomerId: normalizedRecipient,
      now,
      providerEventDigest,
      storeId: "store_1",
      tenantId: "tenant_1",
      tokenServices,
    })

    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        accountAccessId: "access_1",
        accountUserId: "user_1",
        evidenceKind: "ACCOUNT_VERIFIED_PHONE",
        notificationContactId: null,
      }),
      model: "candidate",
    })
  })

  test("releases zero matches and fails closed on multiple recent matches without writes", async () => {
    for (const [conversations, expected] of [
      [[], "new_request"],
      [
        [conversation(), conversation({ id: "conversation_2" })],
        "ambiguous",
      ],
    ] as const) {
      const db = createDb({ conversations: [...conversations] })
      const result = await discoverStoreConversationWhatsAppCandidate(db.client, {
        connectionId: "connection_1",
        externalCustomerIdDigest: recipientDigest,
        inboundEventId: "event_1",
        notificationDestinationDigest,
        normalizedExternalCustomerId: normalizedRecipient,
        now,
        providerEventDigest,
        storeId: "store_1",
        tenantId: "tenant_1",
        tokenServices,
      })

      expect(result.state).toBe(expected)
      expect(db.writes).toHaveLength(0)
    }
  })

  test("replays the held candidate by inbound event without duplicating capabilities", async () => {
    const db = createDb({
      conversations: [conversation()],
      existingCandidate: {
        connectionId: "connection_1",
        conversationId: "conversation_1",
        externalCustomerIdDigest: recipientDigest,
        expiresAt: new Date("2026-08-16T12:10:00.000Z"),
        id: "candidate_existing",
        inboundEventId: "event_1",
        revision: 2,
        status: "PENDING",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    })

    const result = await discoverStoreConversationWhatsAppCandidate(db.client, {
      connectionId: "connection_1",
      externalCustomerIdDigest: recipientDigest,
      inboundEventId: "event_1",
      notificationDestinationDigest,
      normalizedExternalCustomerId: normalizedRecipient,
      now,
      providerEventDigest,
      storeId: "store_1",
      tenantId: "tenant_1",
      tokenServices,
    })

    expect(result).toEqual({
      candidateId: "candidate_existing",
      replayed: true,
      state: "held",
    })
    expect(db.writes).toHaveLength(0)
  })
})
