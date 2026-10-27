import {
  WHATSAPP_ACTION_DISABLED_REPLY,
  WHATSAPP_ACTION_INVALID_REPLY,
  WHATSAPP_ACTION_RESULT_VERSION,
  renderWhatsAppActionResult,
  renderWhatsAppActionResultChunks,
  whatsAppActionOutcomeSchema,
} from "@ewatrade/assistant/channels/action-result"
export {
  WHATSAPP_ACTION_RESULT_VERSION,
  WHATSAPP_ACTION_INVALID_REPLY,
  WHATSAPP_ACTION_DISABLED_REPLY,
} from "@ewatrade/assistant/channels/action-result"
import { createHash } from "node:crypto"
import { conversationAppLink } from "@ewatrade/assistant/channels/conversation-links"
import { whatsAppChannelPolicy } from "@ewatrade/assistant/channels/policy"
import { whatsAppPlainText } from "@ewatrade/assistant/channels/render"
import type { GeneralProposal } from "@ewatrade/assistant/general/contracts"
import {
  AssistantWhatsAppError,
  type WhatsAppInboxLease,
  assertAssistantWhatsAppInboxLease,
  assistantWhatsAppAuthorityDigest,
  completeAssistantWhatsAppActionReviewInTransaction,
  consumeAssistantWhatsAppActionReviewInTransaction,
  resolveAssistantWhatsAppConversation,
  whatsAppActionReviewIngressContentSchema,
} from "@ewatrade/db/assistant-whatsapp"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { paymentLinkOrigin } from "../banking/config"
import { isLinkedAssistantIdentity } from "./channel-principal"
import type { GeneralContext } from "./general-context"
import {
  decideGeneralProposalInTransaction,
  inFreshGeneralTransaction,
} from "./general-proposals"
import { proposalApprovalToken } from "./proposal-security"

const invalidContent = z.object({ type: z.literal("invalid_action") }).strict()
const outcomeSchema = whatsAppActionOutcomeSchema
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")

/** Exact authorized receipt fields only; no IDs, action digests or approval DTOs are rendered. */
export function assistantWhatsAppActionResultText(
  proposal: GeneralProposal,
  appLink?: string,
) {
  return renderWhatsAppActionResult(proposal, appLink)
}

export const defaultChannelActionDependencies = () => ({
  linked: isLinkedAssistantIdentity,
  transaction: inFreshGeneralTransaction,
  lease: assertAssistantWhatsAppInboxLease,
  resolve: resolveAssistantWhatsAppConversation,
  authority: assistantWhatsAppAuthorityDigest,
  consume: consumeAssistantWhatsAppActionReviewInTransaction,
  complete: completeAssistantWhatsAppActionReviewInTransaction,
  decide: decideGeneralProposalInTransaction,
  writesEnabled: () => whatsAppChannelPolicy().writes,
})

/** Internal claimed ACTION entry only; the root transaction owns proof, canonical effect and reply intent. */
export async function processAssistantWhatsAppAction(
  ctx: GeneralContext,
  lease: WhatsAppInboxLease,
  deps = defaultChannelActionDependencies(),
): Promise<
  { status: "completed"; outboxId: string } | { status: "cancelled" }
