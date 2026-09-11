import {
  projectStoreConversationModeration,
  storeConversationModerationCommandInputSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  MembershipRole,
  MembershipStatus,
  StoreConversationLifecycle,
  StoreConversationModerationAction,
  StoreConversationModerationAuditOutcome,
  StoreConversationModerationReason,
  StoreConversationModerationState,
} from "../../generated/prisma/enums"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import {
  StoreConversationError,
  lockStoreConversation,
  storeConversationPayloadHash,
} from "./store-conversations-core"

const actions = {
  reinstate: StoreConversationModerationAction.REINSTATE,
  restrict: StoreConversationModerationAction.RESTRICT,
} as const

const reasons = {
  appeal_approved: StoreConversationModerationReason.APPEAL_APPROVED,
  operator_review: StoreConversationModerationReason.OPERATOR_REVIEW,
  policy_review: StoreConversationModerationReason.POLICY_REVIEW,
  review_complete: StoreConversationModerationReason.REVIEW_COMPLETE,
  security_review: StoreConversationModerationReason.SECURITY_REVIEW,
  spam_or_abuse: StoreConversationModerationReason.SPAM_OR_ABUSE,
} as const

const moderationRoles = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
])

function moderationProjection(input: {
  moderationRevision: number
  moderationState: StoreConversationModerationState
  restrictedAt: Date | null
}) {
  return projectStoreConversationModeration({
    moderationRevision: input.moderationRevision,
    moderationState: input.moderationState,
    restrictedAt: input.restrictedAt,
  })
}

