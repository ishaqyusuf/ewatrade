import { describe, expect, test } from "bun:test"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  acknowledgeGuestStoreConversationProgress,
  acknowledgeStoreConversationStaffRead,
  getGuestStoreConversationMessagesAfter,
  getStoreConversationStaffMessagesAfter,
} from "./store-conversations-realtime"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

const credentialToken = "customer-credential-token-that-is-at-least-32"
const publicToken = "public-entry-token-that-is-at-least-32-characters"

function guestDependencies() {
  return {
    customerEntryPoint: {
      findFirst: async () => ({
        id: "entry_1",
        revision: 1,
        store: { name: "Ada Store" },
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    },
    serviceCommercePolicyAuditEvent: { createMany: async () => ({ count: 1 }) },
    serviceCommercePolicyDecision: { findMany: async () => [] },
    serviceCommerceStoreProfile: {
      findFirst: async () => ({
        intakeEnabled: true,
        status: "ACTIVE",
        webEnabled: true,
        whatsappEnabled: false,
      }),
    },
    serviceCommerceStoreTeamAssignment: {
      findFirst: async () => ({ id: "assignment_1" }),
    },
    store: { findFirst: async () => ({ countryCode: "NG" }) },
    whatsAppStoreBinding: { findMany: async () => [] },
  }
}

function activeCredential() {
  return {
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    guestIdentity: { id: "guest_1", status: "ACTIVE" },
    guestIdentityId: "guest_1",
    id: "credential_1",
    purpose: "WEB_DEVICE",
    status: "ACTIVE",
  }
}

describe("Store Conversation realtime repositories", () => {
  test("returns committed messages strictly after sequence in ascending order", async () => {
    let messageWhere: Record<string, unknown> | undefined
    const client = {
      ...guestDependencies(),
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: {
        findFirst: async () => ({
          guestIdentityId: "guest_1",
          id: "conversation_1",
          lastMessageSequence: 8,
          store: { name: "Ada Store" },
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      storeConversationGuestCredential: {
        findFirst: async () => activeCredential(),
        update: async () => ({ id: "credential_1" }),
      },
      storeConversationGuestIdentity: {
        update: async () => ({ id: "guest_1" }),
      },
      storeConversationMessage: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          messageWhere = args.where
          return [
            {
              attachments: [],
              authorKind: "STORE_ATTENDANT",
              body: "Your quotation is ready.",
              channel: "WEB",
              id: "message_8",
              kind: "STORE_TEXT",
              occurredAt: new Date("2026-08-13T10:00:00.000Z"),
              requestLinks: [],
              sequence: 8,
            },
          ]
        },
      },
    }

    const result = await getGuestStoreConversationMessagesAfter(
      dbClient(client),
      {
        afterSequence: 7,
        conversationId: "conversation_1",
        credentialToken,
        limit: 25,
        publicToken,
      },
      undefined,
      {
        issueCapabilityToken: () =>
          "action-capability-token-that-is-long-enough",
      },
    )

    expect(messageWhere).toMatchObject({ sequence: { gt: 7 } })
    expect(result.messages.map((message) => message.sequence)).toEqual([8])
    expect(result.lastMessageSequence).toBe(8)
    expect(result.nextCursor).toBeNull()
    expect(result.channelMode).toMatchObject({
      composerEnabled: false,
      desiredMode: "ewatrade_chat",
      effectiveMode: "unavailable",
      historyReadable: true,
      whatsappAction: null,
    })
    expect(result.availability).toEqual({
      available: false,
      customerMessage:
        "The Store is not accepting new chat messages right now.",
      reason: "service_unavailable",
      recovery: ["view_history", "notify_when_available"],
      reopensAt: null,
      state: "unavailable_indefinitely",
    })
  })

  test("returns current availability when no new message was committed", async () => {
    const client = {
      ...guestDependencies(),
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: {
        findFirst: async () => ({
          guestIdentityId: "guest_1",
          id: "conversation_1",
          lastMessageSequence: 8,
          store: { name: "Ada Store" },
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      storeConversationGuestCredential: {
        findFirst: async () => activeCredential(),
        update: async () => ({ id: "credential_1" }),
      },
      storeConversationGuestIdentity: {
        update: async () => ({ id: "guest_1" }),
      },
      storeConversationMessage: { findMany: async () => [] },
    }

    const result = await getGuestStoreConversationMessagesAfter(
      dbClient(client),
      {
        afterSequence: 8,
        conversationId: "conversation_1",
        credentialToken,
        publicToken,
      },
    )

    expect(result.messages).toEqual([])
    expect(result.availability.available).toBe(false)
    expect(result.availability.reason).toBe("service_unavailable")
  })

  test("reprojects a mounted Quote action when no newer message exists", async () => {
    const actionRow = {
      conversationId: "conversation_1",
      createdByUserId: "removed_user",
      messageId: "message_action_1",
      occurredAt: new Date("2026-08-13T10:00:00.000Z"),
      quoteSnapshot: {
        currencyCode: "NGN",
        mode: "single",
        options: [
          {
            id: "option_1",
            label: "Prescription total",
            position: 1,
            totalMinor: 25_000,
          },
        ],
        quoteVersion: 1,
      },
      quoteVersion: {
        acceptedOrder: null,
        currencyCode: "NGN",
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        issuedAt: new Date("2026-08-13T10:00:00.000Z"),
        optionSelection: null,
        quote: { currentVersionId: "version_1" },
        revokedAt: new Date("2026-08-13T11:00:00.000Z"),
        status: "REVOKED",
        version: 1,
      },
      quoteVersionId: "version_1",
      sourceId: "prescription_1",
      sourceKind: "PRESCRIPTION_REQUEST",
      storeId: "store_1",
      tenantId: "tenant_1",
    }
    const client = {
      ...guestDependencies(),
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: {
        findFirst: async () => ({
          guestIdentityId: "guest_1",
          id: "conversation_1",
          lastMessageSequence: 8,
          store: { name: "Ada Store" },
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      storeConversationActionMessage: {
        findMany: async () => [actionRow],
      },
      storeConversationGuestCredential: {
        findFirst: async () => activeCredential(),
        update: async () => ({ id: "credential_1" }),
      },
      storeConversationGuestIdentity: {
        update: async () => ({ id: "guest_1" }),
      },
      storeConversationMessage: { findMany: async () => [] },
    }

    const result = await getGuestStoreConversationMessagesAfter(
      dbClient(client),
      {
        actionMessageIds: ["message_action_1"],
        afterSequence: 8,
        conversationId: "conversation_1",
        credentialToken,
        publicToken,
      },
      undefined,
      {
        issueCapabilityToken: () =>
          "action-capability-token-that-is-long-enough",
      },
    )

    expect(result.messages).toEqual([])
    expect(result.actionMessageUpdates).toEqual([
      {
        actionMessage: expect.objectContaining({
          actions: [],
          lifecycle: "revoked",
          recovery: "talk_to_store",
        }),
        messageId: "message_action_1",
      },
    ])
  })

  test("retries a concurrent capability materialization conflict once", async () => {
    let attempts = 0
    const client = {
      ...guestDependencies(),
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        attempts += 1
        if (attempts === 1) {
          throw new Prisma.PrismaClientKnownRequestError(
            "Concurrent capability identity",
            { clientVersion: "test", code: "P2002" },
          )
        }
        return callback(client)
      },
      storeConversation: {
        findFirst: async () => ({
          guestIdentityId: "guest_1",
          id: "conversation_1",
          lastMessageSequence: 8,
          store: { name: "Ada Store" },
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      storeConversationGuestCredential: {
        findFirst: async () => activeCredential(),
        update: async () => ({ id: "credential_1" }),
      },
      storeConversationGuestIdentity: {
        update: async () => ({ id: "guest_1" }),
      },
      storeConversationMessage: { findMany: async () => [] },
    }

    await expect(
      getGuestStoreConversationMessagesAfter(dbClient(client), {
        afterSequence: 8,
        conversationId: "conversation_1",
        credentialToken,
        publicToken,
      }),
    ).resolves.toMatchObject({ messages: [] })
    expect(attempts).toBe(2)
  })

  test("acknowledgement advances monotonically and exact replay returns one watermark", async () => {
    let delivered = 3
    let read = 2
    let receipt: Record<string, unknown> | null = null
    let receiptCreates = 0
    const client = {
      ...guestDependencies(),
      $queryRaw: async () => [{ id: "conversation_1" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: {
        findFirst: async () => ({
          guestIdentityId: "guest_1",
          id: "conversation_1",
          lastMessageSequence: 9,
          store: { name: "Ada Store" },
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      storeConversationCommandReceipt: {
        create: async (args: { data: Record<string, unknown> }) => {
          receiptCreates += 1
          receipt = args.data
          return { id: "receipt_1" }
        },
        findFirst: async () => receipt,
      },
      storeConversationCustomerWatermark: {
        findUnique: async () => ({
          deliveredThroughSequence: delivered,
          readThroughSequence: read,
        }),
        upsert: async (args: {
          update: {
            deliveredThroughSequence: number
            readThroughSequence: number
          }
        }) => {
          delivered = args.update.deliveredThroughSequence
          read = args.update.readThroughSequence
          return {
            deliveredThroughSequence: delivered,
            readThroughSequence: read,
          }
        },
      },
      storeConversationGuestCredential: {
        findFirst: async () => activeCredential(),
        update: async () => ({ id: "credential_1" }),
      },
      storeConversationGuestIdentity: {
        update: async () => ({ id: "guest_1" }),
      },
    }
    const input = {
      clientOperationId: "acknowledge-read-0001",
      conversationId: "conversation_1",
      credentialToken,
      deliveredThroughSequence: 8,
      publicToken,
      readThroughSequence: 7,
    }

    const first = await acknowledgeGuestStoreConversationProgress(
      dbClient(client),
      input,
    )
    const replay = await acknowledgeGuestStoreConversationProgress(
      dbClient(client),
      input,
    )

    expect(first).toMatchObject({
      deliveredThroughSequence: 8,
      readThroughSequence: 7,
      replayed: false,
    })
    expect(replay).toMatchObject({
      deliveredThroughSequence: 8,
      readThroughSequence: 7,
      replayed: true,
    })
    expect(receiptCreates).toBe(1)
  })

  test("binds a progress receipt to the exact guest credential", async () => {
    let activeCredentialId = "credential_1"
    let receipt: Record<string, unknown> | null = null
    const client = {
      ...guestDependencies(),
      $queryRaw: async () => [{ id: "conversation_1" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: {
        findFirst: async () => ({
          guestIdentityId: "guest_1",
          id: "conversation_1",
          lastMessageSequence: 2,
          store: { name: "Ada Store" },
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      storeConversationCommandReceipt: {
        create: async (args: { data: Record<string, unknown> }) => {
          receipt = args.data
          return { id: "receipt_1" }
        },
        findFirst: async () => receipt,
      },
      storeConversationCustomerWatermark: {
        findUnique: async () => null,
        upsert: async () => ({
          deliveredThroughSequence: 2,
          readThroughSequence: 2,
        }),
      },
      storeConversationGuestCredential: {
        findFirst: async () => ({
          ...activeCredential(),
          id: activeCredentialId,
        }),
        update: async () => ({ id: activeCredentialId }),
      },
      storeConversationGuestIdentity: {
        update: async () => ({ id: "guest_1" }),
      },
    }
    const input = {
      clientOperationId: "shared-device-operation-0001",
      conversationId: "conversation_1",
      credentialToken,
      deliveredThroughSequence: 2,
      publicToken,
      readThroughSequence: 2,
    }

    await acknowledgeGuestStoreConversationProgress(dbClient(client), input)
    activeCredentialId = "credential_2"
    await expect(
      acknowledgeGuestStoreConversationProgress(dbClient(client), input),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  test("staff read acknowledgement is Membership-scoped and monotonic", async () => {
    let readThroughSequence = 4
    const client = {
      $queryRaw: async () => [{ id: "conversation_1" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      membership: {
        findFirst: async () => ({
          id: "membership_1",
          role: "MEMBER",
          user: { displayName: "Ada", name: "Ada" },
        }),
      },
      storeConversation: {
        findFirst: async () => ({
          id: "conversation_1",
          lastMessageSequence: 8,
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      storeConversationCommandReceipt: {
        create: async () => ({ id: "receipt_1" }),
        findFirst: async () => null,
      },
      storeConversationStaffWatermark: {
        findUnique: async () => ({ readThroughSequence }),
        upsert: async (args: {
          update: { readThroughSequence: number }
        }) => {
          readThroughSequence = args.update.readThroughSequence
          return { readThroughSequence }
        },
      },
    }

    const result = await acknowledgeStoreConversationStaffRead(
      dbClient(client),
      {
        actorUserId: "user_1",
        clientOperationId: "staff-read-acknowledge-0001",
        conversationId: "conversation_1",
        readThroughSequence: 7,
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    )

    expect(result).toEqual({ readThroughSequence: 7, replayed: false })
  })

  test("staff after-sequence recovery is attendant-scoped, ascending and bounded", async () => {
    const findManyCalls: Array<Record<string, unknown>> = []
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      membership: {
        findFirst: async () => ({
          id: "membership_1",
          role: "MEMBER",
          user: { displayName: "Ada", name: "Ada" },
        }),
      },
      storeConversation: {
        findFirst: async () => ({
          id: "conversation_1",
          lastMessageSequence: 9,
          storeId: "store_1",
          tenantId: "tenant_1",
        }),
      },
      storeConversationMessage: {
        findMany: async (args: Record<string, unknown>) => {
          findManyCalls.push(args)
          return [
            {
              attachments: [],
              authorKind: "CUSTOMER",
              body: "First",
              channel: "WEB",
              id: "message_8",
              kind: "CUSTOMER_TEXT",
              occurredAt: new Date("2030-01-01T00:00:00.000Z"),
              requestLinks: [],
              sequence: 8,
            },
            {
              attachments: [],
              authorKind: "CUSTOMER",
              body: "Second",
              channel: "WEB",
              id: "message_9",
              kind: "CUSTOMER_TEXT",
              occurredAt: new Date("2030-01-01T00:01:00.000Z"),
              requestLinks: [],
              sequence: 9,
            },
          ]
        },
      },
    }

    const result = await getStoreConversationStaffMessagesAfter(
      dbClient(client),
      {
        actorUserId: "user_1",
        afterSequence: 7,
        conversationId: "conversation_1",
        limit: 1,
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    )

    expect(result).toMatchObject({
      lastMessageSequence: 9,
      messages: [{ id: "message_8", sequence: 8 }],
      nextCursor: 8,
    })
    expect(findManyCalls[0]).toMatchObject({
      orderBy: { sequence: "asc" },
      take: 2,
      where: {
        conversationId: "conversation_1",
        sequence: { gt: 7 },
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    })
  })
})
