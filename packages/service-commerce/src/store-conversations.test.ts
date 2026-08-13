import { describe, expect, test } from "bun:test"

import {
  storeConversationBootstrapInputSchema,
  storeConversationHandoffInputSchema,
  storeConversationMobileListInputSchema,
  storeConversationQueueInputSchema,
  storeConversationReleaseInputSchema,
  storeConversationReplyInputSchema,
  storeConversationSelectRequestInputSchema,
  storeConversationSendTextInputSchema,
  storeConversationTimelineInputSchema,
  storeConversationTransferClaimInputSchema,
  storeConversationTransferCreateInputSchema,
} from "./schemas/store-conversations"
import {
  projectStoreConversationCursor,
  projectStoreConversationSla,
} from "./store-conversations"

describe("Store Conversation contracts", () => {
  test("accepts an opaque Store entry and bounded text command", () => {
    expect(
      storeConversationBootstrapInputSchema.parse({
        publicToken: "a".repeat(32),
      }),
    ).toEqual({ publicToken: "a".repeat(32) })
    expect(
      storeConversationSendTextInputSchema.parse({
        clientOperationId: "send-text-123",
        conversationId: "conversation_1",
        publicToken: "a".repeat(32),
        requestIntent: "choose_request",
        text: "  I need a red handbag.  ",
      }),
    ).toMatchObject({
      requestIntent: "choose_request",
      text: "I need a red handbag.",
    })
  })

  test("rejects empty or oversized customer text", () => {
    expect(() =>
      storeConversationSendTextInputSchema.parse({
        clientOperationId: "send-text-123",
        conversationId: "conversation_1",
        publicToken: "a".repeat(32),
        text: " ",
      }),
    ).toThrow()
    expect(() =>
      storeConversationSendTextInputSchema.parse({
        clientOperationId: "send-text-123",
        conversationId: "conversation_1",
        publicToken: "a".repeat(32),
        text: "x".repeat(2_001),
      }),
    ).toThrow()
  })

  test("uses bounded deterministic sequence cursors", () => {
    expect(
      storeConversationTimelineInputSchema.parse({
        conversationId: "conversation_1",
      }),
    ).toMatchObject({ limit: 50 })
    expect(
      projectStoreConversationCursor({
        hasMore: true,
        messages: [{ sequence: 7 }, { sequence: 6 }],
      }),
    ).toBe(6)
    expect(
      projectStoreConversationCursor({
        hasMore: false,
        messages: [{ sequence: 7 }],
      }),
    ).toBeNull()
  })

  test("bounds mobile list and digest-only transfer capability inputs", () => {
    expect(storeConversationMobileListInputSchema.parse({})).toEqual({
      pageSize: 25,
    })
    expect(() =>
      storeConversationMobileListInputSchema.parse({ pageSize: 101 }),
    ).toThrow()
    expect(
      storeConversationTransferCreateInputSchema.parse({
        clientOperationId: "transfer-create-0001",
        conversationId: "conversation_1",
        publicToken: "p".repeat(32),
        transferToken: "t".repeat(32),
      }),
    ).toMatchObject({ transferToken: "t".repeat(32) })
    expect(() =>
      storeConversationTransferClaimInputSchema.parse({
        installationToken: "too-short",
        publicToken: "p".repeat(32),
        transferToken: "t".repeat(32),
      }),
    ).toThrow()
  })

  test("accepts only deterministic new or existing Request choices", () => {
    expect(
      storeConversationSelectRequestInputSchema.parse({
        clientOperationId: "request-choice-0001",
        conversationId: "conversation-1",
        messageId: "message-1",
        publicToken: "a".repeat(32),
        target: { kind: "new_commerce_inquiry" },
      }).target,
    ).toEqual({ kind: "new_commerce_inquiry" })
    expect(() =>
      storeConversationSelectRequestInputSchema.parse({
        clientOperationId: "request-choice-0002",
        conversationId: "conversation-1",
        messageId: "message-1",
        publicToken: "a".repeat(32),
        target: { kind: "existing_request", requestId: "source-1" },
      }),
    ).toThrow()
  })

  test("owns bounded queue filters and deterministic cursor state", () => {
    expect(
      storeConversationQueueInputSchema.parse({
        assignment: "mine",
        cursor: "cursor_1",
        requestKinds: ["service_request", "prescription_request"],
        sla: "overdue",
        sort: ["response_due_at", "asc"],
        storeId: "store_1",
      }),
    ).toEqual({
      assignment: "mine",
      cursor: "cursor_1",
      pageSize: 25,
      requestKinds: ["service_request", "prescription_request"],
      sla: "overdue",
      sort: ["response_due_at", "asc"],
      storeId: "store_1",
    })
    expect(() =>
      storeConversationQueueInputSchema.parse({
        pageSize: 101,
        storeId: "store_1",
      }),
    ).toThrow()
  })

  test("requires exact conversation, assignment and source revisions to reply", () => {
    expect(
      storeConversationReplyInputSchema.parse({
        clientOperationId: "reply-command-0001",
        conversationId: "conversation_1",
        expectedAssignmentRevision: 4,
        expectedLastMessageSequence: 8,
        request: {
          id: "service_1",
          kind: "service_request",
          revision: 3,
        },
        storeId: "store_1",
        text: "  We can help with that.  ",
      }),
    ).toMatchObject({
      expectedAssignmentRevision: 4,
      expectedLastMessageSequence: 8,
      request: { revision: 3 },
      text: "We can help with that.",
    })
    expect(() =>
      storeConversationReplyInputSchema.parse({
        clientOperationId: "reply-command-0002",
        conversationId: "conversation_1",
        storeId: "store_1",
        text: "Missing revision guards",
      }),
    ).toThrow()
  })

  test("uses allowlisted reasons for release and exact-target handoff", () => {
    expect(
      storeConversationReleaseInputSchema.parse({
        clientOperationId: "release-command-1",
        conversationId: "conversation_1",
        expectedAssignmentRevision: 2,
        reason: "shift_change",
        storeId: "store_1",
      }).reason,
    ).toBe("shift_change")
    expect(
      storeConversationHandoffInputSchema.parse({
        clientOperationId: "handoff-command-1",
        conversationId: "conversation_1",
        expectedAssignmentRevision: 2,
        reason: "specialist_handoff",
        storeId: "store_1",
        toMembershipId: "membership_2",
      }).toMembershipId,
    ).toBe("membership_2")
    expect(() =>
      storeConversationReleaseInputSchema.parse({
        clientOperationId: "release-command-2",
        conversationId: "conversation_1",
        expectedAssignmentRevision: 2,
        reason: "free-form private staffing detail",
        storeId: "store_1",
      }),
    ).toThrow()
  })

  test("projects response SLA from authoritative customer and Store occurrences", () => {
    const now = new Date("2026-08-12T10:20:00.000Z")
    expect(
      projectStoreConversationSla({
        lastCustomerMessageAt: new Date("2026-08-12T10:00:00.000Z"),
        lastStoreReplyAt: null,
        now,
      }),
    ).toEqual({
      dueAt: new Date("2026-08-12T10:15:00.000Z"),
      state: "overdue",
    })
    expect(
      projectStoreConversationSla({
        lastCustomerMessageAt: new Date("2026-08-12T10:00:00.000Z"),
        lastStoreReplyAt: new Date("2026-08-12T10:05:00.000Z"),
        now,
      }),
    ).toEqual({ dueAt: null, state: "responded" })
  })
})
