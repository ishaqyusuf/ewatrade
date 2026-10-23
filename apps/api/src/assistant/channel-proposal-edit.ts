import { createHash, randomBytes } from "node:crypto"
import {
  WHATSAPP_ACTION_EDIT_RESULT_VERSION,
  WHATSAPP_EDIT_INTENT_KIND,
  renderWhatsAppActionEditResult,
  whatsAppEditIntentStateSchema,
} from "@ewatrade/assistant/channels/action-result"
import {
  type GeneralAction,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  AssistantWhatsAppError,
  type WhatsAppInboxLease,
  assertAssistantWhatsAppInboxLease,
  assistantWhatsAppAuthorityDigest,
  completeAssistantWhatsAppActionReviewInTransaction,
  consumeAssistantWhatsAppActionReviewInTransaction,
  resolveAssistantWhatsAppConversation,
  whatsAppActionEditReviewIngressContentSchema,
} from "@ewatrade/db/assistant-whatsapp"
import { TRPCError } from "@trpc/server"
import { NATIVE_FLOW_KIND } from "./channel-flow-state"
import { isLinkedAssistantIdentity } from "./channel-principal"
import type { GeneralTransactionContext } from "./general-actions"
import type { GeneralContext } from "./general-context"
import {
  assertGeneralActionAuthority,
  requireGeneralScope,
} from "./general-context"
import {
  decideGeneralProposalInTransaction,
  editGeneralProposalInTransaction,
  inFreshGeneralTransaction,
} from "./general-proposals"
import { proposalDigest } from "./proposal-security"

/** The exact accepted review is consumed before a new revision can be edited. No approval or business effect. */
export const defaultWhatsAppEditRequestDependencies = () => ({
  linked: isLinkedAssistantIdentity,
  transaction: inFreshGeneralTransaction,
  lease: assertAssistantWhatsAppInboxLease,
  resolve: resolveAssistantWhatsAppConversation,
  authority: assistantWhatsAppAuthorityDigest,
  consume: consumeAssistantWhatsAppActionReviewInTransaction,
  complete: completeAssistantWhatsAppActionReviewInTransaction,
  edit: editGeneralProposalInTransaction,
})
export async function processAssistantWhatsAppEditRequest(
  ctx: GeneralContext,
  lease: WhatsAppInboxLease,
  deps = defaultWhatsAppEditRequestDependencies(),
) {
  if (!deps.linked(ctx.session)) return null
  const peek = await ctx.db.assistantWhatsAppInbox.findFirst({
    where: { id: lease.inboxId, bindingId: lease.bindingId, kind: "ACTION" },
    select: { content: true },
  })
  if (
    !whatsAppActionEditReviewIngressContentSchema.safeParse(peek?.content)
      .success
  )
    return null
  const execute = (refusal = false) =>
    deps.transaction(ctx, async (fresh) => {
      if (!deps.linked(fresh.session) || fresh.session.purpose !== "GENERAL")
        throw new AssistantWhatsAppError("UNAUTHORIZED")
      const inbox = await deps.lease(fresh.db, lease)
      const parsed = whatsAppActionEditReviewIngressContentSchema.parse(
        inbox.content,
      )
      const current = await deps.resolve(fresh.db, fresh.session.principal)
      const authorityDigest = await deps.authority(fresh.db, current)
      let result:
        | { type: "action_edit_refusal" }
        | {
            type: "action_edit_result"
            intentId: string
            reviewId: string
            proposalId: string
            revision: number
          } = { type: "action_edit_refusal" }
      if (!refusal) {
        const review = await deps.consume(fresh.db, {
          principal: fresh.session.principal,
          decision: "cancel",
          decisionDigest: parsed.decisionDigest,
          quotedProviderMessageId: parsed.replyToMessageId,
          ingressId: inbox.id,
        })
        if (review.alreadyConsumed) throw new AssistantWhatsAppError("CONFLICT")
        const row = await fresh.db.assistantActionProposal.findFirst({
          where: {
            id: review.proposalId,
            revision: review.revision,
            status: "PENDING",
            actorUserId: current.scope.userId,
            tenantId: current.scope.tenantId,
            storeId: current.scope.storeId,
            conversationId: current.conversation.id,
          },
        })
        if (!row) throw new AssistantWhatsAppError("CONFLICT")
        const edited = await deps.edit(fresh, {
          proposalId: row.id,
          revision: row.revision,
          payload: generalActionSchema.parse(row.payload),
        })
        // Only one editing target exists for this binding; an earlier editing prompt is superseded.
        await fresh.db.onboardingSession.updateMany({
          where: {
            userId: current.scope.userId,
            tenantId: current.scope.tenantId,
            completed: false,
            AND: [
              {
                formData: { path: ["kind"], equals: WHATSAPP_EDIT_INTENT_KIND },
              },
              { formData: { path: ["bindingId"], equals: current.binding.id } },
            ],
          },
          data: { completed: true },
        })
        const intentId = `wa-edit_${review.reviewId}`
        // An older form must not create an unrelated draft while this exact draft is being edited.
        await fresh.db.onboardingSession.updateMany({
          where: {
            userId: current.scope.userId,
            completed: false,
            AND: [
              { formData: { path: ["kind"], equals: NATIVE_FLOW_KIND } },
              {
                formData: {
                  path: ["phoneNumberId"],
                  equals: current.principal.phoneNumberId,
                },
              },
              {
                formData: {
                  path: ["senderId"],
                  equals: current.principal.senderId,
                },
              },
            ],
          },
          data: { completed: true, expiresAt: new Date() },
        })
        await fresh.db.onboardingSession.create({
          data: {
            id: intentId,
            token: `wa-flow_edit_${randomBytes(32).toString("hex")}`,
            tenantId: current.scope.tenantId,
            userId: current.scope.userId,
            expiresAt: new Date(edited.expiresAt),
            formData: {
              kind: WHATSAPP_EDIT_INTENT_KIND,
              bindingId: current.binding.id,
              proposalId: edited.id,
              revision: edited.revision,
              payloadHash: proposalDigest(edited.payload),
              scopeDigest: authorityDigest,
              identityGeneration: current.binding.identityGeneration,
              grantGeneration: current.binding.grantGeneration,
              selectionGeneration: current.binding.selectionGeneration,
            },
          },
        })
        result = {
          type: "action_edit_result",
          intentId,
          reviewId: review.reviewId,
          proposalId: edited.id,
          revision: edited.revision,
        }
        await deps.complete(fresh.db, review.reviewId, inbox.id, result)
      }
      const body = renderWhatsAppActionEditResult(result)
      const output = await fresh.db.assistantWhatsAppOutbox.create({
        data: {
          inboxId: inbox.id,
          phoneNumberId: inbox.phoneNumberId,
          chunkIndex: 0,
          chunkCount: 1,
          rendererVersion: WHATSAPP_ACTION_EDIT_RESULT_VERSION,
          renderKind: "action_edit_result",
          authorityDigest,
          content: body,
          contentDigest: createHash("sha256").update(body).digest("hex"),
          expiresAt: inbox.expiresAt,
        },
        select: { id: true },
      })
      await fresh.db.assistantWhatsAppInbox.update({
        where: { id: inbox.id },
        data: {
          state: "COMPLETED",
          content: result,
          completedAt: new Date(),
          executionAuthorityDigest: authorityDigest,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          errorCode: null,
        },
      })
      return { status: "completed" as const, outboxId: output.id }
    })
  try {
    return await execute()
  } catch (error) {
    if (
      !(error instanceof AssistantWhatsAppError) &&
      !(error instanceof TRPCError)
    )
      throw error
    return execute(true)
  }
}

