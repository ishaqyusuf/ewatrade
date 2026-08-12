import {
  type StoreConversationTimelineProjection,
  projectStoreConversationCursor,
  storeConversationClaimInputSchema,
  storeConversationReplyInputSchema,
  storeConversationTimelineInputSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationAssignmentEventType,
  StoreConversationAuditEventType,
  StoreConversationCommandKind,
  StoreConversationLifecycle,
  StoreConversationMessageAuthorKind,
  StoreConversationMessageChannel,
  StoreConversationMessageKind,
  StoreConversationModerationState,
} from "../../generated/prisma/enums"
import {
  StoreConversationError,
  assertStoreConversationAttendant,
  lockStoreConversation,
  projectStoreConversationMessage,
  storeConversationPayloadHash,
} from "./store-conversations-core"

export async function claimStoreConversation(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    conversationId: string
    storeId: string
    tenantId: string
  },
) {
  const parsed = storeConversationClaimInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    storeId: input.storeId,
  })
  const commandHash = storeConversationPayloadHash({
    conversationId: parsed.conversationId,
  })
  return db.$transaction(async (tx) => {
    const membership = await assertStoreConversationAttendant(tx, input)
    await lockStoreConversation(tx, input)
    const conversation = await tx.storeConversation.findFirst({
      where: {
        id: parsed.conversationId,
        lifecycle: StoreConversationLifecycle.ACTIVE,
        moderationState: StoreConversationModerationState.OPEN,
        storeId: parsed.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!conversation) {
      throw new StoreConversationError("NOT_FOUND", "Conversation not found.")
    }
    const receipt = await tx.storeConversationCommandReceipt.findFirst({
      where: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
      },
    })
    if (receipt) {
      if (receipt.payloadHash !== commandHash) {
        throw new StoreConversationError(
          "CONFLICT",
          "This claim command was already used with different input.",
        )
      }
      return {
        assignmentRevision: conversation.assignmentRevision,
        conversationId: conversation.id,
        replayed: true,
      }
    }
    if (conversation.assignedMembershipId) {
      throw new StoreConversationError(
        "CONFLICT",
        "This conversation is already assigned.",
      )
    }
    const assignmentRevision = conversation.assignmentRevision + 1
    await tx.storeConversation.update({
      data: { assignedMembershipId: membership.id, assignmentRevision },
      where: { id: conversation.id },
    })
    await Promise.all([
      tx.storeConversationAssignmentEvent.create({
        data: {
          actorMembershipId: membership.id,
          assignmentRevision,
          conversationId: conversation.id,
          reason: "Attendant claimed the conversation",
          storeId: input.storeId,
          tenantId: input.tenantId,
          toMembershipId: membership.id,
          type: StoreConversationAssignmentEventType.CLAIMED,
        },
      }),
      tx.storeConversationAuditEvent.create({
        data: {
          actorKind: StoreConversationMessageAuthorKind.STORE_ATTENDANT,
          actorMembershipId: membership.id,
          conversationId: conversation.id,
          reasonCode: "attendant_claimed",
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: StoreConversationAuditEventType.CLAIMED,
        },
      }),
      tx.storeConversationCommandReceipt.create({
        data: {
          clientOperationId: parsed.clientOperationId,
          conversationId: conversation.id,
          kind: StoreConversationCommandKind.CLAIM,
          payloadHash: commandHash,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
    ])
    return {
      assignmentRevision,
      conversationId: conversation.id,
      replayed: false,
    }
  })
}

export async function replyToStoreConversation(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    conversationId: string
    storeId: string
    tenantId: string
    text: string
  },
) {
  const parsed = storeConversationReplyInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    storeId: input.storeId,
    text: input.text,
  })
  const now = new Date()
  const commandHash = storeConversationPayloadHash({
    conversationId: parsed.conversationId,
    text: parsed.text,
  })
  return db.$transaction(async (tx) => {
    const membership = await assertStoreConversationAttendant(tx, input)
    await lockStoreConversation(tx, input)
    const conversation = await tx.storeConversation.findFirst({
      where: {
        assignedMembershipId: membership.id,
        id: parsed.conversationId,
        lifecycle: StoreConversationLifecycle.ACTIVE,
        moderationState: StoreConversationModerationState.OPEN,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!conversation) {
      throw new StoreConversationError(
        "FORBIDDEN",
        "Claim this conversation before replying.",
      )
    }
    const receipt = await tx.storeConversationCommandReceipt.findFirst({
      include: {
        message: {
          include: {
            requestLinks: { select: { kind: true, sourceId: true } },
          },
        },
      },
      where: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
      },
    })
    if (receipt) {
      if (receipt.payloadHash !== commandHash || !receipt.message) {
        throw new StoreConversationError(
          "CONFLICT",
          "This reply command was already used with different input.",
        )
      }
      return {
        message: projectStoreConversationMessage(receipt.message),
        replayed: true,
      }
    }
    const currentSource = await tx.storeConversationRequestLink.findFirst({
      orderBy: { createdAt: "asc" },
      select: { kind: true, sourceId: true, sourceRevision: true },
      where: {
        conversationId: conversation.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!currentSource) {
      throw new StoreConversationError(
        "CONFLICT",
        "This conversation has no active request to reply to.",
      )
    }
    const sequence = conversation.lastMessageSequence + 1
    const message = await tx.storeConversationMessage.create({
      data: {
        authorKind: StoreConversationMessageAuthorKind.STORE_ATTENDANT,
        authorMembershipId: membership.id,
        body: parsed.text,
        channel: StoreConversationMessageChannel.WEB,
        conversationId: conversation.id,
        kind: StoreConversationMessageKind.STORE_TEXT,
        occurredAt: now,
        sequence,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.storeConversationRequestLink.create({
      data: {
        conversationId: conversation.id,
        kind: currentSource.kind,
        messageId: message.id,
        sourceId: currentSource.sourceId,
        sourceRevision: currentSource.sourceRevision,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await Promise.all([
      tx.storeConversation.update({
        data: { lastActivityAt: now, lastMessageSequence: sequence },
        where: { id: conversation.id },
      }),
      tx.storeConversationCommandReceipt.create({
        data: {
          clientOperationId: parsed.clientOperationId,
          conversationId: conversation.id,
          kind: StoreConversationCommandKind.STORE_REPLY,
          messageId: message.id,
          payloadHash: commandHash,
          sourceId: currentSource.sourceId,
          sourceKind: currentSource.kind,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
      tx.storeConversationAuditEvent.create({
        data: {
          actorKind: StoreConversationMessageAuthorKind.STORE_ATTENDANT,
          actorMembershipId: membership.id,
          conversationId: conversation.id,
          conversationSequence: sequence,
          reasonCode: "store_reply_accepted",
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: StoreConversationAuditEventType.STORE_REPLY_APPENDED,
        },
      }),
    ])
    return {
      message: projectStoreConversationMessage({
        ...message,
        requestLinks: [
          { kind: currentSource.kind, sourceId: currentSource.sourceId },
        ],
      }),
      replayed: false,
    }
  })
}

export async function listStoreConversationQueue(
  db: PrismaClient,
  input: {
    actorUserId: string
    limit?: number
    storeId: string
    tenantId: string
  },
) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  const membership = await assertStoreConversationAttendant(db, input)
  const conversations = await db.storeConversation.findMany({
    include: { requestLinks: { select: { kind: true } } },
    orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }],
    take: limit,
    where: {
      lastMessageSequence: { gt: 0 },
      lifecycle: StoreConversationLifecycle.ACTIVE,
      moderationState: StoreConversationModerationState.OPEN,
      requestLinks: { some: {} },
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const requestKinds = {
    COMMERCE_INQUIRY: "commerce_inquiry",
    PRESCRIPTION_REQUEST: "prescription_request",
    SERVICE_REQUEST: "service_request",
  } as const
  return conversations.map((conversation) => ({
    assignedToCurrentUser: conversation.assignedMembershipId === membership.id,
    conversationId: conversation.id,
    lastActivityAt: conversation.lastActivityAt,
    lastMessageSequence: conversation.lastMessageSequence,
    requestKinds: [
      ...new Set(
        conversation.requestLinks.map((link) => requestKinds[link.kind]),
      ),
    ],
    state: conversation.assignedMembershipId
      ? ("assigned" as const)
      : ("new" as const),
  }))
}

export async function getStoreConversationStaffTimeline(
  db: PrismaClient,
  input: {
    actorUserId: string
    beforeSequence?: number
    conversationId: string
    limit?: number
    storeId: string
    tenantId: string
  },
): Promise<StoreConversationTimelineProjection> {
  const parsed = storeConversationTimelineInputSchema.parse({
    beforeSequence: input.beforeSequence,
    conversationId: input.conversationId,
    limit: input.limit,
  })
  const membership = await assertStoreConversationAttendant(db, input)
  const conversation = await db.storeConversation.findFirst({
    include: { store: { select: { name: true } } },
    where: {
      assignedMembershipId: membership.id,
      id: parsed.conversationId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!conversation) {
    throw new StoreConversationError(
      "FORBIDDEN",
      "Claim this conversation before reading its messages.",
    )
  }
  const rows = await db.storeConversationMessage.findMany({
    include: {
      requestLinks: { select: { kind: true, sourceId: true } },
    },
    orderBy: { sequence: "desc" },
    take: parsed.limit + 1,
    where: {
      conversationId: conversation.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
      ...(parsed.beforeSequence
        ? { sequence: { lt: parsed.beforeSequence } }
        : {}),
    },
  })
  const hasMore = rows.length > parsed.limit
  const selected = rows.slice(0, parsed.limit)
  const nextCursor = projectStoreConversationCursor({
    hasMore,
    messages: selected,
  })
  return {
    conversation: {
      id: conversation.id,
      state:
        conversation.moderationState ===
        StoreConversationModerationState.RESTRICTED
          ? "restricted"
          : conversation.lifecycle === StoreConversationLifecycle.ARCHIVED
            ? "archived"
            : "active",
      storeName: conversation.store.name,
    },
    messages: selected.reverse().map(projectStoreConversationMessage),
    nextCursor,
  }
}
