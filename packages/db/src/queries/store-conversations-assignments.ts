import {
  type StoreConversationHandoffInput,
  type StoreConversationReassignInput,
  type StoreConversationReleaseInput,
  storeConversationClaimInputSchema,
  storeConversationHandoffInputSchema,
  storeConversationReassignInputSchema,
  storeConversationReleaseInputSchema,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  MembershipRole,
  MembershipStatus,
  StoreConversationAssignmentEventType,
  StoreConversationAuditEventType,
  StoreConversationCommandKind,
  StoreConversationEscalationEventType,
  StoreConversationEscalationKind,
  StoreConversationLifecycle,
  StoreConversationMessageAuthorKind,
  StoreConversationModerationState,
} from "../../generated/prisma/enums"
import {
  StoreConversationError,
  assertStoreConversationAttendant,
  lockStoreConversation,
  storeConversationPayloadHash,
} from "./store-conversations-core"
import type { DbClient } from "./types"

const STORE_CONVERSATION_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const

const managerRoles = [MembershipRole.OWNER, MembershipRole.ADMIN]

async function assertStoreConversationManager(
  db: DbClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const [membership, store] = await Promise.all([
    db.membership.findFirst({
      select: { id: true, role: true },
      where: {
        acceptedAt: { not: null },
        role: { in: managerRoles },
        status: MembershipStatus.ACTIVE,
        tenantId: input.tenantId,
        userId: input.actorUserId,
      },
    }),
    db.store.findFirst({
      select: { id: true },
      where: { id: input.storeId, tenantId: input.tenantId },
    }),
  ])
  if (!membership || !store) {
    throw new StoreConversationError(
      "FORBIDDEN",
      "Store conversation management is unavailable.",
    )
  }
  return membership
}

export async function assertEligibleStoreConversationAttendant(
  db: DbClient,
  input: { membershipId: string; storeId: string; tenantId: string },
) {
  const membership = await db.membership.findFirst({
    select: {
      id: true,
      role: true,
      user: { select: { displayName: true, name: true } },
    },
    where: {
      acceptedAt: { not: null },
      id: input.membershipId,
      status: MembershipStatus.ACTIVE,
      tenantId: input.tenantId,
      serviceCommerceStoreTeamAssignments: {
        some: {
          capability: "ATTENDANT",
          status: "ACTIVE",
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      },
    },
  })
  if (!membership) {
    throw new StoreConversationError(
      "NOT_READY",
      "Select an active attendant for this Store.",
    )
  }
  return membership
}

export async function listEligibleStoreConversationAttendants(
  db: PrismaClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  await assertStoreConversationAttendant(db, input)
  const assignments = await db.serviceCommerceStoreTeamAssignment.findMany({
    orderBy: [{ membership: { user: { displayName: "asc" } } }, { id: "asc" }],
    select: {
      membership: {
        select: {
          id: true,
          user: { select: { displayName: true, name: true } },
        },
      },
    },
    take: 100,
    where: {
      capability: "ATTENDANT",
      membership: {
        acceptedAt: { not: null },
        status: MembershipStatus.ACTIVE,
      },
      status: "ACTIVE",
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  return assignments.map(({ membership }) => ({
    label: membership.user.displayName || membership.user.name || "Team member",
    membershipId: membership.id,
  }))
}

export async function claimStoreConversation(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    conversationId: string
    expectedAssignmentRevision: number
    storeId: string
    tenantId: string
  },
) {
  const parsed = storeConversationClaimInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    expectedAssignmentRevision: input.expectedAssignmentRevision,
    storeId: input.storeId,
  })
  const payloadHash = storeConversationPayloadHash({
    actorUserId: input.actorUserId,
    conversationId: parsed.conversationId,
    expectedAssignmentRevision: parsed.expectedAssignmentRevision,
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
      if (
        receipt.kind !== StoreConversationCommandKind.CLAIM ||
        receipt.payloadHash !== payloadHash ||
        receipt.assignmentRevision === null
      ) {
        throw new StoreConversationError(
          "CONFLICT",
          "This claim command was already used with different input.",
        )
      }
      return {
        assignmentRevision: receipt.assignmentRevision,
        conversationId: conversation.id,
        replayed: true,
      }
    }
    if (
      conversation.assignedMembershipId ||
      conversation.assignmentRevision !== parsed.expectedAssignmentRevision
    ) {
      throw new StoreConversationError(
        "CONFLICT",
        "This conversation assignment changed. Refresh the queue and try again.",
      )
    }
    const assignmentRevision = conversation.assignmentRevision + 1
    const updated = await tx.storeConversation.updateMany({
      data: { assignedMembershipId: membership.id, assignmentRevision },
      where: {
        assignedMembershipId: null,
        assignmentRevision: parsed.expectedAssignmentRevision,
        id: conversation.id,
        storeId: parsed.storeId,
        tenantId: input.tenantId,
      },
    })
    if (updated.count !== 1) {
      throw new StoreConversationError(
        "CONFLICT",
        "Another attendant claimed this conversation.",
      )
    }
    await Promise.all([
      tx.storeConversationAssignmentEvent.create({
        data: {
          actorKind: StoreConversationMessageAuthorKind.STORE_ATTENDANT,
          actorMembershipId: membership.id,
          assignmentRevision,
          conversationId: conversation.id,
          reason: "attendant_claimed",
          storeId: parsed.storeId,
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
          storeId: parsed.storeId,
          tenantId: input.tenantId,
          type: StoreConversationAuditEventType.CLAIMED,
        },
      }),
      tx.storeConversationCommandReceipt.create({
        data: {
          assignmentMembershipId: membership.id,
          assignmentRevision,
          clientOperationId: parsed.clientOperationId,
          conversationId: conversation.id,
          kind: StoreConversationCommandKind.CLAIM,
          payloadHash,
          storeId: parsed.storeId,
          tenantId: input.tenantId,
        },
      }),
    ])
    return {
      assignmentRevision,
      conversationId: conversation.id,
      replayed: false,
    }
  }, STORE_CONVERSATION_TRANSACTION_OPTIONS)
}