async function currentEdit(fresh: GeneralTransactionContext) {
  if (
    !isLinkedAssistantIdentity(fresh.session) ||
    fresh.session.purpose !== "GENERAL"
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Use the exact WhatsApp draft's Edit option first.",
    })
  const scope = requireGeneralScope(fresh)
  const current = await resolveAssistantWhatsAppConversation(
    fresh.db,
    fresh.session.principal,
  )
  const rows = await fresh.db.onboardingSession.findMany({
    where: {
      userId: scope.userId,
      tenantId: scope.tenantId,
      completed: false,
      expiresAt: { gt: new Date() },
      AND: [
        { formData: { path: ["kind"], equals: WHATSAPP_EDIT_INTENT_KIND } },
        { formData: { path: ["bindingId"], equals: current.binding.id } },
      ],
    },
    take: 2,
  })
  if (rows.length !== 1) return null
  const row = rows[0]
  if (!row) return null
  const state = whatsAppEditIntentStateSchema.safeParse(row.formData)
  if (
    !state.success ||
    state.data.identityGeneration !== current.binding.identityGeneration ||
    state.data.grantGeneration !== current.binding.grantGeneration ||
    state.data.selectionGeneration !== current.binding.selectionGeneration ||
    state.data.scopeDigest !==
      (await assistantWhatsAppAuthorityDigest(fresh.db, current))
  )
    return null
  const proposal = await fresh.db.assistantActionProposal.findFirst({
    where: {
      id: state.data.proposalId,
      revision: state.data.revision,
      payloadHash: state.data.payloadHash,
      status: "PENDING",
      expiresAt: { gt: new Date() },
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      actorUserId: scope.userId,
      conversationId: current.conversation.id,
    },
  })
  if (!proposal || proposalDigest(proposal.payload) !== state.data.payloadHash)
    return null
  assertGeneralActionAuthority(
    fresh,
    generalActionSchema.parse(proposal.payload).action,
  )
  return { intent: row, proposal }
}

