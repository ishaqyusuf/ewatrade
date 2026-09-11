import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  appendFirstReleasedQuoteAccountInvitationInTransaction,
  linkGuestStoreConversationsToAccount,
  listGuestStoreConversationAccountCandidates,
  listStoreConversationAccountConversations,
  listStoreConversationAccountDevices,
  resumeStoreConversationForAccount,
  revokeStoreConversationAccountDevice,
} from "./store-conversation-accounts"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

const credentialToken = "guest-credential-token-that-is-long-enough"

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function activeCredential(status = "ACTIVE") {
  return {
    expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    guestIdentity: { id: "guest_1", status: "ACTIVE" },
    guestIdentityId: "guest_1",
    id: "credential_1",
    purpose: "WEB_DEVICE",
    status,
    tokenDigest: digest(credentialToken),
  }
}

describe("Store Conversation account adoption repositories", () => {
  test("resumes only the authenticated account conversation for the resolved Store", async () => {
    const touchedAccessIds: string[] = []
    const client = {
      customerEntryPoint: {
        findFirst: async (args: { where: Record<string, unknown> }) => {
          expect(args.where).toMatchObject({
            publicTokenDigest: digest(
              "published-entry-token-that-is-long-enough",
            ),
            status: "PUBLISHED",
          })
          return { storeId: "store_1", tenantId: "tenant_1" }
        },
      },
      storeConversationAccountAccess: {
        findFirst: async (args: { where: Record<string, unknown> }) => {
          expect(args.where).toMatchObject({
            accountUserId: "account_1",
            storeId: "store_1",
            tenantId: "tenant_1",
          })
          return { conversationId: "conversation_1", id: "access_1" }
        },
        update: async (args: { where: { id: string } }) => {
          touchedAccessIds.push(args.where.id)
          return { id: args.where.id }
        },
      },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }

    await expect(
      resumeStoreConversationForAccount(dbClient(client), {
        accountUserId: "account_1",
        now: new Date("2026-08-15T10:00:00.000Z"),
        publicToken: "published-entry-token-that-is-long-enough",
      }),
    ).resolves.toEqual({ conversation: { id: "conversation_1" } })
    expect(touchedAccessIds).toEqual(["access_1"])
  })

  test("appends one invitation after the first released Quote and replays without another message", async () => {
    let invitation: { id: string; messageId: string } | null = null
    let lastMessageSequence = 4
    let messageCreates = 0
    const client = {
      $queryRaw: async () => [{ id: "conversation_1" }],
      storeConversation: {
        findFirst: async () => ({
          id: "conversation_1",
          lastMessageSequence,
        }),
        updateMany: async (args: { data: { lastMessageSequence: number } }) => {
          lastMessageSequence = args.data.lastMessageSequence
          return { count: 1 }
        },
      },
      storeConversationAccountInvitation: {
        create: async (args: { data: { messageId: string } }) => {
          invitation = { id: "invitation_1", messageId: args.data.messageId }
          return invitation
        },
        findUnique: async () => invitation,
      },
      storeConversationMessage: {
        create: async (args: {
          data: { kind: string; sequence: number }
        }) => {
          messageCreates += 1
          expect(args.data.kind).toBe("ACCOUNT_INVITATION")
          expect(args.data.sequence).toBe(5)
          return { id: "message_invitation_1" }
        },
      },
    }

    const input = {
      conversationId: "conversation_1",
      quoteVersionId: "quote_version_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    }
    expect(
      await appendFirstReleasedQuoteAccountInvitationInTransaction(
        dbClient(client),
        input,
      ),
    ).toEqual({
      id: "invitation_1",
      messageId: "message_invitation_1",
      replayed: false,
    })
    expect(
      await appendFirstReleasedQuoteAccountInvitationInTransaction(
        dbClient(client),
        input,
      ),
    ).toEqual({
      id: "invitation_1",
      messageId: "message_invitation_1",
      replayed: true,
    })
    expect(messageCreates).toBe(1)
    expect(lastMessageSequence).toBe(5)
  })

  test("enumerates only the current credential's safe conversations without contact lookup", async () => {
    let customerRead = false
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      customer: {
        findMany: async () => {
          customerRead = true
          return []
        },
      },
      storeConversation: {
        findMany: async () => [
          {
            accountAccess: null,
            accountInvitations: [{ status: "OFFERED" }],
            id: "conversation_1",
            lastActivityAt: new Date("2026-08-14T18:00:00.000Z"),
            moderationState: "OPEN",
            store: { name: "Ada Bags" },
          },
        ],
      },
      storeConversationGuestCredential: {
        findFirst: async () => activeCredential(),
        update: async (args: { data: { expiresAt: Date } }) => ({
          expiresAt: args.data.expiresAt,
        }),
      },
      storeConversationGuestIdentity: {
        update: async () => ({ id: "guest_1" }),
      },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }

    const result = await listGuestStoreConversationAccountCandidates(
      dbClient(client),
      {
        accountUserId: "account_1",
        credentialToken,
      },
    )

    expect(result.items).toEqual([
      {
        conversationId: "conversation_1",
        invitationState: "offered",
        lastActivityAt: new Date("2026-08-14T18:00:00.000Z"),
        linked: false,
        state: "active",
        storeAvatar: { kind: "initials", label: "AB" },
        storeName: "Ada Bags",
      },
    ])
    expect(customerRead).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/email|phone|tokenDigest/i)
  })

  test("links an exact selection once and converges a same-payload replay", async () => {
    const accesses = new Map<string, { accountUserId: string }>()
    const audits: Array<Record<string, unknown>> = []
    let command: Record<string, unknown> | null = null
    const rows = () =>
      [
        {
          accountInvitations: [{ id: "invitation_1" }],
          id: "conversation_1",
          storeId: "store_1",
          tenantId: "tenant_1",
        },
        {
          accountInvitations: [{ id: "invitation_2" }],
          id: "conversation_2",
          storeId: "store_2",
          tenantId: "tenant_2",
        },
      ].map((row) => ({
        ...row,
        accountAccess: accesses.get(row.id) ?? null,
      }))
    const client = {
      $queryRaw: async () => [{ id: "locked" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: { findMany: async () => rows() },
      storeConversationAccountAccess: {
        count: async () => accesses.size,
        create: async (args: {
          data: { accountUserId: string; conversationId: string }
        }) => {
          accesses.set(args.data.conversationId, {
            accountUserId: args.data.accountUserId,
          })
          return { id: `access_${args.data.conversationId}` }
        },
        findMany: async () => [],
      },
      storeConversationAccountAuditEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          audits.push(args.data)
          return { id: `audit_${audits.length}` }
        },
      },
      storeConversationAccountInvitation: {
        updateMany: async () => ({ count: 1 }),
      },
      storeConversationAccountLinkCommand: {
        create: async (args: { data: Record<string, unknown> }) => {
          command = { id: "command_1", ...args.data }
          return command
        },
        findUnique: async () => command,
      },
      storeConversationGuestCredential: {
        findFirst: async () => activeCredential(),
        update: async () => ({ id: "credential_1" }),
      },
      storeConversationGuestIdentity: {
        update: async () => ({ id: "guest_1" }),
      },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }
    const input = {
      accountUserId: "account_1",
      clientOperationId: "account-link-operation-1",
      confirmed: true as const,
      conversationIds: ["conversation_2", "conversation_1"],
      credentialToken,
    }

    expect(
      await linkGuestStoreConversationsToAccount(dbClient(client), input),
    ).toEqual({
      linkedConversationIds: ["conversation_1", "conversation_2"],
      replayed: false,
    })
    expect(accesses.size).toBe(2)
    expect(audits).toHaveLength(2)
    expect(JSON.stringify(audits)).not.toMatch(/message|media|email|phone/i)
    expect(
      await linkGuestStoreConversationsToAccount(dbClient(client), input),
    ).toEqual({
      linkedConversationIds: ["conversation_1", "conversation_2"],
      replayed: true,
    })
    expect(audits).toHaveLength(2)
  })

  test("rejects an altered replay before reading or linking conversations", async () => {
    const audits: Array<Record<string, unknown>> = []
    let conversationReads = 0
    const client = {
      $queryRaw: async () => [{ id: "locked" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: {
        findMany: async () => {
          conversationReads += 1
          return []
        },
      },
      storeConversationAccountAuditEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          audits.push(args.data)
          return { id: "audit_1" }
        },
      },
      storeConversationAccountLinkCommand: {
        findUnique: async () => ({
          accountUserId: "account_1",
          clientOperationId: "account-link-altered-replay",
          guestIdentityId: "guest_1",
          linkedConversationCount: 1,
          payloadHash: "original-payload-hash",
        }),
      },
      storeConversationGuestCredential: {
        findFirst: async () => activeCredential(),
      },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }

    await expect(
      linkGuestStoreConversationsToAccount(dbClient(client), {
        accountUserId: "account_1",
        clientOperationId: "account-link-altered-replay",
        confirmed: true,
        conversationIds: ["conversation_2"],
        credentialToken,
      }),
    ).rejects.toThrow(
      "This account-link command was already used with different input.",
    )
    expect(conversationReads).toBe(0)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      outcome: "DENIED",
      reasonCode: "account_link_operation_conflict",
    })
  })

  test("rejects an expired guest credential before enumerating a link selection", async () => {
    let conversationReads = 0
    const client = {
      $queryRaw: async () => [{ id: "locked" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: {
        findMany: async () => {
          conversationReads += 1
          return []
        },
      },
      storeConversationGuestCredential: { findFirst: async () => null },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }

    await expect(
      linkGuestStoreConversationsToAccount(dbClient(client), {
        accountUserId: "account_1",
        clientOperationId: "account-link-expired-credential",
        confirmed: true,
        conversationIds: ["conversation_1"],
        credentialToken,
      }),
    ).rejects.toThrow(
      "This guest session is unavailable. Start again from the Store link.",
    )
    expect(conversationReads).toBe(0)
  })

  test("rejects a foreign conversation selection without creating access", async () => {
    const audits: Array<Record<string, unknown>> = []
    let accessCreates = 0
    const client = {
      $queryRaw: async () => [{ id: "locked" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: { findMany: async () => [] },
      storeConversationAccountAccess: {
        create: async () => {
          accessCreates += 1
          return { id: "unexpected_access" }
        },
      },
      storeConversationAccountAuditEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          audits.push(args.data)
          return { id: "audit_1" }
        },
      },
      storeConversationAccountLinkCommand: { findUnique: async () => null },
      storeConversationGuestCredential: {
        findFirst: async () => activeCredential(),
      },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }

    await expect(
      linkGuestStoreConversationsToAccount(dbClient(client), {
        accountUserId: "account_1",
        clientOperationId: "account-link-foreign-selection",
        confirmed: true,
        conversationIds: ["foreign_conversation"],
        credentialToken,
      }),
    ).rejects.toThrow(
      "One or more conversations are no longer available to link.",
    )
    expect(accessCreates).toBe(0)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      outcome: "DENIED",
      reasonCode: "account_link_selection_unavailable",
    })
    expect(audits[0]).not.toHaveProperty("storeId")
    expect(audits[0]).not.toHaveProperty("tenantId")
  })

  test("does not reassign a conversation already linked to another account", async () => {
    const audits: Array<Record<string, unknown>> = []
    let accessCreates = 0
    const conversation = {
      accountAccess: { accountUserId: "account_2" },
      accountInvitations: [{ id: "invitation_1" }],
      id: "conversation_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    }
    const client = {
      $queryRaw: async () => [{ id: "locked" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: { findMany: async () => [conversation] },
      storeConversationAccountAccess: {
        create: async () => {
          accessCreates += 1
          return { id: "unexpected_access" }
        },
      },
      storeConversationAccountAuditEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          audits.push(args.data)
          return { id: "audit_1" }
        },
      },
      storeConversationAccountLinkCommand: { findUnique: async () => null },
      storeConversationGuestCredential: {
        findFirst: async () => activeCredential(),
      },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }

    await expect(
      linkGuestStoreConversationsToAccount(dbClient(client), {
        accountUserId: "account_1",
        clientOperationId: "account-link-existing-owner",
        confirmed: true,
        conversationIds: ["conversation_1"],
        credentialToken,
      }),
    ).rejects.toThrow("One conversation is already linked to another account.")
    expect(accessCreates).toBe(0)
    expect(audits[0]).toMatchObject({
      conversationId: "conversation_1",
      outcome: "DENIED",
      reasonCode: "account_link_conversation_conflict",
      storeId: "store_1",
      tenantId: "tenant_1",
    })
  })

  test("rejects two selected conversations for the same Store before linking either", async () => {
    const audits: Array<Record<string, unknown>> = []
    let accessCreates = 0
    const conversations = [
      {
        accountAccess: null,
        accountInvitations: [{ id: "invitation_1" }],
        id: "conversation_1",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
      {
        accountAccess: null,
        accountInvitations: [{ id: "invitation_2" }],
        id: "conversation_2",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
    ]
    const client = {
      $queryRaw: async () => [{ id: "locked" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversation: { findMany: async () => conversations },
      storeConversationAccountAccess: {
        create: async () => {
          accessCreates += 1
          return { id: "unexpected_access" }
        },
      },
      storeConversationAccountAuditEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          audits.push(args.data)
          return { id: "audit_1" }
        },
      },
      storeConversationAccountLinkCommand: {
        findUnique: async () => null,
      },
      storeConversationGuestCredential: {
        findFirst: async () => activeCredential(),
      },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }

    await expect(
      linkGuestStoreConversationsToAccount(dbClient(client), {
        accountUserId: "account_1",
        clientOperationId: "account-link-same-store-conflict",
        confirmed: true,
        conversationIds: ["conversation_1", "conversation_2"],
        credentialToken,
      }),
    ).rejects.toThrow(
      "Choose only one active conversation for each Store before linking.",
    )
    expect(accessCreates).toBe(0)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      outcome: "DENIED",
      reasonCode: "account_link_selected_store_conflict",
      storeId: "store_1",
      tenantId: "tenant_1",
    })
  })

  test("lists account conversations without requiring a guest credential", async () => {
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversationAccountAccess: {
        findMany: async () => [
          {
            conversation: {
              id: "conversation_1",
              lastActivityAt: new Date("2026-08-14T18:00:00.000Z"),
              lastMessageSequence: 4,
              lifecycle: "ACTIVE",
              messages: [{ authorKind: "STORE_ATTENDANT", body: "Ready" }],
              moderationState: "OPEN",
              store: {
                customerEntryPoint: {
                  publicToken: "public-token-123456789012345678901234",
                  status: "PUBLISHED",
                },
                name: "Ada Bags",
              },
            },
            conversationId: "conversation_1",
            lastOpenedAt: new Date("2026-08-14T17:00:00.000Z"),
            storeId: "store_1",
            tenantId: "tenant_1",
          },
        ],
      },
      storeConversationMessage: { count: async () => 1 },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }

    const result = await listStoreConversationAccountConversations(
      dbClient(client),
      { accountUserId: "account_1" },
    )

    expect(result).toEqual({
      items: [
        {
          conversationId: "conversation_1",
          lastActivityAt: new Date("2026-08-14T18:00:00.000Z"),
          lastMessage: { author: "store", text: "Ready" },
          lastMessageSequence: 4,
          publicToken: "public-token-123456789012345678901234",
          state: "active",
          storeAvatar: { kind: "initials", label: "AB" },
          storeName: "Ada Bags",
          unreadStoreMessages: 1,
        },
      ],
      nextCursor: null,
    })
  })

  test("includes active transferred guest devices for account-linked conversations", async () => {
    let eligibleIdentityIds: string[] = []
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversationAccountAccess: {
        findMany: async () => [
          {
            conversation: {
              guestAccesses: [{ guestIdentityId: "guest_transferred" }],
              guestIdentityId: "guest_owner",
            },
            linkedGuestIdentityId: "guest_linked",
          },
        ],
      },
      storeConversationGuestCredential: {
        findMany: async (args: {
          where: { guestIdentityId: { in: string[] } }
        }) => {
          eligibleIdentityIds = args.where.guestIdentityId.in
          return []
        },
      },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }

    expect(
      await listStoreConversationAccountDevices(dbClient(client), {
        accountUserId: "account_1",
      }),
    ).toEqual([])
    expect(eligibleIdentityIds.sort()).toEqual([
      "guest_linked",
      "guest_owner",
      "guest_transferred",
    ])
  })

  test("revokes only one eligible guest credential and replays exactly", async () => {
    let credentialStatus = "ACTIVE"
    let command: Record<string, unknown> | null = null
    let updateCount = 0
    const client = {
      $queryRaw: async () => [{ id: "locked" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversationAccountAccess: {
        findMany: async () => [
          {
            conversationId: "conversation_1",
            storeId: "store_1",
            tenantId: "tenant_1",
          },
        ],
      },
      storeConversationAccountAuditEvent: {
        create: async () => ({ id: "audit_1" }),
      },
      storeConversationAccountDeviceCommand: {
        create: async (args: { data: Record<string, unknown> }) => {
          command = { id: "device_command_1", ...args.data }
          return command
        },
        findUnique: async () => command,
      },
      storeConversationGuestCredential: {
        findUnique: async () => ({
          guestIdentityId: "guest_1",
          id: "credential_1",
          status: credentialStatus,
        }),
        update: async () => {
          updateCount += 1
          credentialStatus = "REVOKED"
          return { id: "credential_1" }
        },
      },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }
    const input = {
      accountUserId: "account_1",
      clientOperationId: "device-revoke-operation-1",
      confirmed: true as const,
      deviceId: "credential_1",
    }

    expect(
      await revokeStoreConversationAccountDevice(dbClient(client), input),
    ).toEqual({ deviceId: "credential_1", replayed: false })
    expect(updateCount).toBe(1)
    expect(
      await revokeStoreConversationAccountDevice(dbClient(client), input),
    ).toEqual({ deviceId: "credential_1", replayed: true })
    expect(updateCount).toBe(1)
  })

  test("denies revoking a guest device that does not prove an account-linked conversation", async () => {
    const audits: Array<Record<string, unknown>> = []
    let credentialUpdates = 0
    const client = {
      $queryRaw: async () => [{ id: "locked" }],
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(client),
      storeConversationAccountAccess: { findMany: async () => [] },
      storeConversationAccountAuditEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          audits.push(args.data)
          return { id: "audit_1" }
        },
      },
      storeConversationAccountDeviceCommand: { findUnique: async () => null },
      storeConversationGuestCredential: {
        findUnique: async () => ({
          guestIdentityId: "foreign_guest",
          id: "foreign_credential",
          status: "ACTIVE",
        }),
        update: async () => {
          credentialUpdates += 1
          return { id: "foreign_credential" }
        },
      },
      user: { findUnique: async () => ({ id: "account_1" }) },
    }

    await expect(
      revokeStoreConversationAccountDevice(dbClient(client), {
        accountUserId: "account_1",
        clientOperationId: "device-revoke-foreign-credential",
        confirmed: true,
        deviceId: "foreign_credential",
      }),
    ).rejects.toThrow("This linked device is unavailable.")
    expect(credentialUpdates).toBe(0)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      outcome: "DENIED",
      reasonCode: "device_revoke_forbidden",
    })
  })
})
