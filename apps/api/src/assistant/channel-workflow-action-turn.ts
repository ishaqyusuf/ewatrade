import { createHash } from "node:crypto"
import {
  WHATSAPP_WORKFLOW_ACTION_DISABLED_REPLY,
  WHATSAPP_WORKFLOW_ACTION_INVALID_REPLY,
  WHATSAPP_WORKFLOW_ACTION_RESULT_VERSION,
  type WhatsAppWorkflowActionResult,
  renderWhatsAppWorkflowActionResult,
  type whatsAppWorkflowActionResultContentSchema,
  whatsAppWorkflowActionResultSchema,
} from "@ewatrade/assistant/channels/workflow-action-result"
import { AssistantRecordError } from "@ewatrade/db/assistant"
import {
  AssistantWhatsAppError,
  type WhatsAppConversationPrincipal,
  type WhatsAppInboxLease,
  assertAssistantWhatsAppInboxLease,
  assistantWhatsAppAuthorityDigest,
  assistantWhatsAppWorkflowWritesEnabled,
  completeAssistantWhatsAppWorkflowReviewInTransaction,
  consumeAssistantWhatsAppWorkflowReviewInTransaction,
  resolveAssistantWhatsAppConversation,
  resolveAssistantWhatsAppWorkflowReceipt,
  stampAssistantWhatsAppExecution,
  whatsAppWorkflowActionIngressContentSchema,
} from "@ewatrade/db/assistant-whatsapp"
import {
  CatalogError,
  CustomerDirectoryError,
  FinanceError,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import { isLinkedAssistantIdentity } from "./channel-principal"
import {
  executeReviewedWorkflowSelectionInTransaction,
  projectCommand,
} from "./channel-workflow-command"
import { inFreshLinkedWorkflowTransaction } from "./channel-workflow-turn"
import type { GeneralTransactionContext } from "./general-actions"
import type { GeneralContext } from "./general-context"
import { WorkflowTurnError } from "./workflow-turn-contract"

const receiptContextBrand = Symbol("verified-workflow-receipt-context")
export type WorkflowReceiptContext = {
  readonly [receiptContextBrand]: true
  readonly db: GeneralContext["db"]
  readonly principal: Readonly<WhatsAppConversationPrincipal>
  readonly inboxLease: Readonly<WhatsAppInboxLease>
  readonly reviewId: string
}
function isReceiptContext(
  context: GeneralContext | WorkflowReceiptContext,
): context is WorkflowReceiptContext {
  return receiptContextBrand in context && context[receiptContextBrand] === true
}
const sameLease = (
  left: WhatsAppInboxLease | undefined,
  right: WhatsAppInboxLease,
) =>
  Boolean(
    left &&
      left.inboxId === right.inboxId &&
      left.bindingId === right.bindingId &&
      left.owner === right.owner &&
      left.generation === right.generation,
  )
const bodyDigest = (body: string) =>
  createHash("sha256").update(body).digest("hex")
const appOrigin = () =>
  process.env.DASHBOARD_URL ??
  process.env.NEXT_PUBLIC_DASHBOARD_URL ??
  "https://dash.ewatrade.com"

/** Sole issuer for closed Product receipt replay. It creates no Session or normal TURN identity. */
export async function createAssistantWhatsAppWorkflowReceiptContext(
  db: GeneralContext["db"],
  principal: WhatsAppConversationPrincipal,
  lease: WhatsAppInboxLease,
): Promise<WorkflowReceiptContext> {
  const reviewId = await db.$transaction(
    async (tx) => {
      const inbox = await assertAssistantWhatsAppInboxLease(tx, lease)
      const content = whatsAppWorkflowActionIngressContentSchema.safeParse(
        inbox.content,
      )
      if (
        inbox.kind !== "ACTION" ||
        inbox.bindingId !== principal.bindingId ||
        !content.success
      )
        throw new AssistantWhatsAppError("UNAUTHORIZED")
      const review = await tx.assistantWhatsAppWorkflowReview.findFirst({
        where:
          content.data.decision === "confirm"
            ? { confirmDigest: content.data.decisionDigest }
            : { cancelDigest: content.data.decisionDigest },
      })
      if (
        !review ||
        review.state !== "CONSUMED" ||
        !review.completedAt ||
        !review.resultRef ||
        review.decision !== content.data.decision
      )
        throw new AssistantWhatsAppError("UNAUTHORIZED")
      const resolved = await resolveAssistantWhatsAppWorkflowReceipt(
        tx,
        principal,
        review.id,
      )
      if (
        resolved.source.purpose !== content.data.purpose ||
        resolved.binding.id !== lease.bindingId
      )
        throw new AssistantWhatsAppError("UNAUTHORIZED")
      return review.id
    },
    { isolationLevel: "Serializable" },
  )
  return Object.freeze({
    [receiptContextBrand]: true as const,
    db,
    principal: Object.freeze({ ...principal }),
    inboxLease: Object.freeze({ ...lease }),
    reviewId,
  })
}

type ActionResolved = Awaited<
  ReturnType<typeof resolveAssistantWhatsAppConversation>
>
type ActionTransaction = {
  db: GeneralTransactionContext["db"]
  principal: WhatsAppConversationPrincipal
  resolved: ActionResolved
  fresh: GeneralTransactionContext | null
}
async function inWorkflowReceiptTransaction<T>(
  context: WorkflowReceiptContext,
  work: (scope: ActionTransaction) => Promise<T>,
) {
  return context.db.$transaction(
    async (tx) => {
      const resolved = await resolveAssistantWhatsAppWorkflowReceipt(
        tx,
        context.principal,
        context.reviewId,
      )
      const inbox = await assertAssistantWhatsAppInboxLease(
        tx,
        context.inboxLease,
      )
      if (inbox.kind !== "ACTION" || inbox.bindingId !== resolved.binding.id)
        throw new AssistantWhatsAppError("UNAUTHORIZED")
      await stampAssistantWhatsAppExecution(tx, context.inboxLease, resolved)
      return work({
        db: tx,
        principal: context.principal,
        resolved,
        fresh: null,
      })
    },
    { isolationLevel: "Serializable" },
  )
}
export const defaultChannelWorkflowActionDependencies = () => ({
  linked: isLinkedAssistantIdentity,
  transaction: inFreshLinkedWorkflowTransaction,
  receiptTransaction: inWorkflowReceiptTransaction,
  lease: assertAssistantWhatsAppInboxLease,
  resolve: resolveAssistantWhatsAppConversation,
  authority: assistantWhatsAppAuthorityDigest,
  consume: consumeAssistantWhatsAppWorkflowReviewInTransaction,
  complete: completeAssistantWhatsAppWorkflowReviewInTransaction,
  execute: executeReviewedWorkflowSelectionInTransaction,
  projectCommand,
  writesEnabled: assistantWhatsAppWorkflowWritesEnabled,
})

/** Exact reviewed workflow action, canonical records, receipt and reply intent share one transaction. */
export async function processAssistantWhatsAppWorkflowAction(
  context: GeneralContext | WorkflowReceiptContext,
  lease: WhatsAppInboxLease,
  deps = defaultChannelWorkflowActionDependencies(),
): Promise<
  { status: "completed"; outboxId: string } | { status: "cancelled" }
> {
  if (isReceiptContext(context)) {
    if (
      !sameLease(context.inboxLease, lease) ||
      context.principal.bindingId !== lease.bindingId
    )
      throw new AssistantWhatsAppError("UNAUTHORIZED")
  } else if (
    !deps.linked(context.session) ||
    context.session.principal.bindingId !== lease.bindingId ||
    !sameLease(context.session.inboxLease, lease)
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const transact = <T>(work: (scope: ActionTransaction) => Promise<T>) => {
    if (isReceiptContext(context)) return deps.receiptTransaction(context, work)
    return deps.transaction(context, async (fresh) => {
      if (!deps.linked(fresh.session))
        throw new AssistantWhatsAppError("UNAUTHORIZED")
      return work({
        db: fresh.db,
        principal: fresh.session.principal,
        resolved: await deps.resolve(fresh.db, fresh.session.principal),
        fresh,
      })
    })
  }
  const execute = (refusal = false) =>
    transact(async ({ db, principal, resolved, fresh }) => {
      const inbox = await deps.lease(db, lease)
      if (
        inbox.kind !== "ACTION" ||
        inbox.bindingId !== principal.bindingId ||
        inbox.identityId
      )
        throw new AssistantWhatsAppError("UNAUTHORIZED")
      const authorityDigest = await deps.authority(db, resolved)
      const parsed = whatsAppWorkflowActionIngressContentSchema.safeParse(
        inbox.content,
      )
      const enabled = parsed.success && deps.writesEnabled(parsed.data.purpose)
      const malformed =
        !parsed.success || parsed.data.purpose !== resolved.conversation.purpose
      let body =
        !refusal && !malformed && !enabled
          ? WHATSAPP_WORKFLOW_ACTION_DISABLED_REPLY
          : WHATSAPP_WORKFLOW_ACTION_INVALID_REPLY
      let resultContent: ReturnType<
        typeof whatsAppWorkflowActionResultContentSchema.parse
      > = {
        type: "workflow_action_refusal",
        reason: !refusal && !malformed && !enabled ? "disabled" : "invalid",
      }
      if (!refusal && !malformed && parsed.success && enabled) {
        const consumed = await deps.consume(db, {
          principal,
          purpose: parsed.data.purpose,
          decisionDigest: parsed.data.decisionDigest,
          decision: parsed.data.decision,
          quotedProviderMessageId: parsed.data.replyToMessageId,
          ingressId: inbox.id,
          projectCommand: deps.projectCommand,
        })
        let resultRef: WhatsAppWorkflowActionResult
        if (consumed.alreadyConsumed)
          resultRef = whatsAppWorkflowActionResultSchema.parse(
            consumed.resultRef,
          )
        else {
          // A receipt-only context cannot acquire authority for a new domain command.
          if (!fresh) throw new AssistantWhatsAppError("UNAUTHORIZED")
          if (parsed.data.decision === "cancel")
            resultRef = whatsAppWorkflowActionResultSchema.parse({
              version: "workflow-result-v1",
              purpose: consumed.source.purpose,
              conversationId: consumed.source.conversationId,
              draftId: consumed.source.draftId,
              results: consumed.source.selection.map((selected) => ({
                entityId: selected.entityId,
                key: selected.key,
                state: "CANCELLED",
              })),
            })
          else {
            const saved = await deps.execute(fresh, consumed.source)
            resultRef = whatsAppWorkflowActionResultSchema.parse({
              version: "workflow-result-v1",
              purpose: saved.purpose,
              conversationId: saved.conversationId,
              draftId: saved.draftId,
              results: saved.records.map((record) => ({
                entityId: record.entityId,
                key: record.key,
                state: "COMMITTED",
                recordId: record.recordId,
                kind: record.kind,
                name: record.name,
              })),
            })
          }
          await deps.complete(db, {
            principal,
            reviewId: consumed.reviewId,
            ingressId: inbox.id,
            resultRef,
          })
        }
        body = renderWhatsAppWorkflowActionResult(consumed.source, resultRef, {
          trustedAppOrigin: appOrigin(),
          currentScope: {
            tenantId: resolved.scope.tenantId,
            storeId: resolved.scope.storeId,
          },
        })
        resultContent = {
          type: "workflow_action_result",
          reviewId: consumed.reviewId,
          resultRef,
        }
      }
      const outbox = await db.assistantWhatsAppOutbox.create({
        data: {
          inboxId: inbox.id,
          phoneNumberId: inbox.phoneNumberId,
          chunkIndex: 0,
          chunkCount: 1,
          rendererVersion: WHATSAPP_WORKFLOW_ACTION_RESULT_VERSION,
          renderKind: "workflow_action_result",
          authorityDigest,
          content: body,
          contentDigest: bodyDigest(body),
          expiresAt: inbox.expiresAt,
        },
        select: { id: true },
      })
      await db.assistantWhatsAppInbox.update({
        where: { id: inbox.id },
        data: {
          state: "COMPLETED",
          content: resultContent,
          completedAt: new Date(),
          executionAuthorityDigest: authorityDigest,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt: null,
          errorCode: null,
        },
      })
      return { status: "completed" as const, outboxId: outbox.id }
    })
  try {
    return await execute()
  } catch (error) {
    if (
      !(error instanceof AssistantWhatsAppError) &&
      !(error instanceof TRPCError) &&
      !(error instanceof WorkflowTurnError) &&
      !(error instanceof AssistantRecordError) &&
      !(error instanceof CatalogError) &&
      !(error instanceof CustomerDirectoryError) &&
      !(error instanceof FinanceError)
    )
      throw error
    // Known domain refusals rolled back proof, selected records and reply together.
    try {
      return await execute(true)
    } catch (refusalError) {
      if (
        refusalError instanceof AssistantWhatsAppError ||
        refusalError instanceof TRPCError ||
        refusalError instanceof WorkflowTurnError ||
        refusalError instanceof AssistantRecordError
      )
        return { status: "cancelled" }
      throw refusalError
    }
  }
}
