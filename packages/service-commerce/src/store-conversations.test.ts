import { describe, expect, test } from "bun:test"

import {
  storeConversationAttachmentCapabilityInputSchema,
  storeConversationAttachmentCommitInputSchema,
  storeConversationBootstrapInputSchema,
  storeConversationHandoffInputSchema,
  storeConversationGuestCredentialRotationInputSchema,
  storeConversationMessagesAfterInputSchema,
  storeConversationModerationCommandInputSchema,
  storeConversationMobileListInputSchema,
  storeConversationQueueInputSchema,
  storeConversationReadAcknowledgementInputSchema,
  storeConversationReleaseInputSchema,
  storeConversationReplyInputSchema,
  storeConversationSelectRequestInputSchema,
  storeConversationSendTextInputSchema,
  storeConversationTimelineInputSchema,
  storeConversationTransferClaimInputSchema,
  storeConversationTransferCreateInputSchema,
} from "./schemas/store-conversations"
import {
  projectStoreConversationAttachment,
  projectStoreConversationCursor,
  projectStoreConversationQuoteActionMessage,
  projectStoreConversationModeration,
  projectStoreConversationSla,
  isStoreConversationGuestCredentialRotationDue,
} from "./store-conversations"

describe("Store Conversation contracts", () => {
  test("rotates missing and thirty-day-old Guest credentials, not current ones", () => {
    const now = new Date("2026-08-16T12:00:00.000Z")
    expect(isStoreConversationGuestCredentialRotationDue({ now })).toBe(true)
    expect(
      isStoreConversationGuestCredentialRotationDue({
        issuedAt: "2026-07-17T12:00:00.000Z",
        now,
      }),
    ).toBe(true)
    expect(
      isStoreConversationGuestCredentialRotationDue({
        issuedAt: "2026-08-15T12:00:00.000Z",
        now,
      }),
    ).toBe(false)
  })

  test("uses action-specific moderation reasons and neutral customer recovery", () => {
    expect(
      storeConversationModerationCommandInputSchema.parse({
        action: "restrict",
        clientOperationId: "moderate-conversation-1",
        conversationId: "conversation_1",
        expectedRevision: 0,
        operatorNote: "Repeated automated submissions",
        reason: "spam_or_abuse",
        storeId: "store_1",
      }),
    ).toMatchObject({ action: "restrict", reason: "spam_or_abuse" })
    expect(() =>
      storeConversationModerationCommandInputSchema.parse({
        action: "reinstate",
        clientOperationId: "moderate-conversation-2",
        conversationId: "conversation_1",
        expectedRevision: 1,
        reason: "spam_or_abuse",
        storeId: "store_1",
      }),
    ).toThrow()
    expect(
      projectStoreConversationModeration({
        moderationRevision: 2,
        moderationState: "RESTRICTED",
        restrictedAt: new Date("2026-08-16T12:00:00.000Z"),
      }),
    ).toEqual({
      customerMessage:
        "This Store has paused new messages in this conversation. Your existing history and requests are still available.",
      recovery: "wait_for_reinstatement",
      restrictedAt: new Date("2026-08-16T12:00:00.000Z"),
      revision: 2,
      state: "restricted",
    })
  })
  test("owns bounded after-sequence recovery and monotonic acknowledgement inputs", () => {
    expect(
      storeConversationMessagesAfterInputSchema.parse({
        afterSequence: 7,
        conversationId: "conversation_1",
      }),
    ).toEqual({
      actionMessageIds: [],
      afterSequence: 7,
      conversationId: "conversation_1",
      limit: 100,
    })
    expect(
      storeConversationReadAcknowledgementInputSchema.parse({
        clientOperationId: "acknowledge-read-0001",
        conversationId: "conversation_1",
        deliveredThroughSequence: 9,
        readThroughSequence: 8,
      }),
    ).toMatchObject({
      deliveredThroughSequence: 9,
      readThroughSequence: 8,
    })
    expect(() =>
      storeConversationMessagesAfterInputSchema.parse({
        afterSequence: -1,
        conversationId: "conversation_1",
      }),
    ).toThrow()
    expect(() =>
      storeConversationReadAcknowledgementInputSchema.parse({
        clientOperationId: "acknowledge-read-0002",
        conversationId: "conversation_1",
        deliveredThroughSequence: 8,
        readThroughSequence: 9,
      }),
    ).toThrow()
  })

  test("requires an exact current Request and one authoritative attachment owner", () => {
    const request = {
      id: "inquiry_1",
      kind: "commerce_inquiry" as const,
      revision: 3,
    }
    expect(
      storeConversationAttachmentCapabilityInputSchema.parse({
        conversationId: "conversation_1",
        publicToken: "p".repeat(32),
        request,
      }),
    ).toMatchObject({ request })
    expect(
      storeConversationAttachmentCommitInputSchema.parse({
        channel: "mobile",
        clientOperationId: "attachment-command-1",
        conversationId: "conversation_1",
        owner: { kind: "generic", sourceAttachmentId: "attachment_1" },
        publicToken: "p".repeat(32),
        request,
      }).owner,
    ).toEqual({ kind: "generic", sourceAttachmentId: "attachment_1" })
    expect(() =>
      storeConversationAttachmentCommitInputSchema.parse({
        channel: "web",
        clientOperationId: "attachment-command-2",
        conversationId: "conversation_1",
        owner: {
          kind: "generic",
          prescriptionMediaId: "media_1",
          sourceAttachmentId: "attachment_1",
        },
        publicToken: "p".repeat(32),
        request,
      }),
    ).toThrow()
  })

  test("projects allowlisted attachment recovery without private owner references", () => {
    expect(
      projectStoreConversationAttachment({
        id: "conversation_attachment_1",
        kind: "IMAGE",
        lifecycle: "QUARANTINED",
        ownerKind: "generic",
      }),
    ).toEqual({
      durationMs: null,
      id: "conversation_attachment_1",
      kind: "image",
      label: "Image attachment",
      recovery: "contact_store",
      state: "quarantined",
      viewable: false,
    })
    expect(
      projectStoreConversationAttachment({
        id: "conversation_attachment_2",
        kind: "DOCUMENT",
        lifecycle: "SAFE",
        ownerKind: "prescription",
      }),
    ).toEqual({
      durationMs: null,
      id: "conversation_attachment_2",
      kind: "document",
      label: "Document attachment",
      recovery: null,
      state: "safe",
      viewable: true,
    })
    for (const ownerKind of ["generic", "prescription"] as const) {
      expect(
        projectStoreConversationAttachment({
          id: `deleted-${ownerKind}`,
          kind: "DOCUMENT",
          lifecycle: "DELETED",
          ownerKind,
        }),
      ).toEqual({
        durationMs: null,
        id: `deleted-${ownerKind}`,
        kind: "document",
        label: "Document attachment",
        recovery: "remove_and_retry",
        state: "deleted",
        viewable: false,
      })
    }
  })

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
    expect(
      storeConversationMobileListInputSchema.parse({
        direction: "forward",
        pageSize: 25,
      }),
    ).toEqual({ direction: "forward", pageSize: 25 })
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
    expect(
      storeConversationGuestCredentialRotationInputSchema.parse({
        clientOperationId: "credential-rotation-0001",
        targetCredentialToken: "r".repeat(32),
      }),
    ).toEqual({
      clientOperationId: "credential-rotation-0001",
      targetCredentialToken: "r".repeat(32),
    })
    expect(() =>
      storeConversationGuestCredentialRotationInputSchema.parse({
        clientOperationId: "credential-rotation-0002",
        targetCredentialToken: "short",
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

  test("projects mutually exclusive Quote options without retaining stale actions", () => {
    const actions = [
      {
        action: "choose_quote_option" as const,
        amountMinor: 30_000,
        capabilityToken: "capability-token-that-is-long-enough",
        confirmation: "required" as const,
        consequence: "Select this exact quotation option before acceptance.",
        currencyCode: "NGN",
        expiresAt: new Date("2030-01-02T00:00:00.000Z"),
        label: "Choose Express",
      },
    ]
    const current = projectStoreConversationQuoteActionMessage({
      actions,
      completed: false,
      currencyCode: "NGN",
      expiresAt: new Date("2030-01-02T00:00:00.000Z"),
      now: new Date("2030-01-01T00:00:00.000Z"),
      options: [
        { id: "option_2", label: "Express", position: 2, totalMinor: 30_000 },
        { id: "option_1", label: "Standard", position: 1, totalMinor: 20_000 },
      ],
      quoteVersion: 3,
      revokedAt: null,
      selectedOptionId: "option_1",
      status: "issued",
    })
    expect(current).toMatchObject({
      actions,
      currencyCode: "NGN",
      lifecycle: "current",
      options: [
        { id: "option_1", selected: true, totalMinor: 20_000 },
        { id: "option_2", selected: false, totalMinor: 30_000 },
      ],
      quoteVersion: 3,
      recovery: null,
    })
    expect(current).not.toHaveProperty("totalMinor")

    expect(
      projectStoreConversationQuoteActionMessage({
        actions: [
          {
            action: "pay_now",
            amountMinor: 20_000,
            capabilityToken: "payment-capability-token-that-is-long-enough",
            confirmation: "required",
            consequence: "Open the current hosted checkout.",
            currencyCode: "NGN",
            expiresAt: new Date("2030-01-03T00:00:00.000Z"),
            label: "Pay now",
          },
        ],
        completed: true,
        currencyCode: "NGN",
        expiresAt: new Date("2030-01-02T00:00:00.000Z"),
        now: new Date("2030-01-01T00:00:00.000Z"),
        options: [
          {
            id: "option_1",
            label: "Standard",
            position: 1,
            totalMinor: 20_000,
          },
        ],
        quoteVersion: 3,
        revokedAt: null,
        selectedOptionId: "option_1",
        status: "accepted",
      }),
    ).toMatchObject({
      actions: [{ action: "pay_now" }],
      lifecycle: "completed",
    })

    expect(
      projectStoreConversationQuoteActionMessage({
        ...current,
        actions,
        completed: false,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        now: new Date("2030-01-01T00:00:01.000Z"),
        options: current.options.map((option, position) => ({
          ...option,
          position,
        })),
        revokedAt: null,
        selectedOptionId: "option_1",
        status: "issued" as const,
      }),
    ).toMatchObject({ actions: [], lifecycle: "expired", recovery: "refresh" })
  })
})
