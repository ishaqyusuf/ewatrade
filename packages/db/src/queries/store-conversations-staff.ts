import {
  projectStoreConversationCursor,
  projectStoreConversationSla,
  storeConversationQueueInputSchema,
  storeConversationReplyInputSchema,
  storeConversationTimelineInputSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationAuditEventType,
  StoreConversationCommandKind,
  StoreConversationEscalationEventType,
  StoreConversationEscalationKind,
  StoreConversationLifecycle,
  StoreConversationMessageAuthorKind,
  StoreConversationMessageChannel,
  StoreConversationMessageKind,
  StoreConversationModerationState,
  StoreConversationRequestKind,
} from "../../generated/prisma/enums"
import { resolveServiceCommerceSourceContext } from "./service-commerce-sources"
import {
  StoreConversationError,
  assertStoreConversationAttendant,
  loadStoreConversationRequestSummaries,
  lockStoreConversation,
  projectStoreConversationMessage,
  storeConversationPayloadHash,
} from "./store-conversations-core"
import { resolveCurrentStoreConversationRequestRevision } from "./store-conversations-requests"

async function loadCurrentStoreConversationEscalations(
  db: Pick<PrismaClient, "storeConversationEscalationEvent">,
  input: { conversationId: string; storeId: string; tenantId: string },
) {
  const events = await Promise.all(
    Object.values(StoreConversationEscalationKind).map((kind) =>
      db.storeConversationEscalationEvent.findFirst({
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          kind: true,
          occurredAt: true,
          reasonCode: true,
          type: true,
        },
        where: { ...input, kind },
      }),
    ),
  )
  return events.filter((event) => event !== null)
}