type AssignmentChangeKind = "handoff" | "reassign" | "release"

async function changeStoreConversationAssignment(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    conversationId: string
    expectedAssignmentRevision: number
    kind: AssignmentChangeKind
    reason: string
    storeId: string
    tenantId: string
    toMembershipId?: string
  },
) {
  const payloadHash = storeConversationPayloadHash({
    actorUserId: input.actorUserId,
    conversationId: input.conversationId,
    expectedAssignmentRevision: input.expectedAssignmentRevision,
    kind: input.kind,
    reason: input.reason,
    toMembershipId: input.toMembershipId ?? null,
  })
  return db.$transaction(async (tx) => {
    const actor =
      input.kind === "reassign"
        ? await assertStoreConversationManager(tx, input)
        : await assertStoreConversationAttendant(tx, input)
    const target = input.toMembershipId
      ? await assertEligibleStoreConversationAttendant(tx, {
          membershipId: input.toMembershipId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
      : null
    await lockStoreConversation(tx, input)
    const conversation = await tx.storeConversation.findFirst({
      where: {
        id: input.conversationId,
        lifecycle: StoreConversationLifecycle.ACTIVE,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!conversation) {
      throw new StoreConversationError("NOT_FOUND", "Conversation not found.")
    }
    const receipt = await tx.storeConversationCommandReceipt.findFirst({
      where: {
        clientOperationId: input.clientOperationId,
        conversationId: conversation.id,
      },
    })
    const commandKinds = {
      handoff: StoreConversationCommandKind.HANDOFF,
      reassign: StoreConversationCommandKind.REASSIGN,
      release: StoreConversationCommandKind.RELEASE,
    } as const
    if (receipt) {
      if (
        receipt.kind !== commandKinds[input.kind] ||
        receipt.payloadHash !== payloadHash ||
        receipt.assignmentRevision === null
      ) {
        throw new StoreConversationError(
          "CONFLICT",
          "This assignment command was already used with different input.",
        )
      }
      return {
        assignmentRevision: receipt.assignmentRevision,
        conversationId: conversation.id,
        replayed: true,
      }
    }
    if (
      !conversation.assignedMembershipId ||
      conversation.assignmentRevision !== input.expectedAssignmentRevision
    ) {
      throw new StoreConversationError(
        "CONFLICT",
        "This conversation assignment changed. Refresh and try again.",
      )
    }
    if (
      input.kind !== "reassign" &&
      conversation.assignedMembershipId !== actor.id
    ) {
      throw new StoreConversationError(
        "FORBIDDEN",
        "Only the primary attendant can release or hand off this conversation.",
      )
    }
    if (target?.id === conversation.assignedMembershipId) {
      throw new StoreConversationError(
        "CONFLICT",
        "Choose a different attendant for this handoff.",
      )
    }
    const assignmentRevision = conversation.assignmentRevision + 1
    const updated = await tx.storeConversation.updateMany({
      data: {
        assignedMembershipId: target?.id ?? null,
        assignmentRevision,
      },
      where: {
        assignedMembershipId: conversation.assignedMembershipId,
        assignmentRevision: input.expectedAssignmentRevision,
        id: conversation.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (updated.count !== 1) {
      throw new StoreConversationError(
        "CONFLICT",
        "This conversation assignment changed. Refresh and try again.",
      )
    }
    const eventTypes = {
      handoff: StoreConversationAssignmentEventType.HANDED_OFF,
      reassign: StoreConversationAssignmentEventType.REASSIGNED,
      release: StoreConversationAssignmentEventType.RELEASED,
    } as const
    const auditTypes = {
      handoff: StoreConversationAuditEventType.HANDED_OFF,
      reassign: StoreConversationAuditEventType.REASSIGNED,
      release: StoreConversationAuditEventType.RELEASED,
    } as const
    await Promise.all([
      tx.storeConversationAssignmentEvent.create({
        data: {
          actorKind: StoreConversationMessageAuthorKind.STORE_ATTENDANT,
          actorMembershipId: actor.id,
          assignmentRevision,
          conversationId: conversation.id,
          fromMembershipId: conversation.assignedMembershipId,
          reason: input.reason,
          storeId: input.storeId,
          tenantId: input.tenantId,
          toMembershipId: target?.id,
          type: eventTypes[input.kind],
        },
      }),
      tx.storeConversationAuditEvent.create({
        data: {
          actorKind: StoreConversationMessageAuthorKind.STORE_ATTENDANT,
          actorMembershipId: actor.id,
          conversationId: conversation.id,
          reasonCode: input.reason,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: auditTypes[input.kind],
        },
      }),
      tx.storeConversationCommandReceipt.create({
        data: {
          assignmentMembershipId: target?.id,
          assignmentRevision,
          clientOperationId: input.clientOperationId,
          conversationId: conversation.id,
          kind: commandKinds[input.kind],
          payloadHash,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
    ])
    if (
      input.kind === "release" &&
      conversation.responseDueAt &&
      conversation.lastCustomerMessageSequence >
        conversation.lastStoreReplySequence
    ) {
      await Promise.all([
        tx.storeConversationEscalationEvent.createMany({
          data: [
            {
              actorMembershipId: actor.id,
              assignmentRevision,
              conversationId: conversation.id,
              conversationSequence: conversation.lastCustomerMessageSequence,
              dedupeKey: `abandoned:${conversation.id}:${assignmentRevision}`,
              kind: StoreConversationEscalationKind.ABANDONED,
              reasonCode: input.reason,
              storeId: input.storeId,
              tenantId: input.tenantId,
              type: StoreConversationEscalationEventType.OPENED,
            },
          ],
          skipDuplicates: true,
        }),
        tx.storeConversationAuditEvent.create({
          data: {
            actorKind: StoreConversationMessageAuthorKind.STORE_ATTENDANT,
            actorMembershipId: actor.id,
            conversationId: conversation.id,
            conversationSequence: conversation.lastCustomerMessageSequence,
            reasonCode: "assignment_abandoned",
            storeId: input.storeId,
            tenantId: input.tenantId,
            type: StoreConversationAuditEventType.ESCALATED,
          },
        }),
      ])
    }
    return {
      assignmentRevision,
      conversationId: conversation.id,
      replayed: false,
    }
  }, STORE_CONVERSATION_TRANSACTION_OPTIONS)
}

export async function releaseStoreConversation(
  db: PrismaClient,
  input: StoreConversationReleaseInput & {
    actorUserId: string
    tenantId: string
  },
) {
  const parsed = storeConversationReleaseInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    expectedAssignmentRevision: input.expectedAssignmentRevision,
    reason: input.reason,
    storeId: input.storeId,
  })
  return changeStoreConversationAssignment(db, {
    ...input,
    ...parsed,
    kind: "release",
  })
}

export async function handoffStoreConversation(
  db: PrismaClient,
  input: StoreConversationHandoffInput & {
    actorUserId: string
    tenantId: string
  },
) {
  const parsed = storeConversationHandoffInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    expectedAssignmentRevision: input.expectedAssignmentRevision,
    reason: input.reason,
    storeId: input.storeId,
    toMembershipId: input.toMembershipId,
  })
  return changeStoreConversationAssignment(db, {
    ...input,
    ...parsed,
    kind: "handoff",
  })
}

export async function reassignStoreConversation(
  db: PrismaClient,
  input: StoreConversationReassignInput & {
    actorUserId: string
    tenantId: string
  },
) {
  const parsed = storeConversationReassignInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    expectedAssignmentRevision: input.expectedAssignmentRevision,
    reason: input.reason,
    storeId: input.storeId,
    toMembershipId: input.toMembershipId,
  })
  return changeStoreConversationAssignment(db, {
    ...input,
    ...parsed,
    kind: "reassign",
  })
}

export async function releaseStoreConversationsForIneligibleMembership(
  db: DbClient,
  input: {
    actorMembershipId?: string | null
    membershipId: string
    now: Date
    reasonCode: "attendant_revoked" | "membership_suspended"
    tenantId: string
  },
) {
  let releasedCount = 0
  while (true) {
    const conversations = await db.storeConversation.findMany({
      orderBy: { id: "asc" },
      select: {
        assignmentRevision: true,
        id: true,
        lastMessageSequence: true,
        storeId: true,
      },
      take: 200,
      where: {
        assignedMembershipId: input.membershipId,
        lifecycle: StoreConversationLifecycle.ACTIVE,
        tenantId: input.tenantId,
      },
    })
    if (conversations.length === 0) break
    for (const conversation of conversations) {
      await lockStoreConversation(db, {
        conversationId: conversation.id,
        storeId: conversation.storeId,
        tenantId: input.tenantId,
      })
      const current = await db.storeConversation.findFirst({
        select: {
          assignedMembershipId: true,
          assignmentRevision: true,
          lastMessageSequence: true,
        },
        where: {
          assignedMembershipId: input.membershipId,
          id: conversation.id,
          lifecycle: StoreConversationLifecycle.ACTIVE,
          storeId: conversation.storeId,
          tenantId: input.tenantId,
        },
      })
      if (!current) continue
      const assignmentRevision = current.assignmentRevision + 1
      const updated = await db.storeConversation.updateMany({
        data: { assignedMembershipId: null, assignmentRevision },
        where: {
          assignedMembershipId: input.membershipId,
          assignmentRevision: current.assignmentRevision,
          id: conversation.id,
          storeId: conversation.storeId,
          tenantId: input.tenantId,
        },
      })
      if (updated.count !== 1) continue
      releasedCount += 1
      const dedupeKey = `membership:${conversation.id}:${assignmentRevision}`
      await Promise.all([
        db.storeConversationAssignmentEvent.create({
          data: {
            actorKind: input.actorMembershipId
              ? StoreConversationMessageAuthorKind.STORE_ATTENDANT
              : StoreConversationMessageAuthorKind.SYSTEM,
            actorMembershipId: input.actorMembershipId ?? undefined,
            assignmentRevision,
            conversationId: conversation.id,
            fromMembershipId: input.membershipId,
            reason: input.reasonCode,
            storeId: conversation.storeId,
            tenantId: input.tenantId,
            type: StoreConversationAssignmentEventType.MEMBERSHIP_RELEASED,
          },
        }),
        db.storeConversationEscalationEvent.createMany({
          data: [
            {
              actorMembershipId: input.actorMembershipId ?? undefined,
              assignmentRevision,
              conversationId: conversation.id,
              conversationSequence: current.lastMessageSequence,
              dedupeKey,
              kind: StoreConversationEscalationKind.MEMBERSHIP_UNAVAILABLE,
              occurredAt: input.now,
              reasonCode: input.reasonCode,
              storeId: conversation.storeId,
              tenantId: input.tenantId,
              type: StoreConversationEscalationEventType.OPENED,
            },
          ],
          skipDuplicates: true,
        }),
        db.storeConversationAuditEvent.create({
          data: {
            actorKind: input.actorMembershipId
              ? StoreConversationMessageAuthorKind.STORE_ATTENDANT
              : StoreConversationMessageAuthorKind.SYSTEM,
            actorMembershipId: input.actorMembershipId ?? undefined,
            conversationId: conversation.id,
            reasonCode: input.reasonCode,
            storeId: conversation.storeId,
            tenantId: input.tenantId,
            type: StoreConversationAuditEventType.ESCALATED,
          },
        }),
      ])
    }
  }
  return { releasedCount }
}

export async function recordFailedStoreConversationResponse(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientOperationId: string
    conversationId: string
    expectedAssignmentRevision: number
    reasonCode: "reply_conflict" | "reply_not_ready"
    storeId: string
    tenantId: string
  },
) {
  const dedupeKey = `failed-response:${storeConversationPayloadHash({
    actorUserId: input.actorUserId,
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    reasonCode: input.reasonCode,
  })}`
  return db.$transaction(async (tx) => {
    const membership = await assertStoreConversationAttendant(tx, input)
    await lockStoreConversation(tx, input)
    const conversation = await tx.storeConversation.findFirst({
      select: {
        assignedMembershipId: true,
        assignmentRevision: true,
        lastMessageSequence: true,
      },
      where: {
        id: input.conversationId,
        lifecycle: StoreConversationLifecycle.ACTIVE,
        moderationState: StoreConversationModerationState.OPEN,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (
      !conversation ||
      conversation.assignedMembershipId !== membership.id ||
      conversation.assignmentRevision !== input.expectedAssignmentRevision
    ) {
      return { recorded: false }
    }
    const created = await tx.storeConversationEscalationEvent.createMany({
      data: [
        {
          actorMembershipId: membership.id,
          assignmentRevision: conversation.assignmentRevision,
          conversationId: input.conversationId,
          conversationSequence: conversation.lastMessageSequence,
          dedupeKey,
          kind: StoreConversationEscalationKind.FAILED_RESPONSE,
          reasonCode: input.reasonCode,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: StoreConversationEscalationEventType.OPENED,
        },
      ],
      skipDuplicates: true,
    })
    if (created.count === 1) {
      await tx.storeConversationAuditEvent.create({
        data: {
          actorKind: StoreConversationMessageAuthorKind.STORE_ATTENDANT,
          actorMembershipId: membership.id,
          conversationId: input.conversationId,
          conversationSequence: conversation.lastMessageSequence,
          reasonCode: input.reasonCode,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type: StoreConversationAuditEventType.ESCALATED,
        },
      })
    }
    return { recorded: created.count === 1 }
  }, STORE_CONVERSATION_TRANSACTION_OPTIONS)
}

export async function recordOverdueStoreConversationEscalations(
  db: PrismaClient,
  input: { limit?: number; now?: Date },
) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200)
  const now = input.now ?? new Date()
  return db.$transaction(async (tx) => {
    const conversations = await tx.$queryRaw<
      Array<{
        assignedMembershipId: string | null
        assignmentRevision: number
        id: string
        lastCustomerMessageSequence: number
        storeId: string
        tenantId: string
      }>
    >(Prisma.sql`
      SELECT
        conversation."assignedMembershipId",
        conversation."assignmentRevision",
        conversation."id",
        conversation."lastCustomerMessageSequence",
        conversation."storeId",
        conversation."tenantId"
      FROM "StoreConversation" AS conversation
      WHERE conversation."lastCustomerMessageSequence" > 0
        AND conversation."lifecycle" = 'ACTIVE'
        AND conversation."moderationState" = 'OPEN'
        AND conversation."responseDueAt" <= ${now}
        AND NOT EXISTS (
          SELECT 1
          FROM "StoreConversationEscalationEvent" AS escalation
          WHERE escalation."dedupeKey" = CONCAT(
            'sla:',
            conversation."id",
            ':',
            conversation."lastCustomerMessageSequence"::text,
            ':',
            CASE
              WHEN conversation."assignedMembershipId" IS NULL
                THEN 'UNCLAIMED'
              ELSE 'OVERDUE'
            END
          )
      )
      ORDER BY conversation."responseDueAt" ASC, conversation."id" ASC
      LIMIT ${limit}
      FOR UPDATE OF conversation SKIP LOCKED
    `)
    let openedCount = 0
    for (const conversation of conversations) {
      const kind = conversation.assignedMembershipId
        ? StoreConversationEscalationKind.OVERDUE
        : StoreConversationEscalationKind.UNCLAIMED
      const dedupeKey = `sla:${conversation.id}:${conversation.lastCustomerMessageSequence}:${kind}`
      const created = await tx.storeConversationEscalationEvent.createMany({
        data: [
          {
            assignmentRevision: conversation.assignmentRevision,
            conversationId: conversation.id,
            conversationSequence: conversation.lastCustomerMessageSequence,
            dedupeKey,
            kind,
            occurredAt: now,
            reasonCode: conversation.assignedMembershipId
              ? "response_overdue"
              : "unclaimed_overdue",
            storeId: conversation.storeId,
            tenantId: conversation.tenantId,
            type: StoreConversationEscalationEventType.OPENED,
          },
        ],
        skipDuplicates: true,
      })
      if (created.count !== 1) continue
      openedCount += 1
      await tx.storeConversationAuditEvent.create({
        data: {
          actorKind: StoreConversationMessageAuthorKind.SYSTEM,
          conversationId: conversation.id,
          conversationSequence: conversation.lastCustomerMessageSequence,
          reasonCode: conversation.assignedMembershipId
            ? "response_overdue"
            : "unclaimed_overdue",
          storeId: conversation.storeId,
          tenantId: conversation.tenantId,
          type: StoreConversationAuditEventType.ESCALATED,
        },
      })
    }
    return { openedCount, scannedCount: conversations.length }
  }, STORE_CONVERSATION_TRANSACTION_OPTIONS)
}
