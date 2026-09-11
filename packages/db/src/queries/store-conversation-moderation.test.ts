import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { moderateStoreConversation } from "./store-conversation-moderation"

function createDb(input: {
  moderationRevision?: number
  moderationState?: "OPEN" | "RESTRICTED"
  role?: "ADMIN" | "CASHIER" | "MANAGER" | "OWNER"
}) {
  const writes: Array<{ data: Record<string, unknown>; model: string }> = []
  let current = {
    id: "conversation_1",
    lifecycle: "ACTIVE" as const,
    moderationRevision: input.moderationRevision ?? 0,
    moderationState: input.moderationState ?? ("OPEN" as const),
    restrictedAt:
      input.moderationState === "RESTRICTED"
        ? new Date("2026-08-16T10:00:00.000Z")
        : null,
  }
  let command: Record<string, unknown> | null = null
  const client = {
    $queryRaw: async () => [{ id: "conversation_1" }],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(client),
    membership: {
      findFirst: async () => ({
        id: "membership_1",
        role: input.role ?? "MANAGER",
      }),
    },
    store: { findFirst: async () => ({ id: "store_1" }) },
    storeConversation: {
      findFirst: async () => ({ ...current }),
      findUnique: async () => ({ ...current }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "conversation" })
        current = { ...current, ...data } as typeof current
        return { count: 1 }
      },
    },
    storeConversationAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "legacy_audit" })
        return { ...data, id: "legacy_audit_1" }
      },
    },
    storeConversationModerationAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "moderation_audit" })
        return { ...data, id: `audit_${writes.length}` }
      },
    },
    storeConversationModerationCommand: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        command = { ...data, id: "command_1" }
        writes.push({ data, model: "moderation_command" })
        return command
      },
      findUnique: async () => command,
    },
  }
  return { client: client as unknown as PrismaClient, writes }
}

const restrictInput = {
  action: "restrict" as const,
  actorUserId: "user_1",
  clientOperationId: "moderation-operation-1",
  conversationId: "conversation_1",
  expectedRevision: 0,
  operatorNote: "Repeated automated messages",
  reason: "spam_or_abuse" as const,
  storeId: "store_1",
  tenantId: "tenant_1",
}

describe("Store Conversation moderation", () => {
  test("restricts through one revisioned payload-bound command and immutable audit", async () => {
    const db = createDb({})
    const result = await moderateStoreConversation(db.client, restrictInput)

    expect(result).toMatchObject({
      customerMessage:
        "This Store has paused new messages in this conversation. Your existing history and requests are still available.",
      recovery: "wait_for_reinstatement",
      replayed: false,
      revision: 1,
      state: "restricted",
    })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        moderationRevision: 1,
        moderationState: "RESTRICTED",
      }),
      model: "conversation",
    })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        action: "RESTRICT",
        actorMembershipId: "membership_1",
        operatorNote: "Repeated automated messages",
        reason: "SPAM_OR_ABUSE",
        resultingRevision: 1,
      }),
      model: "moderation_command",
    })
    expect(db.writes).toContainEqual({
      data: expect.objectContaining({
        outcome: "ALLOWED",
        reasonCode: "moderation_applied",
      }),
      model: "moderation_audit",
    })
    expect(JSON.stringify(db.writes)).not.toMatch(/message body|prescription|phone/i)
  })

  test("replays the exact successful command and rejects changed input", async () => {
    const db = createDb({})
    await moderateStoreConversation(db.client, restrictInput)
    const replay = await moderateStoreConversation(db.client, restrictInput)
    expect(replay).toMatchObject({ replayed: true, revision: 1 })
    expect(
      db.writes.filter((write) => write.model === "moderation_command"),
    ).toHaveLength(1)

    await expect(
      moderateStoreConversation(db.client, {
        ...restrictInput,
        operatorNote: "Different payload",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(db.writes.at(-1)).toEqual({
      data: expect.objectContaining({
        outcome: "DENIED",
        reasonCode: "moderation_replay_mismatch",
      }),
      model: "moderation_audit",
    })
  })

  test("audits a role denial without changing conversation state", async () => {
    const db = createDb({ role: "CASHIER" })
    await expect(
      moderateStoreConversation(db.client, restrictInput),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    expect(db.writes).toEqual([
      {
        data: expect.objectContaining({
          outcome: "DENIED",
          reasonCode: "moderation_role_forbidden",
        }),
        model: "moderation_audit",
      },
    ])
  })

  test("reinstates without deleting existing conversation history", async () => {
    const db = createDb({
      moderationRevision: 1,
      moderationState: "RESTRICTED",
      role: "OWNER",
    })
    const result = await moderateStoreConversation(db.client, {
      action: "reinstate",
      actorUserId: "user_1",
      clientOperationId: "moderation-operation-2",
      conversationId: "conversation_1",
      expectedRevision: 1,
      reason: "review_complete",
      storeId: "store_1",
      tenantId: "tenant_1",
    })

    expect(result).toEqual({
      customerMessage: null,
      recovery: null,
      replayed: false,
      restrictedAt: null,
      revision: 2,
      state: "open",
    })
    expect(
      db.writes.some((write) =>
        /message|request/i.test(write.model),
      ),
    ).toBe(false)
  })
})