export async function replyToStoreConversation(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    conversationId: string
    expectedAssignmentRevision: number
    expectedLastMessageSequence: number
    request?: {
      id: string
      kind: "commerce_inquiry" | "prescription_request" | "service_request"
      revision: number
    }
    storeId: string
    tenantId: string
    text: string
  },
) {
  const parsed = storeConversationReplyInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    expectedAssignmentRevision: input.expectedAssignmentRevision,
    expectedLastMessageSequence: input.expectedLastMessageSequence,
    request: input.request,
    storeId: input.storeId,
    text: input.text,
  })
  const now = new Date()
  const commandHash = storeConversationPayloadHash({
    actorUserId: input.actorUserId,
    conversationId: parsed.conversationId,
    expectedAssignmentRevision: parsed.expectedAssignmentRevision,
    expectedLastMessageSequence: parsed.expectedLastMessageSequence,
    request: parsed.request ?? null,
    text: parsed.text,
  })
  return db.$transaction(async (tx) => {
    const membership = await assertStoreConversationAttendant(tx, input)
    await lockStoreConversation(tx, input)
    const conversation = await tx.storeConversation.findFirst({
      where: {
        id: parsed.conversationId,
        lifecycle: StoreConversationLifecycle.ACTIVE,
        moderationState: StoreConversationModerationState.OPEN,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!conversation) {
      throw new StoreConversationError("NOT_FOUND", "Conversation not found.")
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
      if (
        receipt.kind !== StoreConversationCommandKind.STORE_REPLY ||
        receipt.payloadHash !== commandHash ||
        !receipt.message
      ) {
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
    if (
      conversation.assignedMembershipId !== membership.id ||
      conversation.assignmentRevision !== parsed.expectedAssignmentRevision
    ) {
      throw new StoreConversationError(
        "FORBIDDEN",
        "Claim this conversation before replying.",
      )
    }
    if (
      conversation.lastMessageSequence !== parsed.expectedLastMessageSequence
    ) {
      throw new StoreConversationError(
        "CONFLICT",
        "This conversation changed. Refresh before replying.",
      )
    }
    const summaries = await loadStoreConversationRequestSummaries(tx, {
      conversationId: conversation.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
    const active = summaries.filter((request) => request.lifecycle === "active")
    const selected = parsed.request
      ? active.find(
          (request) =>
            request.id === parsed.request?.id &&
            request.kind === parsed.request.kind,
        )
      : active.length === 1
        ? active[0]
        : null
    if (!selected) {
      throw new StoreConversationError(
        "CONFLICT",
        active.length > 1
          ? "Choose the exact active Request before replying."
          : "This conversation has no active Request to reply to.",
      )
    }
    if (parsed.request && selected.revision !== parsed.request.revision) {
      throw new StoreConversationError(
        "CONFLICT",
        "This Request changed. Refresh before replying.",
      )
    }
    const sourceKinds = {
      commerce_inquiry: StoreConversationRequestKind.COMMERCE_INQUIRY,
      prescription_request: StoreConversationRequestKind.PRESCRIPTION_REQUEST,
      service_request: StoreConversationRequestKind.SERVICE_REQUEST,
    } as const
    const currentSource = await tx.storeConversationRequestLink.findFirst({
      orderBy: { createdAt: "desc" },
      select: { kind: true, sourceId: true },
      where: {
        conversationId: conversation.id,
        kind: sourceKinds[selected.kind],
        sourceId: selected.id,
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
    const currentSourceRevision =
      await resolveCurrentStoreConversationRequestRevision(tx, {
        kind: currentSource.kind,
        sourceId: currentSource.sourceId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
    if (currentSourceRevision !== selected.revision) {
      throw new StoreConversationError(
        "CONFLICT",
        "This Request changed. Refresh before replying.",
      )
    }
    const sourceContext = await resolveServiceCommerceSourceContext(tx, {
      actorUserId: input.actorUserId,
      source: {
        id: selected.id,
        kind:
          selected.kind === "service_request"
            ? "service"
            : selected.kind === "prescription_request"
              ? "prescription"
              : "commerce_inquiry",
      },
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
    if (sourceContext.sourceReadiness.staff.readiness !== "available") {
      throw new StoreConversationError(
        "NOT_READY",
        "Store replies are currently unavailable for this Request.",
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
        sourceRevision: currentSourceRevision,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    const [updated] = await Promise.all([
      tx.storeConversation.updateMany({
        data: {
          lastActivityAt: now,
          lastMessageSequence: sequence,
          lastStoreReplyAt: now,
          lastStoreReplySequence: sequence,
          responseDueAt: null,
        },
        where: {
          assignedMembershipId: membership.id,
          assignmentRevision: parsed.expectedAssignmentRevision,
          id: conversation.id,
          lastMessageSequence: parsed.expectedLastMessageSequence,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
      tx.storeConversationCommandReceipt.create({
        data: {
          clientOperationId: parsed.clientOperationId,
          conversationId: conversation.id,
          kind: StoreConversationCommandKind.STORE_REPLY,
          messageId: message.id,
          payloadHash: commandHash,
          assignmentMembershipId: membership.id,
          assignmentRevision: conversation.assignmentRevision,
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
    if (updated.count !== 1) {
      throw new StoreConversationError(
        "CONFLICT",
        "This conversation changed. Refresh before replying.",
      )
    }
    const currentEscalations = await loadCurrentStoreConversationEscalations(
      tx,
      {
        conversationId: conversation.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    )
    const openEscalations = currentEscalations.filter(
      (event) => event.type === StoreConversationEscalationEventType.OPENED,
    )
    if (openEscalations.length > 0) {
      await tx.storeConversationEscalationEvent.createMany({
        data: openEscalations.map((event) => ({
          actorMembershipId: membership.id,
          assignmentRevision: conversation.assignmentRevision,
          conversationId: conversation.id,
          conversationSequence: sequence,
          dedupeKey: `reply:${message.id}:${event.kind}`,
          kind: event.kind,
          occurredAt: now,
          reasonCode: "store_reply_recovered",
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: StoreConversationEscalationEventType.RESOLVED,
        })),
        skipDuplicates: true,
      })
      await tx.storeConversationAuditEvent.create({
        data: {
          actorKind: StoreConversationMessageAuthorKind.STORE_ATTENDANT,
          actorMembershipId: membership.id,
          conversationId: conversation.id,
          conversationSequence: sequence,
          reasonCode: "store_reply_recovered",
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: StoreConversationAuditEventType.ESCALATION_RESOLVED,
        },
      })
    }
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
    assignment?: "all" | "assigned" | "mine" | "unassigned"
    cursor?: string
    pageSize?: number
    q?: string
    requestKinds?: Array<
      "commerce_inquiry" | "prescription_request" | "service_request"
    >
    sla?: "all" | "awaiting_response" | "overdue"
    sort?: ["last_customer_activity" | "response_due_at", "asc" | "desc"]
    storeId: string
    tenantId: string
  },
) {
  const parsed = storeConversationQueueInputSchema.parse({
    assignment: input.assignment,
    cursor: input.cursor,
    pageSize: input.pageSize,
    q: input.q,
    requestKinds: input.requestKinds,
    sla: input.sla,
    sort: input.sort,
    storeId: input.storeId,
  })
  const membership = await assertStoreConversationAttendant(db, input)
  const now = new Date()
  const requestKindByInput = {
    commerce_inquiry: StoreConversationRequestKind.COMMERCE_INQUIRY,
    prescription_request: StoreConversationRequestKind.PRESCRIPTION_REQUEST,
    service_request: StoreConversationRequestKind.SERVICE_REQUEST,
  } as const
  const assignmentWhere =
    parsed.assignment === "mine"
      ? { assignedMembershipId: membership.id }
      : parsed.assignment === "assigned"
        ? { assignedMembershipId: { not: null } }
        : parsed.assignment === "unassigned"
          ? { assignedMembershipId: null }
          : {}
  const slaWhere =
    parsed.sla === "overdue"
      ? { responseDueAt: { lte: now } }
      : parsed.sla === "awaiting_response"
        ? { responseDueAt: { gt: now } }
        : {}
  const orderBy =
    parsed.sort[0] === "response_due_at"
      ? [
          {
            responseDueAt: {
              nulls: "last" as const,
              sort: parsed.sort[1],
            },
          },
          { id: parsed.sort[1] },
        ]
      : [{ lastCustomerMessageAt: parsed.sort[1] }, { id: parsed.sort[1] }]
  const conversations = await db.storeConversation.findMany({
    ...(parsed.cursor ? { cursor: { id: parsed.cursor }, skip: 1 } : {}),
    include: {
      assignedMembership: {
        select: {
          user: { select: { displayName: true } },
        },
      },
      requestLinks: { select: { kind: true } },
    },
    orderBy,
    take: parsed.pageSize + 1,
    where: {
      ...assignmentWhere,
      ...slaWhere,
      ...(parsed.q ? { id: { contains: parsed.q } } : {}),
      lastMessageSequence: { gt: 0 },
      lifecycle: StoreConversationLifecycle.ACTIVE,
      moderationState: StoreConversationModerationState.OPEN,
      requestLinks: {
        some:
          parsed.requestKinds.length > 0
            ? {
                kind: {
                  in: parsed.requestKinds.map(
                    (kind) => requestKindByInput[kind],
                  ),
                },
              }
            : {},
      },
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const requestKinds = {
    COMMERCE_INQUIRY: "commerce_inquiry",
    PRESCRIPTION_REQUEST: "prescription_request",
    SERVICE_REQUEST: "service_request",
  } as const
  const hasMore = conversations.length > parsed.pageSize
  const rows = conversations.slice(0, parsed.pageSize)
  const items = await Promise.all(
    rows.map(async (conversation) => {
      const requests = await loadStoreConversationRequestSummaries(db, {
        conversationId: conversation.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      })
      return {
        assignment: {
          label: conversation.assignedMembership
            ? conversation.assignedMembership.user.displayName || "Team member"
            : null,
          revision: conversation.assignmentRevision,
        },
        assignedToCurrentUser:
          conversation.assignedMembershipId === membership.id,
        conversationId: conversation.id,
        lastCustomerActivityAt:
          conversation.lastCustomerMessageAt ?? conversation.lastActivityAt,
        lastMessageSequence: conversation.lastMessageSequence,
        requests: requests.map(({ kind, label, lifecycle, status }) => ({
          kind,
          label,
          lifecycle,
          status,
        })),
        requestKinds: [
          ...new Set(
            conversation.requestLinks.map((link) => requestKinds[link.kind]),
          ),
        ],
        sla: projectStoreConversationSla({
          lastCustomerMessageAt: conversation.lastCustomerMessageAt,
          lastStoreReplyAt: conversation.lastStoreReplyAt,
          now,
        }),
        state: conversation.assignedMembershipId
          ? ("assigned" as const)
          : ("new" as const),
        unreadCustomerMessages:
          conversation.lastCustomerMessageSequence >
          conversation.lastStoreReplySequence
            ? 1
            : 0,
      }
    }),
  )
  return {
    items,
    nextCursor: hasMore ? (rows.at(-1)?.id ?? null) : null,
  }
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
) {
  const parsed = storeConversationTimelineInputSchema.parse({
    beforeSequence: input.beforeSequence,
    conversationId: input.conversationId,
    limit: input.limit,
  })
  const membership = await assertStoreConversationAttendant(db, input)
  const conversation = await db.storeConversation.findFirst({
    include: {
      assignedMembership: {
        select: {
          id: true,
          user: { select: { displayName: true, name: true } },
        },
      },
      store: { select: { name: true } },
    },
    where: {
      id: parsed.conversationId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!conversation) {
    throw new StoreConversationError("NOT_FOUND", "Conversation not found.")
  }
  const [rows, requests, escalations] = await Promise.all([
    db.storeConversationMessage.findMany({
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
    }),
    loadStoreConversationRequestSummaries(db, {
      conversationId: conversation.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    }),
    loadCurrentStoreConversationEscalations(db, {
      conversationId: conversation.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    }),
  ])
  const hasMore = rows.length > parsed.limit
  const selected = rows.slice(0, parsed.limit)
  const nextCursor = projectStoreConversationCursor({
    hasMore,
    messages: selected,
  })
  await db.storeConversationAuditEvent.create({
    data: {
      actorKind: StoreConversationMessageAuthorKind.STORE_ATTENDANT,
      actorMembershipId: membership.id,
      conversationId: conversation.id,
      conversationSequence: conversation.lastMessageSequence,
      reasonCode: "staff_timeline_read",
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: StoreConversationAuditEventType.STAFF_TIMELINE_READ,
    },
  })
  return {
    assignment: {
      assignedToCurrentUser:
        conversation.assignedMembershipId === membership.id,
      label: conversation.assignedMembership
        ? conversation.assignedMembership.user.displayName ||
          conversation.assignedMembership.user.name ||
          "Team member"
        : null,
      membershipId: conversation.assignedMembershipId,
      revision: conversation.assignmentRevision,
    },
    availableRequestKinds: [],
    conversation: {
      id: conversation.id,
      lastMessageSequence: conversation.lastMessageSequence,
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
    permissions: {
      canClaim: conversation.assignedMembershipId === null,
      canReassign:
        conversation.assignedMembershipId !== null &&
        ["OWNER", "ADMIN"].includes(membership.role),
      canReply: conversation.assignedMembershipId === membership.id,
      canRelease: conversation.assignedMembershipId === membership.id,
    },
    requests,
    sla: projectStoreConversationSla({
      lastCustomerMessageAt: conversation.lastCustomerMessageAt,
      lastStoreReplyAt: conversation.lastStoreReplyAt,
      now: new Date(),
    }),
    escalations: escalations.map((event) => ({
      id: event.id,
      kind: event.kind.toLowerCase(),
      occurredAt: event.occurredAt,
      reasonCode: event.reasonCode,
      state:
        event.type === "OPENED" ? ("open" as const) : ("resolved" as const),
    })),
  }
}