> {
  if (
    !deps.linked(ctx.session) ||
    ctx.session.principal.bindingId !== lease.bindingId ||
    !ctx.session.inboxLease ||
    ctx.session.inboxLease.inboxId !== lease.inboxId ||
    ctx.session.inboxLease.bindingId !== lease.bindingId ||
    ctx.session.inboxLease.owner !== lease.owner ||
    ctx.session.inboxLease.generation !== lease.generation
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")

  const execute = (refusal = false) =>
    deps.transaction(ctx, async (fresh) => {
      if (!deps.linked(fresh.session))
        throw new AssistantWhatsAppError("UNAUTHORIZED")
      const principal = fresh.session.principal
      const inbox = await deps.lease(fresh.db, lease)
      if (
        inbox.kind !== "ACTION" ||
        inbox.bindingId !== principal.bindingId ||
        inbox.identityId
      )
        throw new AssistantWhatsAppError("UNAUTHORIZED")
      const resolved = await deps.resolve(fresh.db, principal)
      const authorityDigest = await deps.authority(fresh.db, resolved)
      const parsed = whatsAppActionReviewIngressContentSchema.safeParse(
        inbox.content,
      )
      const malformed =
        invalidContent.safeParse(inbox.content).success || !parsed.success
      const enabled = deps.writesEnabled()
      let body =
        !enabled && !malformed && !refusal
          ? WHATSAPP_ACTION_DISABLED_REPLY
          : WHATSAPP_ACTION_INVALID_REPLY
      let resultRef: z.infer<typeof outcomeSchema> | undefined
      let bodies: string[] | undefined
      if (!refusal && !malformed && parsed.success && enabled) {
        const consumed = await deps.consume(fresh.db, {
          principal,
          decisionDigest: parsed.data.decisionDigest,
          decision: parsed.data.decision,
          quotedProviderMessageId: parsed.data.replyToMessageId,
          ingressId: inbox.id,
        })
        const row = await fresh.db.assistantActionProposal.findFirst({
          where: {
            id: consumed.proposalId,
            revision: consumed.revision,
            tenantId: resolved.scope.tenantId,
            storeId: resolved.scope.storeId,
            actorUserId: resolved.scope.userId,
            conversationId: resolved.conversation.id,
          },
        })
        if (!row) throw new AssistantWhatsAppError("CONFLICT")
        if (consumed.alreadyConsumed) {
          const prior = outcomeSchema.safeParse(consumed.resultRef)
          if (
            !prior.success ||
            prior.data.proposalId !== row.id ||
            prior.data.revision !== row.revision ||
            prior.data.decision !== parsed.data.decision ||
            prior.data.status !== row.status ||
            (parsed.data.decision === "confirm"
              ? row.status !== "COMPLETED" || !row.executedResult
              : row.status !== "CANCELLED")
          )
            throw new AssistantWhatsAppError("CONFLICT")
        } else if (row.status !== "PENDING")
          throw new AssistantWhatsAppError("CONFLICT")
        const proposal = await deps.decide(fresh, {
          proposalId: row.id,
          revision: row.revision,
          decision: parsed.data.decision,
          ...(!consumed.alreadyConsumed && parsed.data.decision === "confirm"
            ? {
                approvalToken: proposalApprovalToken(
                  row,
                  process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
                ),
              }
            : {}),
        })
        resultRef = outcomeSchema.parse({
          proposalId: proposal.id,
          revision: proposal.revision,
          status: proposal.status,
          decision: parsed.data.decision,
        })
        if (
          resultRef.proposalId !== consumed.proposalId ||
          resultRef.revision !== consumed.revision ||
          (resultRef.decision === "confirm"
            ? resultRef.status !== "COMPLETED"
            : resultRef.status !== "CANCELLED")
        )
          throw new AssistantWhatsAppError("CONFLICT")
        if (!consumed.alreadyConsumed)
          await deps.complete(fresh.db, consumed.reviewId, inbox.id, resultRef)
        const link = conversationAppLink(
          {
            conversationId: resolved.conversation.id,
            purpose: "GENERAL",
            origin: {
              tenantId: resolved.scope.tenantId,
              storeId: resolved.scope.storeId,
            },
          },
          {
            trustedAppOrigin:
              process.env.DASHBOARD_URL ??
              process.env.NEXT_PUBLIC_DASHBOARD_URL ??
              "https://dash.ewatrade.com",
            currentScope: {
              tenantId: resolved.scope.tenantId,
              storeId: resolved.scope.storeId,
            },
          },
        )
        body = assistantWhatsAppActionResultText(proposal, link?.href)
        bodies = renderWhatsAppActionResultChunks(proposal, link?.href, {
          appOrigin:
            process.env.DASHBOARD_URL ??
            process.env.NEXT_PUBLIC_DASHBOARD_URL ??
            "https://dash.ewatrade.com",
          paymentOrigin:
            proposal.receipt?.kind === "payment_links"
              ? paymentLinkOrigin()
              : undefined,
        })
      }
      const chunks = bodies ?? [body]
      let firstOutboxId: string | undefined
      for (const [chunkIndex, content] of chunks.entries()) {
        const outbox = await fresh.db.assistantWhatsAppOutbox.create({
          data: {
            inboxId: inbox.id,
            phoneNumberId: inbox.phoneNumberId,
            chunkIndex,
            chunkCount: chunks.length,
            rendererVersion: WHATSAPP_ACTION_RESULT_VERSION,
            renderKind: "action_result",
            authorityDigest,
            content,
            contentDigest: digest(content),
            expiresAt: inbox.expiresAt,
          },
          select: { id: true },
        })
        firstOutboxId ??= outbox.id
      }
      if (!firstOutboxId) throw new AssistantWhatsAppError("CONFLICT")
      await fresh.db.assistantWhatsAppInbox.update({
        where: { id: inbox.id },
        data: {
          state: "COMPLETED",
          content: resultRef
            ? { type: "action_result", resultRef }
            : { type: "action_refusal" },
          completedAt: new Date(),
          executionAuthorityDigest: authorityDigest,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          errorCode: null,
        },
      })
      return { status: "completed" as const, outboxId: firstOutboxId }
    })
  try {
    return await execute()
  } catch (error) {
    // Only a known rolled-back business refusal may produce a fresh safe response.
    if (
      !(error instanceof AssistantWhatsAppError) &&
      !(error instanceof TRPCError)
    )
      throw error
    try {
      return await execute(true)
    } catch (refusalError) {
      if (
        refusalError instanceof AssistantWhatsAppError ||
        refusalError instanceof TRPCError
      )
        return { status: "cancelled" }
      throw refusalError
    }
  }
}