/** Personal CANCEL targets only the exact accepted edit intent, even when older drafts remain. */
export async function cancelCurrentWhatsAppEditInTransaction(
  fresh: GeneralTransactionContext,
) {
  const current = await currentEdit(fresh)
  if (!current) return false
  const cancelled = await decideGeneralProposalInTransaction(fresh, {
    proposalId: current.proposal.id,
    revision: current.proposal.revision,
    decision: "cancel",
  })
  if (cancelled.status !== "CANCELLED")
    throw new AssistantWhatsAppError("CONFLICT")
  const consumed = await fresh.db.onboardingSession.updateMany({
    where: { id: current.intent.id, completed: false },
    data: { completed: true },
  })
  if (consumed.count !== 1) throw new AssistantWhatsAppError("CONFLICT")
  return true
}

/** Safe model context only: no proof, source selection, revision or approval credential. */
export function readCurrentWhatsAppDraft(ctx: GeneralContext) {
  return inFreshGeneralTransaction(ctx, async (fresh) => {
    const current = await currentEdit(fresh)
    return current
      ? {
          status: "editing" as const,
          payload: generalActionSchema.parse(current.proposal.payload),
        }
      : { status: "none" as const }
  })
}

/** Call before legacy simple-chat dispatch so it cannot select a different pending proposal. */
export async function hasCurrentWhatsAppEdit(ctx: GeneralContext) {
  return (
    isLinkedAssistantIdentity(ctx.session) &&
    (await readCurrentWhatsAppDraft(ctx)).status === "editing"
  )
}

type WhatsAppDraftCorrectionSource = {
  intentId: string
  intentDigest: string
  intentTokenDigest: string
  intentExpiresAt: number
  principalDigest: string
  proposalId: string
  revision: number
  payloadHash: string
  conversationId: string
  tenantId: string
  storeId: string
  actorUserId: string
}

async function readWhatsAppDraftCorrection(fresh: GeneralTransactionContext) {
  const current = await currentEdit(fresh)
  if (!current || !isLinkedAssistantIdentity(fresh.session)) return null
  const source: WhatsAppDraftCorrectionSource = {
    intentId: current.intent.id,
    intentDigest: proposalDigest(current.intent.formData),
    intentTokenDigest: proposalDigest(current.intent.token),
    intentExpiresAt: current.intent.expiresAt.getTime(),
    principalDigest: proposalDigest(fresh.session.principal),
    proposalId: current.proposal.id,
    revision: current.proposal.revision,
    payloadHash: current.proposal.payloadHash,
    conversationId: current.proposal.conversationId,
    tenantId: current.proposal.tenantId,
    storeId: current.proposal.storeId,
    actorUserId: current.proposal.actorUserId,
  }
  return {
    source,
    payload: generalActionSchema.parse(current.proposal.payload),
  }
}

export const defaultWhatsAppDraftCorrectionDependencies = () => ({
  transaction: inFreshGeneralTransaction,
  read: readWhatsAppDraftCorrection,
  edit: editGeneralProposalInTransaction,
  consume: async (
    fresh: GeneralTransactionContext,
    source: WhatsAppDraftCorrectionSource,
  ) => {
    const consumed = await fresh.db.onboardingSession.updateMany({
      where: {
        id: source.intentId,
        userId: source.actorUserId,
        tenantId: source.tenantId,
        completed: false,
        expiresAt: { gt: new Date() },
      },
      data: { completed: true },
    })
    if (consumed.count !== 1)
      throw new TRPCError({
        code: "CONFLICT",
        message: "That editing request was already used.",
      })
  },
})

/** Per-turn native Edit proof stays private and cannot switch targets after model read. */
export function createWhatsAppDraftCorrection(
  dependencies = defaultWhatsAppDraftCorrectionDependencies(),
) {
  let read: {
    source: WhatsAppDraftCorrectionSource
    action: GeneralAction["action"]
  } | null = null
  return {
    async read(ctx: GeneralContext) {
      read = null
      const current = await dependencies.transaction(ctx, dependencies.read)
      if (!current) return { status: "none" as const }
      read = { source: current.source, action: current.payload.action }
      return { status: "editing" as const, payload: current.payload }
    },
    async edit(ctx: GeneralContext, payload: unknown) {
      const prior = read
      read = null
      const parsed = generalActionSchema.parse(payload)
      if (!prior || parsed.action !== prior.action)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Read the exact WhatsApp draft before correcting it.",
        })
      return dependencies.transaction(ctx, async (fresh) => {
        const current = await dependencies.read(fresh)
        if (
          !current ||
          proposalDigest(current.source) !== proposalDigest(prior.source)
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "The editing request changed. Read its current draft again.",
          })
        const edited = await dependencies.edit(fresh, {
          proposalId: prior.source.proposalId,
          revision: prior.source.revision,
          payload: parsed,
        })
        await dependencies.consume(fresh, prior.source)
        return {
          proposalId: edited.id,
          revision: edited.revision,
          payload: edited.payload,
          status: "needs_user_confirmation" as const,
        }
      })
    },
  }
}
