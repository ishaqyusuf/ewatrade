import { describe, expect, test } from "bun:test"

import type { PrismaClient } from "../../generated/prisma/client"
import { getStoreConversationStaffTimeline } from "./store-conversations-staff"

function dbClient(client: Record<string, unknown>) {
  return client as unknown as PrismaClient
}

describe("Store Conversation staff timeline", () => {
  test("returns the scoped timeline only after its legacy and sensitive read audits", async () => {
    const calls: string[] = []
    const transaction = {
      commerceInquiry: { findMany: async () => [] },
      membership: {
        findFirst: async () => ({
          id: "membership_1",
          role: "MANAGER",
          user: { displayName: "Ada", name: "Ada" },
        }),
      },
      prescriptionRequest: { findMany: async () => [] },
      serviceRequest: { findMany: async () => [] },
      store: { findFirst: async () => ({ id: "store_1" }) },
      storeConversation: {
        findFirst: async (args: { include?: unknown }) => {
          if (!args.include) return { id: "conversation_1" }
          calls.push("timeline-read")
          return {
            assignedMembership: {
              id: "membership_1",
              user: { displayName: "Ada", name: "Ada" },
            },
            assignedMembershipId: "membership_1",
            assignmentRevision: 2,
            id: "conversation_1",
            lastCustomerMessageAt: null,
            lastMessageSequence: 0,
            lastStoreReplyAt: null,
            lifecycle: "ACTIVE",
            moderationRevision: 0,
            moderationState: "OPEN",
            restrictedAt: null,
            store: { name: "Ada Pharmacy" },
          }
        },
      },
      storeConversationAuditEvent: {
        create: async () => {
          calls.push("legacy-audit")
          return { id: "legacy_audit_1" }
        },
      },
      storeConversationEscalationEvent: { findFirst: async () => null },
      storeConversationMessage: { findMany: async () => [] },
      storeConversationRequestLink: { findMany: async () => [] },
      storeConversationSensitiveReadAuditEvent: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          calls.push("sensitive-audit")
          expect(data).toMatchObject({
            actorMembershipId: "membership_1",
            conversationId: "conversation_1",
            kind: "TIMELINE",
            outcome: "ALLOWED",
            purpose: "CONVERSATION_SUPPORT",
          })
          return { id: "sensitive_audit_1" }
        },
      },
    }
    const client = dbClient({
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(transaction),
    })

    const result = await getStoreConversationStaffTimeline(client, {
      actorUserId: "user_1",
      conversationId: "conversation_1",
      storeId: "store_1",
      tenantId: "tenant_1",
    })

    expect(calls).toEqual(["timeline-read", "legacy-audit", "sensitive-audit"])
    expect(result).toMatchObject({
      conversation: { id: "conversation_1", storeName: "Ada Pharmacy" },
      messages: [],
      requests: [],
    })
  })
})
