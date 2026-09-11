import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  MembershipStatus,
  StoreConversationSensitiveReadKind,
  StoreConversationSensitiveReadOutcome,
  StoreConversationSensitiveReadPurpose,
} from "../../generated/prisma/enums"
import { PrescriptionRequestError } from "./prescription-requests"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import {
  StoreConversationError,
  digestStoreConversationValue,
} from "./store-conversations-core"

const kinds = {
  attachment: StoreConversationSensitiveReadKind.ATTACHMENT,
  timeline: StoreConversationSensitiveReadKind.TIMELINE,
} as const

const purposes = {
  conversation_support:
    StoreConversationSensitiveReadPurpose.CONVERSATION_SUPPORT,
  customer_request_attachment_review:
    StoreConversationSensitiveReadPurpose.CUSTOMER_REQUEST_ATTACHMENT_REVIEW,
} as const

type SensitiveReadInput = {
  actorUserId: string
  conversationId: string
  kind: keyof typeof kinds
  purpose: keyof typeof purposes
  storeId: string
  subjectReference?: string
  tenantId: string
}

type SensitiveReadContext = {
  conversation: { id: string }
  membership: {
    id: string
    role: string
    user: { displayName: string | null; name: string | null }
  }
}

function safeReadFailureReason(error: unknown) {
  if (error instanceof StoreConversationError) {
    const reasons = {
      CONFLICT: "sensitive_read_conflict",
      FORBIDDEN: "sensitive_read_forbidden",
      GUEST_CREDENTIAL_EXPIRED: "sensitive_read_credential_expired",
      NOT_FOUND: "sensitive_read_not_found",
      NOT_READY: "sensitive_read_not_ready",
      STORE_UNAVAILABLE: "sensitive_read_store_unavailable",
    } as const
    return reasons[error.code]
  }
  if (error instanceof PrescriptionRequestError) {
    return "sensitive_read_clinical_denied" as const
  }
  return null
}

/**
 * Keeps a sensitive Store Conversation read and its personal authorization
 * audit in one bounded transaction. No value can escape when the audit insert
 * fails. Expected scoped denials are committed as content-free audit facts and
 * thrown only after the transaction commits.
 */
export async function runStoreConversationSensitiveRead<Result>(
  db: PrismaClient,
  input: SensitiveReadInput,
  read: (
    context: SensitiveReadContext,
    tx: Prisma.TransactionClient,
  ) => Promise<Result>,
): Promise<Result> {
  const kind = kinds[input.kind]
  const purpose = purposes[input.purpose]
  const subjectReferenceDigest = input.subjectReference
    ? digestStoreConversationValue(input.subjectReference)
    : null
  const result = await runStoreConversationActionTransaction(db, async (tx) => {
    const [membership, store, conversation] = await Promise.all([
      tx.membership.findFirst({
        select: {
          id: true,
          role: true,
          user: { select: { displayName: true, name: true } },
        },
        where: {
          acceptedAt: { not: null },
          status: MembershipStatus.ACTIVE,
          tenantId: input.tenantId,
          userId: input.actorUserId,
          serviceCommerceStoreTeamAssignments: {
            some: {
              capability: "ATTENDANT",
              status: "ACTIVE",
              storeId: input.storeId,
              tenantId: input.tenantId,
            },
          },
        },
      }),
      tx.store.findFirst({
        select: { id: true },
        where: {
          id: input.storeId,
          status: "ACTIVE",
          tenantId: input.tenantId,
        },
      }),
      tx.storeConversation.findFirst({
        select: { id: true },
        where: {
          id: input.conversationId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      }),
    ])

    const audit = async (auditInput: {
      outcome: StoreConversationSensitiveReadOutcome
      reasonCode: string
    }) => {
      await tx.storeConversationSensitiveReadAuditEvent.create({
        data: {
          actorMembershipId: membership?.id ?? null,
          actorUserId: input.actorUserId,
          conversationId: conversation?.id ?? null,
          kind,
          outcome: auditInput.outcome,
          purpose,
          reasonCode: auditInput.reasonCode,
          storeId: store?.id ?? null,
          subjectReferenceDigest,
          tenantId: input.tenantId,
        },
      })
    }

    if (!membership) {
      await audit({
        outcome: StoreConversationSensitiveReadOutcome.DENIED,
        reasonCode: "sensitive_read_membership_forbidden",
      })
      return { kind: "denied" as const, reason: "FORBIDDEN" as const }
    }
    if (!store || !conversation) {
      await audit({
        outcome: StoreConversationSensitiveReadOutcome.DENIED,
        reasonCode: "sensitive_read_scope_not_found",
      })
      return { kind: "denied" as const, reason: "NOT_FOUND" as const }
    }

    try {
      const value = await read({ conversation, membership }, tx)
      await audit({
        outcome: StoreConversationSensitiveReadOutcome.ALLOWED,
        reasonCode: "sensitive_read_authorized",
      })
      return { kind: "value" as const, value }
    } catch (error) {
      const reasonCode = safeReadFailureReason(error)
      if (!reasonCode) throw error
      await audit({
        outcome: StoreConversationSensitiveReadOutcome.DENIED,
        reasonCode,
      })
      return { error, kind: "read_error" as const }
    }
  })

  if (result.kind === "value") return result.value
  if (result.kind === "read_error") throw result.error
  if (result.reason === "FORBIDDEN") {
    throw new StoreConversationError(
      "FORBIDDEN",
      "Store conversation access is unavailable.",
    )
  }
  throw new StoreConversationError("NOT_FOUND", "Conversation not found.")
}
