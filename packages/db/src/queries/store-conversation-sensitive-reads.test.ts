import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationError,
  digestStoreConversationValue,
} from "./store-conversations-core"
import { runStoreConversationSensitiveRead } from "./store-conversation-sensitive-reads"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

function authorizedClient(audits: Record<string, unknown>[]) {
  const transaction = {
    membership: {
      findFirst: async () => ({ id: "membership_1", role: "STAFF" }),
    },
    store: { findFirst: async () => ({ id: "store_1" }) },
    storeConversation: {
      findFirst: async () => ({ id: "conversation_1" }),
    },
    storeConversationSensitiveReadAuditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data)
        return data
      },
    },
  }
  return dbClient({
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(transaction),
  })
}

describe("Store Conversation sensitive reads", () => {
  test("returns a personally authorized read only after an allowed audit", async () => {
    const audits: Record<string, unknown>[] = []
    const calls: string[] = []
    const result = await runStoreConversationSensitiveRead(
      authorizedClient(audits),
      {
        actorUserId: "user_1",
        conversationId: "conversation_1",
        kind: "timeline",
        purpose: "conversation_support",
        storeId: "store_1",
        tenantId: "tenant_1",
      },
      async ({ membership }) => {
        calls.push(`read:${membership.id}`)
        return { safe: true }
      },
    )

    expect(result).toEqual({ safe: true })
    expect(calls).toEqual(["read:membership_1"])
    expect(audits).toEqual([
      expect.objectContaining({
        actorMembershipId: "membership_1",
        actorUserId: "user_1",
        conversationId: "conversation_1",
        kind: "TIMELINE",
        outcome: "ALLOWED",
        purpose: "CONVERSATION_SUPPORT",
        reasonCode: "sensitive_read_authorized",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    ])
  })

  test("commits a bounded denial before throwing and never invokes the reader", async () => {
    const audits: Record<string, unknown>[] = []
    let readCalled = false
    const transaction = {
      membership: { findFirst: async () => null },
      store: { findFirst: async () => ({ id: "store_1" }) },
      storeConversation: {
        findFirst: async () => ({ id: "conversation_1" }),
      },
      storeConversationSensitiveReadAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audits.push(data)
          return data
        },
      },
    }
    const client = dbClient({
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(transaction),
    })

    await expect(
      runStoreConversationSensitiveRead(
        client,
        {
          actorUserId: "user_1",
          conversationId: "conversation_1",
          kind: "timeline",
          purpose: "conversation_support",
          storeId: "store_1",
          tenantId: "tenant_1",
        },
        async () => {
          readCalled = true
          return null
        },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(readCalled).toBe(false)
    expect(audits).toEqual([
      expect.objectContaining({
        actorMembershipId: null,
        conversationId: "conversation_1",
        outcome: "DENIED",
        reasonCode: "sensitive_read_membership_forbidden",
        storeId: "store_1",
      }),
    ])
  })

  test("digests an attachment subject and does not persist caller reason or content", async () => {
    const audits: Record<string, unknown>[] = []
    await runStoreConversationSensitiveRead(
      authorizedClient(audits),
      {
        actorUserId: "user_1",
        conversationId: "conversation_1",
        kind: "attachment",
        purpose: "customer_request_attachment_review",
        storeId: "store_1",
        subjectReference: "message_attachment_private_1",
        tenantId: "tenant_1",
      },
      async () => "authorized",
    )

    expect(audits[0]?.subjectReferenceDigest).toBe(
      digestStoreConversationValue("message_attachment_private_1"),
    )
    const serialized = JSON.stringify(audits)
    expect(serialized).not.toContain("message_attachment_private_1")
    expect(serialized).not.toContain("customer message")
    expect(serialized).not.toContain("objectKey")
    expect(serialized).not.toContain("provider")
  })

  test("records a safe denied outcome for an expected scoped read failure", async () => {
    const audits: Record<string, unknown>[] = []
    await expect(
      runStoreConversationSensitiveRead(
        authorizedClient(audits),
        {
          actorUserId: "user_1",
          conversationId: "conversation_1",
          kind: "attachment",
          purpose: "customer_request_attachment_review",
          storeId: "store_1",
          subjectReference: "missing_attachment",
          tenantId: "tenant_1",
        },
        async () => {
          throw new StoreConversationError(
            "NOT_FOUND",
            "This conversation attachment is unavailable.",
          )
        },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
    expect(audits).toEqual([
      expect.objectContaining({
        outcome: "DENIED",
        reasonCode: "sensitive_read_not_found",
      }),
    ])
  })

  test("fails closed when the immutable audit write fails", async () => {
    const transaction = {
      membership: {
        findFirst: async () => ({ id: "membership_1", role: "STAFF" }),
      },
      store: { findFirst: async () => ({ id: "store_1" }) },
      storeConversation: {
        findFirst: async () => ({ id: "conversation_1" }),
      },
      storeConversationSensitiveReadAuditEvent: {
        create: async () => {
          throw new Error("audit unavailable")
        },
      },
    }
    const client = dbClient({
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(transaction),
    })
    let resultEscaped = false

    await expect(
      runStoreConversationSensitiveRead(
        client,
        {
          actorUserId: "user_1",
          conversationId: "conversation_1",
          kind: "timeline",
          purpose: "conversation_support",
          storeId: "store_1",
          tenantId: "tenant_1",
        },
        async () => {
          resultEscaped = true
          return { privateResult: true }
        },
      ),
    ).rejects.toThrow("audit unavailable")
    expect(resultEscaped).toBe(true)
  })
})