export async function moderateStoreConversation(
  db: PrismaClient,
  input: {
    action: "reinstate" | "restrict"
    actorUserId: string
    clientOperationId: string
    conversationId: string
    expectedRevision: number
    operatorNote?: string
    reason:
      | "appeal_approved"
      | "operator_review"
      | "policy_review"
      | "review_complete"
      | "security_review"
      | "spam_or_abuse"
    storeId: string
    tenantId: string
  },
) {
  const parsed = storeConversationModerationCommandInputSchema.parse(input)
  const action = actions[parsed.action]
  const reason = reasons[parsed.reason]
  const payloadHash = storeConversationPayloadHash({
    action: parsed.action,
    actorUserId: input.actorUserId,
    conversationId: parsed.conversationId,
    expectedRevision: parsed.expectedRevision,
    operatorNote: parsed.operatorNote ?? null,
    reason: parsed.reason,
    storeId: parsed.storeId,
    tenantId: input.tenantId,
  })

  const result = await runStoreConversationActionTransaction(db, async (tx) => {
    const [membership, store] = await Promise.all([
      tx.membership.findFirst({
        select: { id: true, role: true },
        where: {
          acceptedAt: { not: null },
          status: MembershipStatus.ACTIVE,
          tenantId: input.tenantId,
          userId: input.actorUserId,
        },
      }),
      tx.store.findFirst({
        select: { id: true },
        where: {
          id: parsed.storeId,
          status: "ACTIVE",
          tenantId: input.tenantId,
        },
      }),
    ])
    const authorized = membership && moderationRoles.has(membership.role)
    const conversation = store
      ? await tx.storeConversation.findFirst({
          select: {
            id: true,
            lifecycle: true,
            moderationRevision: true,
            moderationState: true,
            restrictedAt: true,
          },
          where: {
            id: parsed.conversationId,
            storeId: store.id,
            tenantId: input.tenantId,
          },
        })
      : null

    const audit = async (auditInput: {
      outcome: StoreConversationModerationAuditOutcome
      reasonCode: string
      resultingRevision?: number
    }) => {
      await tx.storeConversationModerationAuditEvent.create({
        data: {
          action,
          actorMembershipId: membership?.id ?? null,
          actorUserId: input.actorUserId,
          clientOperationId: parsed.clientOperationId,
          conversationId: conversation?.id ?? null,
          expectedRevision: parsed.expectedRevision,
          outcome: auditInput.outcome,
          payloadHash,
          reason,
          reasonCode: auditInput.reasonCode,
          resultingRevision: auditInput.resultingRevision ?? null,
          storeId: store?.id ?? null,
          tenantId: input.tenantId,
        },
      })
    }

    if (!authorized) {
      await audit({
        outcome: StoreConversationModerationAuditOutcome.DENIED,
        reasonCode: "moderation_role_forbidden",
      })
      return { denied: "FORBIDDEN" as const }
    }
    if (!store || !conversation) {
      await audit({
        outcome: StoreConversationModerationAuditOutcome.DENIED,
        reasonCode: "moderation_scope_not_found",
      })
      return { denied: "NOT_FOUND" as const }
    }
    if (conversation.lifecycle !== StoreConversationLifecycle.ACTIVE) {
      await audit({
        outcome: StoreConversationModerationAuditOutcome.DENIED,
        reasonCode: "moderation_conversation_inactive",
      })
      return { denied: "NOT_READY" as const }
    }

    await lockStoreConversation(tx, {
      conversationId: conversation.id,
      storeId: store.id,
      tenantId: input.tenantId,
    })
    const replay = await tx.storeConversationModerationCommand.findUnique({
      where: {
        conversationId_clientOperationId: {
          clientOperationId: parsed.clientOperationId,
          conversationId: conversation.id,
        },
      },
    })
    if (replay) {
      if (
        replay.payloadHash !== payloadHash ||
        replay.actorUserId !== input.actorUserId
      ) {
        await audit({
          outcome: StoreConversationModerationAuditOutcome.DENIED,
          reasonCode: "moderation_replay_mismatch",
        })
        return { denied: "CONFLICT" as const }
      }
      return {
        projection: moderationProjection({
          moderationRevision: replay.resultingRevision,
          moderationState: replay.resultingState,
          restrictedAt: replay.restrictedAt,
        }),
        replayed: true,
      }
    }

    const current = await tx.storeConversation.findUnique({
      select: {
        moderationRevision: true,
        moderationState: true,
        restrictedAt: true,
      },
      where: { id: conversation.id },
    })
    if (!current || current.moderationRevision !== parsed.expectedRevision) {
      await audit({
        outcome: StoreConversationModerationAuditOutcome.DENIED,
        reasonCode: "moderation_revision_changed",
      })
      return { denied: "CONFLICT" as const }
    }
    const expectedState =
      action === StoreConversationModerationAction.RESTRICT
        ? StoreConversationModerationState.OPEN
        : StoreConversationModerationState.RESTRICTED
    if (current.moderationState !== expectedState) {
      await audit({
        outcome: StoreConversationModerationAuditOutcome.DENIED,
        reasonCode: "moderation_transition_invalid",
      })
      return { denied: "CONFLICT" as const }
    }

    const resultingRevision = current.moderationRevision + 1
    const resultingState =
      action === StoreConversationModerationAction.RESTRICT
        ? StoreConversationModerationState.RESTRICTED
        : StoreConversationModerationState.OPEN
    const restrictedAt =
      resultingState === StoreConversationModerationState.RESTRICTED
        ? new Date()
        : null
    const updated = await tx.storeConversation.updateMany({
      data: {
        moderationReason:
          resultingState === StoreConversationModerationState.RESTRICTED
            ? reason
            : null,
        moderationRevision: resultingRevision,
        moderationState: resultingState,
        restrictedAt,
      },
      where: {
        id: conversation.id,
        moderationRevision: current.moderationRevision,
        moderationState: current.moderationState,
        storeId: store.id,
        tenantId: input.tenantId,
      },
    })
    if (updated.count !== 1) {
      await audit({
        outcome: StoreConversationModerationAuditOutcome.DENIED,
        reasonCode: "moderation_concurrent_change",
      })
      return { denied: "CONFLICT" as const }
    }
    await tx.storeConversationModerationCommand.create({
      data: {
        action,
        actorMembershipId: membership.id,
        actorUserId: input.actorUserId,
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
        expectedRevision: parsed.expectedRevision,
        operatorNote: parsed.operatorNote ?? null,
        payloadHash,
        reason,
        restrictedAt,
        resultingRevision,
        resultingState,
        storeId: store.id,
        tenantId: input.tenantId,
      },
    })
    await tx.storeConversationAuditEvent.create({
      data: {
        actorKind: "STORE_ATTENDANT",
        actorMembershipId: membership.id,
        conversationId: conversation.id,
        reasonCode:
          resultingState === StoreConversationModerationState.RESTRICTED
            ? "conversation_restricted"
            : "conversation_reinstated",
        storeId: store.id,
        tenantId: input.tenantId,
        type:
          resultingState === StoreConversationModerationState.RESTRICTED
            ? "RESTRICTED"
            : "REINSTATED",
      },
    })
    await audit({
      outcome: StoreConversationModerationAuditOutcome.ALLOWED,
      reasonCode: "moderation_applied",
      resultingRevision,
    })
    return {
      projection: moderationProjection({
        moderationRevision: resultingRevision,
        moderationState: resultingState,
        restrictedAt,
      }),
      replayed: false,
    }
  })

  if ("projection" in result) {
    return { ...result.projection, replayed: result.replayed }
  }
  if (result.denied === "FORBIDDEN") {
    throw new StoreConversationError(
      "FORBIDDEN",
      "Owner, administrator, or manager access is required.",
    )
  }
  if (result.denied === "NOT_FOUND") {
    throw new StoreConversationError("NOT_FOUND", "Conversation not found.")
  }
  if (result.denied === "NOT_READY") {
    throw new StoreConversationError(
      "NOT_READY",
      "This conversation cannot be moderated right now.",
    )
  }
  throw new StoreConversationError(
    "CONFLICT",
    "Conversation moderation changed. Refresh and try again.",
  )
}
