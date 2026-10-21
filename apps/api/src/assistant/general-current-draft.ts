import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import {
  type GeneralAction,
  generalActionSchema,
  generalProposalReferenceSchema,
} from "@ewatrade/assistant/general/contracts"
import type { AssistantScope } from "@ewatrade/db/assistant"
import {
  generalConversationWhere,
  generalProposalWhere,
} from "@ewatrade/db/assistant-general"
import { isLinkedAssistantIdentity } from "./channel-principal"
import type { GeneralTransactionContext } from "./general-actions"
import { requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

type Run = {
  id: string
  conversationId: string
  actorUserId: string
  requestId: string
  status: string
}
type Message = {
  id: string
  conversationId: string
  sequence: number
  role: string
  parts: unknown
  completedRun: (Run & { assistantMessageId: string | null }) | null
}
type PendingDraft = {
  id: string
  conversationId: string
  tenantId: string
  storeId: string
  actorUserId: string
  action: string
  actionVersion: number
  payload: unknown
  payloadHash: string
  revision: number
  status: string
  expiresAt: Date
}
export type CurrentGeneralDraftSource = {
  kind: "committed_reference" | "legacy_unique"
  conversationId: string
  /** The server's current running turn, never supplied by the model. */
  runId: string
  proposalId: string
  revision: number
  payloadHash: string
  anchor?: {
    messageId: string
    messageSequence: number
    runId: string
    revision: number
    payloadHash: string
  }
}
export type CurrentGeneralDraft =
  | {
      status: "available"
      source: CurrentGeneralDraftSource
      payload: Extract<GeneralAction, { action: "product_create" }>
    }
  | { status: "none" | "ambiguous" | "unavailable" }

export type CurrentGeneralDraftSnapshot = {
  scope: AssistantScope
  conversationId: string
  runId: string
  currentRun: Run | null
  userMessage: {
    conversationId: string
    role: string
    sequence: number
    clientRequestId: string | null
  } | null
  /** At most eight completed server replies, newest first, before this user turn. */
  sources: readonly Message[]
  /** At most two; a second live draft is always ambiguous, regardless of age. */
  pending: readonly PendingDraft[]
  now: Date
}

/** Current draft is server provenance, never a model-selected ID or newest-row guess. */
export function selectCurrentGeneralDraft(
  input: CurrentGeneralDraftSnapshot,
): CurrentGeneralDraft {
  const { scope, currentRun: run, userMessage: user, conversationId } = input
  if (
    !run ||
    !user ||
    run.id !== input.runId ||
    run.status !== "RUNNING" ||
    run.conversationId !== conversationId ||
    run.actorUserId !== scope.userId ||
    user.conversationId !== conversationId ||
    user.role !== "user" ||
    user.clientRequestId !== run.requestId ||
    !Number.isSafeInteger(user.sequence)
  )
    return { status: "unavailable" }
  if (input.pending.length > 1) return { status: "ambiguous" }
  const row = input.pending[0]
  if (!row) return { status: "none" }
  const parsed = generalActionSchema.safeParse(row.payload)
  if (
    row.conversationId !== conversationId ||
    row.tenantId !== scope.tenantId ||
    row.storeId !== scope.storeId ||
    row.actorUserId !== scope.userId ||
    row.status !== "PENDING" ||
    row.expiresAt <= input.now ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    !parsed.success ||
    parsed.data.action !== "product_create" ||
    row.action !== parsed.data.action ||
    row.actionVersion !== capabilityForAction(parsed.data.action).version ||
    proposalDigest(row.payload) !== row.payloadHash
  )
    return { status: "unavailable" }
  if (input.sources.length > 8) return { status: "unavailable" }
  let newerSequence = user.sequence
  for (const message of input.sources) {
    const completed = message.completedRun
    if (
      message.conversationId !== conversationId ||
      message.role !== "assistant" ||
      !Number.isSafeInteger(message.sequence) ||
      message.sequence >= newerSequence ||
      !completed ||
      completed.status !== "COMPLETED" ||
      completed.conversationId !== conversationId ||
      completed.actorUserId !== scope.userId ||
      completed.assistantMessageId !== message.id ||
      !Array.isArray(message.parts)
    )
      return { status: "unavailable" }
    newerSequence = message.sequence
    const references = []
    for (const part of message.parts) {
      if (
        !part ||
        typeof part !== "object" ||
        !("type" in part) ||
        part.type !== "data-general-proposal-reference"
      )
        continue
      const reference = generalProposalReferenceSchema.safeParse(
        "data" in part ? part.data : null,
      )
      if (!reference.success) return { status: "unavailable" }
      references.push(reference.data)
    }
    if (references.length > 1) return { status: "ambiguous" }
    const reference = references[0]
    if (!reference) continue
    if (
      reference.proposalId !== row.id ||
      reference.revision > row.revision ||
      (reference.revision === row.revision &&
        reference.payloadHash !== row.payloadHash)
    )
      return { status: "unavailable" }
    return {
      status: "available",
      payload: parsed.data,
      source: {
        kind: "committed_reference",
        conversationId,
        runId: run.id,
        proposalId: row.id,
        revision: row.revision,
        payloadHash: row.payloadHash,
        anchor: {
          messageId: message.id,
          messageSequence: message.sequence,
          runId: completed.id,
          revision: reference.revision,
          payloadHash: reference.payloadHash,
        },
      },
    }
  }
  return {
    status: "available",
    payload: parsed.data,
    source: {
      kind: "legacy_unique",
      conversationId,
      runId: run.id,
      proposalId: row.id,
      revision: row.revision,
      payloadHash: row.payloadHash,
    },
  }
}

/** Caller owns the same fresh-authorized transaction used for canonical editing. */
export async function readCurrentGeneralDraftInTransaction(
  fresh: GeneralTransactionContext,
  input: { conversationId: string; runId: string },
): Promise<CurrentGeneralDraft> {
  const scope = requireGeneralScope(fresh)
  if (
    isLinkedAssistantIdentity(fresh.session) &&
    fresh.assistantConversationId !== input.conversationId
  )
    return { status: "unavailable" }
  const conversation = await fresh.db.assistantConversation.findFirst({
    where: { ...generalConversationWhere(scope), id: input.conversationId },
    select: { id: true },
  })
  if (!conversation) return { status: "unavailable" }
  const currentRun = await fresh.db.assistantRun.findFirst({
    where: {
      id: input.runId,
      conversationId: conversation.id,
      actorUserId: scope.userId,
      status: "RUNNING",
    },
    select: {
      id: true,
      conversationId: true,
      actorUserId: true,
      requestId: true,
      status: true,
    },
  })
  if (!currentRun) return { status: "unavailable" }
  const userMessage = await fresh.db.assistantMessage.findFirst({
    where: {
      conversationId: conversation.id,
      role: "user",
      clientRequestId: currentRun.requestId,
    },
    select: {
      conversationId: true,
      role: true,
      sequence: true,
      clientRequestId: true,
    },
  })
  if (!userMessage) return { status: "unavailable" }
  const sources = await fresh.db.assistantMessage.findMany({
    where: {
      conversationId: conversation.id,
      role: "assistant",
      sequence: { lt: userMessage.sequence },
      completedRun: {
        is: {
          actorUserId: scope.userId,
          conversationId: conversation.id,
          status: "COMPLETED",
        },
      },
    },
    orderBy: { sequence: "desc" },
    take: 8,
    include: {
      completedRun: {
        select: {
          id: true,
          conversationId: true,
          actorUserId: true,
          requestId: true,
          status: true,
          assistantMessageId: true,
        },
      },
    },
  })
  const now = new Date()
  const pending = await fresh.db.assistantActionProposal.findMany({
    where: {
      ...generalProposalWhere(scope),
      conversationId: conversation.id,
      status: "PENDING",
      expiresAt: { gt: now },
    },
    take: 2,
    select: {
      id: true,
      conversationId: true,
      tenantId: true,
      storeId: true,
      actorUserId: true,
      action: true,
      actionVersion: true,
      payload: true,
      payloadHash: true,
      revision: true,
      status: true,
      expiresAt: true,
    },
  })
  return selectCurrentGeneralDraft({
    ...input,
    scope,
    currentRun,
    userMessage,
    sources,
    pending,
    now,
  })
}
