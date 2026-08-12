import { describe, expect, test } from "bun:test"

import { createCallerFactory } from "../../init"
import { serviceCommerceConversationsRouter } from "./conversations"

const createCaller = createCallerFactory(serviceCommerceConversationsRouter)

function caller(input?: { attendant?: boolean; stores?: string[] }) {
  const calls: Array<{ args: unknown; name: string }> = []
  const conversation = {
    assignedMembershipId: null as string | null,
    assignmentRevision: 0,
    id: "conversation_1",
    lastActivityAt: new Date("2026-08-12T10:00:00.000Z"),
    lastCustomerMessageAt: new Date("2026-08-12T10:00:00.000Z"),
    lastCustomerMessageSequence: 1,
    lastMessageSequence: 1,
    lastStoreReplyAt: null,
    lastStoreReplySequence: 0,
    lifecycle: "ACTIVE",
    requestLinks: [{ kind: "COMMERCE_INQUIRY" }],
    storeId: "store_1",
    tenantId: "tenant_1",
  }
  const db = {
    $queryRaw: async () => [{ id: conversation.id }],
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(db),
    membership: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "membership.findFirst" })
        return input?.attendant === false ? null : { id: "membership_1" }
      },
    },
    commerceInquiry: {
      findMany: async () => [
        {
          createdAt: new Date("2026-08-12T10:00:00.000Z"),
          id: "inquiry_1",
          revision: 1,
          status: "RECEIVED",
        },
      ],
    },
    prescriptionRequest: { findMany: async () => [] },
    serviceRequest: { findMany: async () => [] },
    storeConversation: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "conversation.findFirst" })
        return conversation
      },
      findMany: async (args: unknown) => {
        calls.push({ args, name: "conversation.findMany" })
        return [conversation]
      },
      updateMany: async (args: { data: { assignmentRevision: number } }) => {
        conversation.assignedMembershipId = "membership_1"
        conversation.assignmentRevision = args.data.assignmentRevision
        return { count: 1 }
      },
    },
    storeConversationAssignmentEvent: {
      create: async () => ({ id: "assignment_event_1" }),
    },
    storeConversationRequestLink: {
      findMany: async () => [
        {
          createdAt: new Date("2026-08-12T10:00:00.000Z"),
          kind: "COMMERCE_INQUIRY",
          sourceId: "inquiry_1",
        },
      ],
    },
    storeConversationAuditEvent: {
      create: async () => ({ id: "audit_1" }),
    },
    storeConversationCommandReceipt: {
      create: async () => ({ id: "receipt_1" }),
      findFirst: async () => null,
    },
  }
  return {
    calls,
    client: createCaller({
      db,
      session: { user: { id: "attendant_user_1" } },
      tenantContext: {
        activeStore: { id: "store_1" },
        membership: { role: "MEMBER" },
        stores: (input?.stores ?? ["store_1"]).map((id) => ({ id })),
        tenant: { id: "tenant_1" },
      },
    } as never),
  }
}

describe("Service Commerce conversations router", () => {
  test("derives actor and Tenant scope while claiming an allowed Store conversation", async () => {
    const { calls, client } = caller()
    const result = await client.claimStoreConversation({
      clientOperationId: "claim-operation-1",
      conversationId: "conversation_1",
      expectedAssignmentRevision: 0,
      storeId: "store_1",
    })

    expect(result).toMatchObject({
      assignmentRevision: 1,
      conversationId: "conversation_1",
      replayed: false,
    })
    expect(
      calls.find((call) => call.name === "membership.findFirst")?.args,
    ).toMatchObject({
      where: {
        tenantId: "tenant_1",
        userId: "attendant_user_1",
      },
    })
  })

  test("fails closed for a removed attendant or foreign Store", async () => {
    await expect(
      caller({ attendant: false }).client.storeConversationQueue({
        storeId: "store_1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })

    await expect(
      caller({ stores: ["store_1"] }).client.storeConversationQueue({
        storeId: "foreign_store",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" })
  })

  test("returns a content-free Store queue summary", async () => {
    const { calls, client } = caller()
    const result = await client.storeConversationQueue({
      storeId: "store_1",
    })
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          conversationId: "conversation_1",
          requests: [
            {
              kind: "commerce_inquiry",
              label: "Product request",
              lifecycle: "active",
              status: "received",
            },
          ],
          requestKinds: ["commerce_inquiry"],
          state: "new",
        }),
      ],
      nextCursor: null,
    })
    expect(JSON.stringify(result)).not.toContain("message")
    expect(JSON.stringify(result)).not.toContain("membershipId")
    expect(
      calls.find((call) => call.name === "conversation.findMany")?.args,
    ).toMatchObject({
      where: {
        lastMessageSequence: { gt: 0 },
        requestLinks: { some: {} },
      },
    })
  })
})
