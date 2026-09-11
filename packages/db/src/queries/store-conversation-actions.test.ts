import { describe, expect, test } from "bun:test"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { StoreConversationRequestKind } from "../../generated/prisma/enums"
import { ServiceCommerceAccessError } from "./service-commerce-access"
import {
  appendReleasedQuoteActionMessagesInTransaction,
  executeGuestStoreConversationActionMessage,
  materializeGuestStoreConversationActionMessagesInTransaction,
  projectStoreConversationActionMessageRow,
} from "./store-conversation-actions"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

function releasedVersion() {
  return {
    currencyCode: "NGN",
    id: "version_1",
    options: [
      {
        currencyCode: "NGN",
        id: "option_2",
        label: "Express",
        position: 2,
        totalMinor: 30_000,
      },
      {
        currencyCode: "NGN",
        id: "option_1",
        label: "Standard",
        position: 1,
        totalMinor: 20_000,
      },
    ],
    quote: {
      currentVersionId: "version_1",
      sourceId: "inquiry_1",
      sourceType: "COMMERCE_INQUIRY",
      storeId: "store_1",
      tenantId: "tenant_1",
    },
    status: "ISSUED",
    version: 3,
  }
}

describe("Store Conversation Quote action messages", () => {
  test("keeps historical Quote presentation readable after its staff actor is removed", async () => {
    const row = {
      conversationId: "conversation_1",
      createdByUserId: "removed_user",
      messageId: "message_1",
      occurredAt: new Date("2030-01-01T00:00:00.000Z"),
      quoteSnapshot: {
        currencyCode: "NGN",
        mode: "single",
        options: [
          {
            id: "option_1",
            label: "Standard",
            position: 1,
            totalMinor: 20_000,
          },
        ],
        quoteVersion: 1,
      },
      quoteVersion: {
        acceptedOrder: null,
        currencyCode: "NGN",
        expiresAt: new Date("2030-01-02T00:00:00.000Z"),
        issuedAt: new Date("2030-01-01T00:00:00.000Z"),
        optionSelection: null,
        quote: { currentVersionId: "version_1" },
        revokedAt: null,
        status: "ISSUED",
        version: 1,
      },
      quoteVersionId: "version_1",
      sourceId: "inquiry_1",
      sourceKind: "COMMERCE_INQUIRY",
      storeId: "store_1",
      tenantId: "tenant_1",
    }

    const projections =
      await materializeGuestStoreConversationActionMessagesInTransaction(
        {} as never,
        {
          available: true,
          now: new Date("2030-01-01T00:01:00.000Z"),
          rows: [row as never],
        },
        {
          issueActionsInTransaction: async () => {
            throw new ServiceCommerceAccessError(
              "FORBIDDEN",
              "Membership is no longer active.",
            )
          },
          issueCapabilityToken: () =>
            "action-capability-token-that-is-long-enough",
        },
      )

    expect(projections.get("message_1")).toMatchObject({
      actions: [],
      lifecycle: "current",
      options: [{ id: "option_1", totalMinor: 20_000 }],
      recovery: "talk_to_store",
    })
  })

  test("retries one serializable action conflict and returns the converged result", async () => {
    let attempts = 0
    const result = {
      kind: "quote_option_selected" as const,
      replayed: true,
      sourceKind: "commerce_inquiry" as const,
    }
    const db = dbClient({
      $transaction: async () => {
        attempts += 1
        if (attempts === 1) {
          throw new Prisma.PrismaClientKnownRequestError(
            "Serializable transaction conflict",
            { clientVersion: "test", code: "P2034" },
          )
        }
        return result
      },
    })

    await expect(
      executeGuestStoreConversationActionMessage(db, {
        capabilityToken: "action-capability-token-that-is-long-enough",
        clientOperationId: "operation-1",
        confirmed: true,
        conversationId: "conversation-1",
        credentialToken: "guest-credential-token-that-is-long-enough",
        messageId: "message-1",
        publicToken: "published-entry-token-that-is-long-enough",
      }),
    ).resolves.toEqual(result)
    expect(attempts).toBe(2)
  })

  test("maps a repeated serializable action conflict to a safe refresh error", async () => {
    const db = dbClient({
      $transaction: async () => {
        throw new Prisma.PrismaClientKnownRequestError(
          "Serializable transaction conflict",
          { clientVersion: "test", code: "P2034" },
        )
      },
    })

    await expect(
      executeGuestStoreConversationActionMessage(db, {
        capabilityToken: "action-capability-token-that-is-long-enough",
        clientOperationId: "operation-1",
        confirmed: true,
        conversationId: "conversation-1",
        credentialToken: "guest-credential-token-that-is-long-enough",
        messageId: "message-1",
        publicToken: "published-entry-token-that-is-long-enough",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  test("retries a raw PostgreSQL serialization conflict surfaced as P2010", async () => {
    let attempts = 0
    const result = {
      kind: "quote_option_selected" as const,
      replayed: true,
      sourceKind: "commerce_inquiry" as const,
    }
    const db = dbClient({
      $transaction: async () => {
        attempts += 1
        if (attempts === 1) {
          throw new Prisma.PrismaClientKnownRequestError(
            "Raw query failed. Code: `40001`. Message: `could not serialize access due to concurrent update`",
            { clientVersion: "test", code: "P2010" },
          )
        }
        return result
      },
    })

    await expect(
      executeGuestStoreConversationActionMessage(db, {
        capabilityToken: "action-capability-token-that-is-long-enough",
        clientOperationId: "operation-1",
        confirmed: true,
        conversationId: "conversation-1",
        credentialToken: "guest-credential-token-that-is-long-enough",
        messageId: "message-1",
        publicToken: "published-entry-token-that-is-long-enough",
      }),
    ).resolves.toEqual(result)
    expect(attempts).toBe(2)
  })

  test("does not retry an unrelated raw-query failure", async () => {
    let attempts = 0
    const db = dbClient({
      $transaction: async () => {
        attempts += 1
        throw new Prisma.PrismaClientKnownRequestError(
          "Raw query failed. Code: `42P01`. Message: `relation does not exist`",
          { clientVersion: "test", code: "P2010" },
        )
      },
    })

    await expect(
      executeGuestStoreConversationActionMessage(db, {
        capabilityToken: "action-capability-token-that-is-long-enough",
        clientOperationId: "operation-1",
        confirmed: true,
        conversationId: "conversation-1",
        credentialToken: "guest-credential-token-that-is-long-enough",
        messageId: "message-1",
        publicToken: "published-entry-token-that-is-long-enough",
      }),
    ).rejects.toMatchObject({ code: "P2010" })
    expect(attempts).toBe(1)
  })

  test("reprojects immutable display facts against current Quote state", () => {
    const projected = projectStoreConversationActionMessageRow(
      {
        quoteSnapshot: {
          currencyCode: "NGN",
          mode: "alternatives",
          options: [
            {
              id: "option_1",
              label: "Standard",
              position: 1,
              totalMinor: 20_000,
            },
            {
              id: "option_2",
              label: "Express",
              position: 2,
              totalMinor: 30_000,
            },
          ],
          quoteVersion: 3,
        },
        quoteVersion: {
          acceptedOrder: null,
          currencyCode: "NGN",
          expiresAt: new Date("2030-01-03T00:00:00.000Z"),
          optionSelection: { optionId: "option_2" },
          quote: { currentVersionId: "version_2" },
          revokedAt: null,
          status: "ISSUED",
          version: 3,
        },
        quoteVersionId: "version_1",
      } as never,
      {
        actions: [
          {
            action: "choose_quote_option",
            capabilityToken: "action-capability-token-that-is-long-enough",
            confirmation: "required",
            consequence: "Select this exact quotation option.",
            expiresAt: new Date("2030-01-03T00:00:00.000Z"),
            label: "Choose Express",
          },
        ],
        now: new Date("2030-01-01T00:00:00.000Z"),
      },
    )

    expect(projected).toMatchObject({
      actions: [],
      lifecycle: "superseded",
      options: [
        { id: "option_1", selected: false },
        { id: "option_2", selected: true },
      ],
      recovery: "refresh",
    })
  })

  test("appends one ordered immutable presentation message to every exact linked conversation", async () => {
    const messages: Array<Record<string, unknown>> = []
    const actionMessages: Array<Record<string, unknown>> = []
    const requestLinks: Array<Record<string, unknown>> = []
    const notificationIntents: Array<Record<string, unknown>> = []
    const invitations = new Map<string, Record<string, unknown>>()
    const locked: string[] = []
    const conversations = new Map([
      ["conversation_a", 4],
      ["conversation_b", 8],
    ])
    const client = {
      $queryRaw: async (query: { values?: unknown[] }) => {
        const conversationId = String(query.values?.[0] ?? "")
        locked.push(conversationId)
        return [{ id: conversationId }]
      },
      commerceInquiry: {
        findFirst: async () => ({ revision: 4, status: "QUOTED" }),
      },
      commerceQuoteVersion: { findFirst: async () => releasedVersion() },
      storeConversation: {
        findFirst: async (args: { where: { id: string } }) => ({
          guestIdentityId: `guest_${args.where.id}`,
          id: args.where.id,
          lastMessageSequence: conversations.get(args.where.id),
        }),
        updateMany: async (args: {
          data: { lastMessageSequence: number }
          where: { id: string; lastMessageSequence: number }
        }) => {
          expect(conversations.get(args.where.id)).toBe(
            args.where.lastMessageSequence,
          )
          conversations.set(args.where.id, args.data.lastMessageSequence)
          return { count: 1 }
        },
      },
      storeConversationAccountAccess: { findFirst: async () => null },
      storeConversationAvailabilityConfiguration: {
        findUnique: async () => null,
      },
      storeConversationActionMessage: {
        create: async (args: { data: Record<string, unknown> }) => {
          actionMessages.push(args.data)
          return { id: `action_${actionMessages.length}`, ...args.data }
        },
        findUnique: async () => null,
      },
      storeConversationAccountInvitation: {
        create: async (args: {
          data: { conversationId: string; messageId: string }
        }) => {
          const row = {
            id: `invitation_${invitations.size + 1}`,
            ...args.data,
          }
          invitations.set(args.data.conversationId, row)
          return row
        },
        findUnique: async (args: {
          where: { conversationId_milestone: { conversationId: string } }
        }) =>
          invitations.get(args.where.conversationId_milestone.conversationId) ??
          null,
      },
      storeConversationMessage: {
        create: async (args: { data: Record<string, unknown> }) => {
          const row = { id: `message_${messages.length + 1}`, ...args.data }
          messages.push(row)
          return row
        },
      },
      storeConversationNotificationAuditEvent: {
        create: async () => ({ id: "notification_audit_1" }),
      },
      storeConversationNotificationIntent: {
        create: async (args: { data: Record<string, unknown> }) => {
          notificationIntents.push(args.data)
          return {
            id: `notification_intent_${notificationIntents.length}`,
            ...args.data,
          }
        },
        findFirst: async () => null,
      },
      storeConversationRequestLink: {
        create: async (args: { data: Record<string, unknown> }) => {
          requestLinks.push(args.data)
          return args.data
        },
        findMany: async () => [
          { conversationId: "conversation_b" },
          { conversationId: "conversation_a" },
        ],
      },
    }

    const result = await appendReleasedQuoteActionMessagesInTransaction(
      dbClient(client),
      {
        actorUserId: "user_1",
        quoteVersionId: "version_1",
        source: {
          id: "inquiry_1",
          kind: StoreConversationRequestKind.COMMERCE_INQUIRY,
        },
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    )

    expect(locked).toEqual([
      "conversation_a",
      "conversation_a",
      "conversation_b",
      "conversation_b",
    ])
    expect(result.map((item) => item.conversationId)).toEqual([
      "conversation_a",
      "conversation_b",
    ])
    expect(messages).toHaveLength(4)
    expect(
      messages.filter((message) => message.kind === "ACTION_MESSAGE"),
    ).toHaveLength(2)
    expect(
      messages.filter((message) => message.kind === "ACCOUNT_INVITATION"),
    ).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      authorKind: "SYSTEM",
      channel: "SYSTEM",
      conversationId: "conversation_a",
      kind: "ACTION_MESSAGE",
      sequence: 5,
    })
    expect(actionMessages[0]).toMatchObject({
      conversationId: "conversation_a",
      createdByUserId: "user_1",
      quoteSnapshot: {
        currencyCode: "NGN",
        mode: "alternatives",
        options: [
          {
            id: "option_1",
            label: "Standard",
            position: 1,
            totalMinor: 20_000,
          },
          {
            id: "option_2",
            label: "Express",
            position: 2,
            totalMinor: 30_000,
          },
        ],
        quoteVersion: 3,
      },
      sourceId: "inquiry_1",
      sourceKind: "COMMERCE_INQUIRY",
    })
    expect(requestLinks).toHaveLength(2)
    expect(notificationIntents).toHaveLength(2)
    expect(notificationIntents[0]).toMatchObject({
      conversationId: "conversation_a",
      kind: "UNREAD_RESPONSE",
      targetMessageId: "message_1",
      targetMessageSequence: 5,
    })
  })

  test("returns an exact release replay without allocating another sequence", async () => {
    let messageCreates = 0
    let accountInvitation: Record<string, unknown> | null = null
    const version = releasedVersion()
    const existing = {
      conversationId: "conversation_1",
      messageId: "message_1",
      payloadHash: "",
      quoteSnapshot: {
        currencyCode: version.currencyCode,
        mode: "alternatives",
        options: [...version.options].sort(
          (left, right) => left.position - right.position,
        ),
        quoteVersion: version.version,
      },
      quoteVersionId: version.id,
      sourceId: version.quote.sourceId,
      sourceKind: "COMMERCE_INQUIRY",
    }
    const client = {
      $queryRaw: async () => [{ id: "conversation_1" }],
      commerceInquiry: {
        findFirst: async () => ({ revision: 4, status: "QUOTED" }),
      },
      commerceQuoteVersion: { findFirst: async () => version },
      storeConversation: {
        findFirst: async () => ({
          guestIdentityId: "guest_1",
          id: "conversation_1",
          lastMessageSequence: 2,
        }),
      },
      storeConversationAccountAccess: { findFirst: async () => null },
      storeConversationActionMessage: {
        findUnique: async () => existing,
      },
      storeConversationAccountInvitation: {
        create: async (args: { data: Record<string, unknown> }) => {
          accountInvitation = { id: "invitation_1", ...args.data }
          return accountInvitation
        },
        findUnique: async () => accountInvitation,
      },
      storeConversationMessage: {
        create: async () => {
          messageCreates += 1
          return { id: "unexpected" }
        },
      },
      storeConversationAvailabilityConfiguration: {
        findUnique: async () => null,
      },
      storeConversationNotificationAuditEvent: {
        create: async () => ({ id: "notification_audit_1" }),
      },
      storeConversationNotificationIntent: {
        create: async (args: { data: Record<string, unknown> }) => ({
          id: "notification_intent_1",
          ...args.data,
        }),
        findFirst: async () => null,
      },
      storeConversationRequestLink: {
        findMany: async () => [{ conversationId: "conversation_1" }],
      },
    }

    const firstAttempt = await appendReleasedQuoteActionMessagesInTransaction(
      dbClient({
        ...client,
        storeConversationActionMessage: {
          create: async (args: { data: Record<string, unknown> }) => args.data,
          findUnique: async () => null,
        },
        storeConversationMessage: {
          create: async (args: { data: Record<string, unknown> }) => ({
            id: "message_1",
            ...args.data,
          }),
        },
        storeConversationRequestLink: {
          create: async (args: { data: Record<string, unknown> }) => args.data,
          findMany: async () => [{ conversationId: "conversation_1" }],
        },
        storeConversation: {
          ...client.storeConversation,
          updateMany: async () => ({ count: 1 }),
        },
      }),
      {
        actorUserId: "user_1",
        quoteVersionId: "version_1",
        source: {
          id: "inquiry_1",
          kind: StoreConversationRequestKind.COMMERCE_INQUIRY,
        },
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    )
    existing.payloadHash = firstAttempt[0]?.payloadHash ?? ""

    const replay = await appendReleasedQuoteActionMessagesInTransaction(
      dbClient(client),
      {
        actorUserId: "user_2",
        quoteVersionId: "version_1",
        source: {
          id: "inquiry_1",
          kind: StoreConversationRequestKind.COMMERCE_INQUIRY,
        },
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    )

    expect(replay).toEqual([
      {
        conversationId: "conversation_1",
        messageId: "message_1",
        payloadHash: existing.payloadHash,
        replayed: true,
      },
    ])
    expect(messageCreates).toBe(0)
  })

  test("does not append private Quote Versions", async () => {
    const client = {
      commerceQuoteVersion: {
        findFirst: async () => ({ ...releasedVersion(), status: "DRAFT" }),
      },
      storeConversationRequestLink: {
        findMany: async () => [{ conversationId: "conversation_1" }],
      },
    }
    await expect(
      appendReleasedQuoteActionMessagesInTransaction(dbClient(client), {
        actorUserId: "user_1",
        quoteVersionId: "version_1",
        source: {
          id: "inquiry_1",
          kind: StoreConversationRequestKind.COMMERCE_INQUIRY,
        },
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })

  test("does not append an issued Quote Version after it is superseded", async () => {
    const client = {
      commerceQuoteVersion: {
        findFirst: async () => ({
          ...releasedVersion(),
          quote: {
            ...releasedVersion().quote,
            currentVersionId: "version_2",
          },
        }),
      },
      storeConversationRequestLink: {
        findMany: async () => [{ conversationId: "conversation_1" }],
      },
    }
    await expect(
      appendReleasedQuoteActionMessagesInTransaction(dbClient(client), {
        actorUserId: "user_1",
        quoteVersionId: "version_1",
        source: {
          id: "inquiry_1",
          kind: StoreConversationRequestKind.COMMERCE_INQUIRY,
        },
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
  })
})
