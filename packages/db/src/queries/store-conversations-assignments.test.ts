import { describe, expect, test } from "bun:test"

import {
  claimStoreConversation,
  handoffStoreConversation,
  reassignStoreConversation,
  recordFailedStoreConversationResponse,
  recordOverdueStoreConversationEscalations,
  releaseStoreConversation,
  releaseStoreConversationsForIneligibleMembership,
} from "./store-conversations-assignments"

type Call = { args: unknown; name: string }

function createDb() {
  const calls: Call[] = []
  const receipts = new Map<string, Record<string, unknown>>()
  const conversation = {
    assignedMembershipId: null as string | null,
    assignmentRevision: 0,
    id: "conversation_1",
    lastCustomerMessageSequence: 4,
    lastMessageSequence: 4,
    lastStoreReplySequence: 0,
    lifecycle: "ACTIVE",
    moderationState: "OPEN",
    responseDueAt: new Date("2026-08-12T12:00:00.000Z") as Date | null,
    storeId: "store_1",
    tenantId: "tenant_1",
  }
  const db = {
    $queryRaw: async (...args: unknown[]) => {
      calls.push({ args, name: "queryRaw" })
      return [{ ...conversation }]
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(db),
    membership: {
      findFirst: async (args: unknown) => {
        calls.push({ args, name: "membership.findFirst" })
        const serialized = JSON.stringify(args)
        if (serialized.includes('"role":{"in"')) {
          if (serialized.includes("manager_user")) return null
          return {
            id: "membership_1",
            role: "OWNER",
            user: { displayName: "Ada", name: "Ada" },
          }
        }
        if (serialized.includes("membership_2")) {
          return {
            id: "membership_2",
            role: "OPERATOR",
            user: { displayName: "Bola", name: "Bola" },
          }
        }
        return {
          id: "membership_1",
          role: "OPERATOR",
          user: { displayName: "Ada", name: "Ada" },
        }
      },
    },
    serviceCommerceStoreTeamAssignment: {
      findMany: async () => [],
    },
    store: { findFirst: async () => ({ id: "store_1" }) },
    storeConversation: {
      findFirst: async () => ({ ...conversation }),
      findMany: async (args: {
        where?: { assignedMembershipId?: string }
      }) => {
        calls.push({ args, name: "conversation.findMany" })
        if (args.where?.assignedMembershipId === "membership_1") {
          return conversation.assignedMembershipId === "membership_1"
            ? [{ ...conversation }]
            : []
        }
        return [{ ...conversation }]
      },
      updateMany: async (args: {
        data: {
          assignedMembershipId?: string | null
          assignmentRevision: number
        }
      }) => {
        calls.push({ args, name: "conversation.updateMany" })
        conversation.assignedMembershipId =
          args.data.assignedMembershipId ?? null
        conversation.assignmentRevision = args.data.assignmentRevision
        return { count: 1 }
      },
    },
    storeConversationAssignmentEvent: {
      create: async (args: unknown) => {
        calls.push({ args, name: "assignmentEvent.create" })
        return { id: "assignment_event" }
      },
    },
    storeConversationAuditEvent: {
      create: async (args: unknown) => {
        calls.push({ args, name: "audit.create" })
        return { id: "audit" }
      },
    },
    storeConversationCommandReceipt: {
      create: async (args: { data: Record<string, unknown> }) => {
        receipts.set(String(args.data.clientOperationId), args.data)
        return { id: "receipt", ...args.data }
      },
      findFirst: async (args: {
        where: { clientOperationId: string }
      }) => receipts.get(args.where.clientOperationId) ?? null,
    },
    storeConversationEscalationEvent: {
      createMany: async (args: unknown) => {
        calls.push({ args, name: "escalation.createMany" })
        return { count: 1 }
      },
      findFirst: async () => null,
    },
  }
  return { calls, conversation, db }
}

describe("Store Conversation assignments", () => {
  test("claims once and replays the original assignment revision", async () => {
    const fixture = createDb()
    const input = {
      actorUserId: "user_1",
      clientOperationId: "claim-operation-1",
      conversationId: "conversation_1",
      expectedAssignmentRevision: 0,
      storeId: "store_1",
      tenantId: "tenant_1",
    }

    expect(await claimStoreConversation(fixture.db as never, input)).toEqual({
      assignmentRevision: 1,
      conversationId: "conversation_1",
      replayed: false,
    })
    expect(await claimStoreConversation(fixture.db as never, input)).toEqual({
      assignmentRevision: 1,
      conversationId: "conversation_1",
      replayed: true,
    })
    await expect(
      claimStoreConversation(fixture.db as never, {
        ...input,
        actorUserId: "another_user",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })
    expect(
      fixture.calls.filter((call) => call.name === "assignmentEvent.create"),
    ).toHaveLength(1)
  })

  test("hands off only from the current primary to an eligible attendant", async () => {
    const fixture = createDb()
    fixture.conversation.assignedMembershipId = "membership_1"
    fixture.conversation.assignmentRevision = 2

    const result = await handoffStoreConversation(fixture.db as never, {
      actorUserId: "user_1",
      clientOperationId: "handoff-operation-1",
      conversationId: "conversation_1",
      expectedAssignmentRevision: 2,
      reason: "shift_change",
      storeId: "store_1",
      tenantId: "tenant_1",
      toMembershipId: "membership_2",
    })

    expect(result).toMatchObject({ assignmentRevision: 3, replayed: false })
    expect(fixture.conversation.assignedMembershipId).toBe("membership_2")
    expect(
      fixture.calls.find((call) => call.name === "assignmentEvent.create")
        ?.args,
    ).toMatchObject({
      data: {
        fromMembershipId: "membership_1",
        reason: "shift_change",
        toMembershipId: "membership_2",
        type: "HANDED_OFF",
      },
    })
  })

  test("allows only an Owner or Admin to reassign an active conversation", async () => {
    const fixture = createDb()
    fixture.conversation.assignedMembershipId = "membership_2"
    fixture.conversation.assignmentRevision = 3

    expect(
      await reassignStoreConversation(fixture.db as never, {
        actorUserId: "owner_user",
        clientOperationId: "reassign-operation-1",
        conversationId: "conversation_1",
        expectedAssignmentRevision: 3,
        reason: "operational_recovery",
        storeId: "store_1",
        tenantId: "tenant_1",
        toMembershipId: "membership_1",
      }),
    ).toMatchObject({ assignmentRevision: 4, replayed: false })
    expect(
      fixture.calls.find((call) => call.name === "assignmentEvent.create")
        ?.args,
    ).toMatchObject({
      data: {
        fromMembershipId: "membership_2",
        reason: "operational_recovery",
        toMembershipId: "membership_1",
        type: "REASSIGNED",
      },
    })
    await expect(
      reassignStoreConversation(fixture.db as never, {
        actorUserId: "manager_user",
        clientOperationId: "reassign-operation-2",
        conversationId: "conversation_1",
        expectedAssignmentRevision: 4,
        reason: "operational_recovery",
        storeId: "store_1",
        tenantId: "tenant_1",
        toMembershipId: "membership_2",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  test("opens an abandoned escalation when the primary releases unanswered work", async () => {
    const fixture = createDb()
    fixture.conversation.assignedMembershipId = "membership_1"
    fixture.conversation.assignmentRevision = 2

    await releaseStoreConversation(fixture.db as never, {
      actorUserId: "user_1",
      clientOperationId: "release-operation-1",
      conversationId: "conversation_1",
      expectedAssignmentRevision: 2,
      reason: "workload_balance",
      storeId: "store_1",
      tenantId: "tenant_1",
    })

    expect(
      fixture.calls.find((call) => call.name === "escalation.createMany")?.args,
    ).toMatchObject({
      data: [
        expect.objectContaining({
          kind: "ABANDONED",
          reasonCode: "workload_balance",
        }),
      ],
    })
  })

  test("records a failed primary response once without customer content", async () => {
    const fixture = createDb()
    fixture.conversation.assignedMembershipId = "membership_1"
    fixture.conversation.assignmentRevision = 2

    expect(
      await recordFailedStoreConversationResponse(fixture.db as never, {
        actorUserId: "user_1",
        clientOperationId: "reply-operation-conflict-1",
        conversationId: "conversation_1",
        expectedAssignmentRevision: 2,
        reasonCode: "reply_conflict",
        storeId: "store_1",
        tenantId: "tenant_1",
      }),
    ).toEqual({ recorded: true })
    expect(
      fixture.calls.find((call) => call.name === "escalation.createMany")?.args,
    ).toMatchObject({
      data: [
        expect.objectContaining({
          kind: "FAILED_RESPONSE",
          reasonCode: "reply_conflict",
        }),
      ],
    })
    expect(
      JSON.stringify(
        fixture.calls.find((call) => call.name === "escalation.createMany"),
      ),
    ).not.toContain("customer")
  })

  test("releases assignments and opens a bounded escalation when membership becomes ineligible", async () => {
    const fixture = createDb()
    fixture.conversation.assignedMembershipId = "membership_1"

    const result = await releaseStoreConversationsForIneligibleMembership(
      fixture.db as never,
      {
        actorMembershipId: "manager_membership",
        membershipId: "membership_1",
        now: new Date("2026-08-12T12:00:00.000Z"),
        reasonCode: "membership_suspended",
        tenantId: "tenant_1",
      },
    )

    expect(result).toEqual({ releasedCount: 1 })
    expect(fixture.conversation.assignedMembershipId).toBeNull()
    expect(
      fixture.calls.find((call) => call.name === "escalation.createMany")?.args,
    ).toMatchObject({
      data: [
        expect.objectContaining({
          kind: "MEMBERSHIP_UNAVAILABLE",
          reasonCode: "membership_suspended",
        }),
      ],
      skipDuplicates: true,
    })
  })

  test("records overdue response facts without reading customer content", async () => {
    const fixture = createDb()
    const result = await recordOverdueStoreConversationEscalations(
      fixture.db as never,
      { limit: 20, now: new Date("2026-08-12T12:00:00.000Z") },
    )

    expect(result).toEqual({ openedCount: 1, scannedCount: 1 })
    const inventory = fixture.calls.find((call) => call.name === "queryRaw")
    expect(JSON.stringify(inventory)).toContain(
      "StoreConversationEscalationEvent",
    )
    expect(JSON.stringify(inventory)).toContain("NOT EXISTS")
    expect(JSON.stringify(inventory)).toContain(
      "FOR UPDATE OF conversation SKIP LOCKED",
    )
    expect(JSON.stringify(inventory)).not.toContain('message"')
  })
})
