import { createHash, randomUUID } from "node:crypto"
import { capabilityManifest } from "@ewatrade/assistant/capabilities/manifest"
import type {
  Capability,
  CapabilityRole,
} from "@ewatrade/assistant/capabilities/types"
import {
  WHATSAPP_ACTION_DISABLED_REPLY,
  WHATSAPP_ACTION_EDIT_RESULT_VERSION,
  WHATSAPP_ACTION_INVALID_REPLY,
  WHATSAPP_ACTION_RESULT_VERSION,
  renderWhatsAppActionEditResult,
  renderWhatsAppActionResult,
  whatsAppActionEditResultContentSchema,
  whatsAppActionResultContentSchema,
  whatsAppEditIntentStateSchema,
} from "@ewatrade/assistant/channels/action-result"
import {
  WHATSAPP_ACTION_REVIEW_VERSION,
  appendWhatsAppActionReviewInstructions,
  whatsAppActionButtonId,
} from "@ewatrade/assistant/channels/action-review"
import {
  WHATSAPP_CONTROL_RENDER_VERSION,
  renderWhatsAppControl,
  whatsAppControlContentSchema,
} from "@ewatrade/assistant/channels/controls"
import { conversationAppLink } from "@ewatrade/assistant/channels/conversation-links"
import {
  WHATSAPP_DELIVERY_LEASE_MS,
  WHATSAPP_DELIVERY_MAX_ATTEMPTS,
  WHATSAPP_DELIVERY_RETRY_MS,
  whatsAppAssistantCallbackSchema,
} from "@ewatrade/assistant/channels/delivery"
import { WHATSAPP_VOICE_REVIEW_VERSION } from "@ewatrade/assistant/channels/media"
import {
  WHATSAPP_NOTICE_VERSION,
  renderWhatsAppNotice,
  whatsAppNoticeContentSchema,
} from "@ewatrade/assistant/channels/notice"
import {
  assistantWhatsAppUserAllowed,
  whatsAppCapabilityEnabled,
} from "@ewatrade/assistant/channels/policy"
import { WHATSAPP_RENDER_VERSION } from "@ewatrade/assistant/channels/render"
import {
  WHATSAPP_WEB_REVIEW_RESULT_VERSION,
  WHATSAPP_WEB_REVIEW_VERSION,
} from "@ewatrade/assistant/channels/review-links"
import { WHATSAPP_WORKFLOW_RENDER_VERSION } from "@ewatrade/assistant/channels/workflow"
import {
  WHATSAPP_WORKFLOW_ACTION_DISABLED_REPLY,
  WHATSAPP_WORKFLOW_ACTION_INVALID_REPLY,
  WHATSAPP_WORKFLOW_ACTION_RESULT_VERSION,
  renderWhatsAppWorkflowActionResult,
  whatsAppWorkflowActionResultContentSchema,
} from "@ewatrade/assistant/channels/workflow-action-result"
import { WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION } from "@ewatrade/assistant/channels/workflow-action-review"
import { generalReceiptSchema } from "@ewatrade/assistant/general/contracts"
import { evaluateQaProviderPolicy } from "@ewatrade/utils/qa-provider-policy"
import type {
  AssistantActionProposal,
  AssistantWhatsAppActionReview,
  AssistantWhatsAppBinding,
  Prisma,
  PrismaClient,
} from "../../../generated/prisma/client"
import {
  isOwnSerializationConflict,
  runInOwnSerializableTransaction,
} from "../own-transaction"
import {
  type WhatsAppActionReviewMaterial,
  assistantWhatsAppActionDecisionDigest,
  assistantWhatsAppActionPayloadDigest,
  deriveAssistantWhatsAppActionReviewCode,
} from "./action-reviews"
import { AssistantWhatsAppError } from "./authority"
import {
  assistantWhatsAppControlRenderOptions,
  resolveAssistantWhatsAppControlAuthority,
} from "./control-authority"
import { resolveAssistantWhatsAppConversation } from "./conversations"
import type { WhatsAppConversationPrincipal } from "./conversations"
import { assistantWhatsAppAuthorityDigest } from "./execution"
import { validateAssistantWhatsAppVoiceReview } from "./media-review"
import { reserveAssistantWhatsAppTransportInTransaction } from "./usage"
import { resolveAssistantWhatsAppWebReviewDispatch } from "./web-review-dispatch"
import { resolveAssistantWhatsAppWebReviewOutcome } from "./web-review-outcome"
import {
  prepareAssistantWhatsAppWorkflowReviewDispatch,
  resolveAssistantWhatsAppWorkflowReceipt,
} from "./workflow-action-reviews"
import { renderAssistantWhatsAppWorkflowReply } from "./workflow-reply"

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
async function resolveDeliveryConversation(
  tx: Prisma.TransactionClient,
  principal: WhatsAppConversationPrincipal,
  row: { renderKind: string; inbox: { content: unknown } },
  now: Date,
) {
  try {
    return await resolveAssistantWhatsAppConversation(tx, principal, now)
  } catch (error) {
    const parsed = whatsAppWorkflowActionResultContentSchema.safeParse(
      row.inbox.content,
    )
    if (
      !(error instanceof AssistantWhatsAppError) ||
      row.renderKind !== "workflow_action_result" ||
      !parsed.success ||
      parsed.data.type !== "workflow_action_result"
    )
      throw error
    return resolveAssistantWhatsAppWorkflowReceipt(
      tx,
      principal,
      parsed.data.reviewId,
      now,
    )
  }
}
const include = {
  actionReview: { include: { proposal: true } },
  workflowReview: true,
  inbox: {
    include: {
      identity: true,
      binding: {
        include: {
          identity: true,
          grant: { select: { membershipId: true, tenantId: true } },
        },
      },
    },
  },
} as const

/** Dispatch memory only: durable review/outbox fields never contain the derived decision codes. */
export function assistantWhatsAppActionReviewDispatch(
  input: {
    body: string
    review: AssistantWhatsAppActionReview
    proposal: Pick<
      AssistantActionProposal,
      | "id"
      | "revision"
      | "action"
      | "payloadHash"
      | "payload"
      | "targetRevision"
      | "status"
      | "expiresAt"
    >
    binding: Pick<
      AssistantWhatsAppBinding,
      "id" | "identityGeneration" | "grantGeneration" | "selectionGeneration"
    >
    authorityDigest: string
    role: string
  },
  now = new Date(),
  environment: Record<string, string | undefined> = process.env,
  manifest: readonly Capability[] = capabilityManifest,
) {
  const { review, proposal, binding, body } = input
  const capability = manifest.find(
    (entry) => entry.mode === "write" && entry.action === proposal.action,
  )
  const signingKey = environment.ASSISTANT_APPROVAL_SIGNING_KEY
  if (
    !capability ||
    !whatsAppCapabilityEnabled(capability, environment) ||
    !capability.policy.roles.includes(input.role as CapabilityRole) ||
    !signingKey ||
    Buffer.byteLength(signingKey) < 32 ||
    review.keyVersion !==
      (environment.ASSISTANT_APPROVAL_SIGNING_KEY_VERSION ?? "v1") ||
    review.state !== "PENDING" ||
    review.expiresAt <= now ||
    proposal.expiresAt <= now ||
    review.expiresAt > proposal.expiresAt ||
    proposal.status !== "PENDING" ||
    review.bindingId !== binding.id ||
    review.identityGeneration !== binding.identityGeneration ||
    review.grantGeneration !== binding.grantGeneration ||
    review.selectionGeneration !== binding.selectionGeneration ||
    review.proposalId !== proposal.id ||
    review.proposalRevision !== proposal.revision ||
    review.payloadHash !== proposal.payloadHash ||
    assistantWhatsAppActionPayloadDigest(proposal.payload) !==
      review.payloadHash ||
    review.targetRevision !== proposal.targetRevision ||
    review.reviewDigest !== hash(body) ||
    review.authorityDigest !== input.authorityDigest
  )
    return
  const material: WhatsAppActionReviewMaterial = {
    bindingId: review.bindingId,
    proposalId: review.proposalId,
    proposalRevision: review.proposalRevision,
    payloadHash: review.payloadHash,
    targetRevision: review.targetRevision,
    reviewDigest: review.reviewDigest,
    authorityDigest: review.authorityDigest,
    identityGeneration: review.identityGeneration,
    grantGeneration: review.grantGeneration,
    selectionGeneration: review.selectionGeneration,
    reviewOutboxId: review.reviewOutboxId,
    nonce: review.nonce,
    keyVersion: review.keyVersion,
    expiresAt: review.expiresAt,
  }
  try {
    const confirmCode = deriveAssistantWhatsAppActionReviewCode(
      material,
      "confirm",
      signingKey,
    )
    const cancelCode = deriveAssistantWhatsAppActionReviewCode(
      material,
      "cancel",
      signingKey,
    )
    if (
      assistantWhatsAppActionDecisionDigest(confirmCode, "confirm") !==
        review.confirmDigest ||
      assistantWhatsAppActionDecisionDigest(cancelCode, "cancel") !==
        review.cancelDigest
    )
      return
    const rendered = appendWhatsAppActionReviewInstructions(
      {
        kind: "review",
        version: WHATSAPP_ACTION_REVIEW_VERSION,
        body,
        source: {
          proposalId: proposal.id,
          revision: proposal.revision,
          payloadHash: proposal.payloadHash,
        },
      },
      {
        confirmCode,
        cancelCode,
      },
    )
    return rendered.kind === "review"
      ? {
          body: rendered.body,
          buttons:
            rendered.body.length <= 1024
              ? [
                  {
                    id: whatsAppActionButtonId(confirmCode, "confirm"),
                    title: "Confirm",
                  },
                  {
                    id: whatsAppActionButtonId(cancelCode, "edit"),
                    title: "Edit",
                  },
                  {
                    id: whatsAppActionButtonId(cancelCode, "cancel"),
                    title: "Cancel",
                  },
                ]
              : undefined,
        }
      : undefined
  } catch {
    return
  }
}
export function assistantWhatsAppActionReviewDispatchBody(
  ...args: Parameters<typeof assistantWhatsAppActionReviewDispatch>
): string | undefined {
  return assistantWhatsAppActionReviewDispatch(...args)?.body
}
const pending = ["PENDING", "SENDING", "UNKNOWN"] as const
export type WhatsAppDeliveryProof = {
  outboxId: string
  attemptId: string
  generation: number
  owner: string
}
type Options = {
  permittedUserIds: readonly string[]
  phoneNumberId: string
  providerMode?: "live" | "test"
}

async function lockDeliveryIdentity(
  tx: Prisma.TransactionClient,
  outboxId: string,
) {
  await tx.$queryRaw`SELECT i.id FROM "AssistantWhatsAppOutbox" o JOIN "AssistantWhatsAppInbox" q ON q.id=o."inboxId" LEFT JOIN "AssistantWhatsAppBinding" b ON b.id=q."bindingId" JOIN "AssistantWhatsAppIdentity" i ON i.id=COALESCE(q."identityId",b."identityId") WHERE o.id=${outboxId} FOR UPDATE OF i`
  // Lock the effect row before unique intent creation; a waiting SERIALIZABLE snapshot must restart.
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppOutbox" WHERE id=${outboxId} FOR UPDATE`
}
/** A committed STARTED intent is the effect boundary. No external HTTP lives in a DB transaction. */
export function beginAssistantWhatsAppDelivery(
  db: PrismaClient,
  outboxId: string,
  options: Options,
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockDeliveryIdentity(tx, outboxId)
    const row = await tx.assistantWhatsAppOutbox.findUnique({
      where: { id: outboxId },
      include,
    })
    if (!row || !pending.includes(row.state as (typeof pending)[number]))
      return { kind: "idle" as const }
    if (row.state === "UNKNOWN") return { kind: "unknown" as const }
    if (row.state === "SENDING") {
      if (row.leaseExpiresAt && row.leaseExpiresAt > now)
        return { kind: "busy" as const }
      await tx.assistantWhatsAppAttempt.updateMany({
        where: { outboxId, state: "STARTED" },
        data: { state: "UNKNOWN", errorCode: "WORKER_INTERRUPTED" },
      })
      await tx.assistantWhatsAppOutbox.update({
        where: { id: outboxId },
        data: {
          state: "UNKNOWN",
          errorCode: "WORKER_INTERRUPTED",
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      })
      return { kind: "unknown" as const }
    }
    const cancel = async (kind: "cancelled" | "expired", errorCode: string) => {
      await tx.assistantWhatsAppOutbox.update({
        where: { id: outboxId },
        data: {
          state: kind === "expired" ? "EXPIRED" : "CANCELLED",
          errorCode,
          content: null,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      })
      return { kind }
    }
    // Use the original accepted provider event, never the job enqueue time or an OTP receipt.
    if (
      row.expiresAt <= now ||
      row.inbox.providerOccurredAt.getTime() + 24 * 60 * 60_000 <= now.getTime()
    )
      return cancel("expired", "MESSAGE_WINDOW_CLOSED")
    if (row.nextAttemptAt && row.nextAttemptAt > now)
      return { kind: "busy" as const }
    let dispatchBefore = Math.min(
      row.expiresAt.getTime(),
      row.inbox.providerOccurredAt.getTime() + 24 * 60 * 60_000,
    )
    const body = row.content
    let providerBody = body
    let providerButtons: { id: string; title: string }[] | undefined
    if (!body || hash(body) !== row.contentDigest)
      return cancel("cancelled", "SAVED_REPLY_CHANGED")
    let identity: NonNullable<typeof row.inbox.identity>
    let usageScope: { userId: string; tenantId: string }
    let association: Prisma.AssistantWhatsAppInboxWhereInput
    try {
      const binding = row.inbox.binding
      let classifications: Array<"QA" | "LIVE">
      if (row.inbox.kind === "CONTROL") {
        if (
          binding ||
          row.inbox.bindingId ||
          !row.inbox.identity ||
          row.runId ||
          row.messageId ||
          row.inbox.runId ||
          row.renderKind !== "control" ||
          row.rendererVersion !== WHATSAPP_CONTROL_RENDER_VERSION
        )
          throw new AssistantWhatsAppError("UNAUTHORIZED")
        identity = row.inbox.identity
        if (identity.controlSequence !== row.inbox.sequence)
          throw new AssistantWhatsAppError("UNAUTHORIZED")
        const content = whatsAppControlContentSchema.safeParse(
          row.inbox.content,
        )
        if (
          !content.success ||
          !content.data.menu ||
          renderWhatsAppControl(
            content.data.menu,
            assistantWhatsAppControlRenderOptions(content.data.menu),
          ) !== body
        )
          return cancel("cancelled", "SAVED_REPLY_CHANGED")
        const authority = await resolveAssistantWhatsAppControlAuthority(
          tx,
          identity,
          content.data.menu,
          now,
        )
        if (row.authorityDigest !== authority.digest)
          throw new AssistantWhatsAppError("UNAUTHORIZED")
        usageScope = authority.quota.scope
        classifications = authority.classifications
        dispatchBefore = Math.min(
          dispatchBefore,
          authority.dispatchBefore.getTime(),
        )
        association = {
          kind: "CONTROL",
          identityId: identity.id,
          bindingId: null,
          sequence: row.inbox.sequence,
        }
      } else {
        if (
          !binding ||
          row.inbox.identityId ||
          row.inbox.identity ||
          !["TURN", "ACTION"].includes(row.inbox.kind)
        )
          throw new AssistantWhatsAppError("UNAUTHORIZED")
        identity = binding.identity
        await tx.$queryRaw`SELECT id FROM "Membership" WHERE id=${binding.grant.membershipId} FOR SHARE`
        const resolved = await resolveDeliveryConversation(
          tx,
          {
            kind: "linked_whatsapp",
            phoneNumberId: identity.phoneNumberId,
            senderId: identity.senderId,
            bindingId: binding.id,
            grantId: binding.grantId,
            identityGeneration: binding.identityGeneration,
            grantGeneration: binding.grantGeneration,
            selectionGeneration: binding.selectionGeneration,
          },
          row,
          now,
        )
        if (
          row.authorityDigest !==
          (await assistantWhatsAppAuthorityDigest(tx, resolved))
        )
          throw new AssistantWhatsAppError("UNAUTHORIZED")
        usageScope = resolved.scope
        classifications = [resolved.tenantContext.tenant.dataClassification]
        dispatchBefore = Math.min(
          dispatchBefore,
          resolved.grant.expiresAt.getTime(),
          resolved.grant.idleExpiresAt.getTime(),
        )
        association = {
          bindingId: binding.id,
          identityId: null,
        }
        if (row.renderKind === "action_edit_result") {
          const parsed = whatsAppActionEditResultContentSchema.safeParse(
            row.inbox.content,
          )
          if (
            row.inbox.kind !== "ACTION" ||
            row.runId ||
            row.messageId ||
            row.inbox.runId ||
            row.actionReview ||
            row.rendererVersion !== WHATSAPP_ACTION_EDIT_RESULT_VERSION ||
            row.chunkCount !== 1 ||
            row.chunkIndex !== 0 ||
            !parsed.success ||
            renderWhatsAppActionEditResult(parsed.data) !== body
          )
            return cancel("cancelled", "SAVED_RESULT_CHANGED")
          if (parsed.data.type === "action_edit_result") {
            const reference = parsed.data
            const intent = await tx.onboardingSession.findFirst({
              where: {
                id: reference.intentId,
                userId: resolved.scope.userId,
                tenantId: resolved.scope.tenantId,
                completed: false,
                expiresAt: { gt: now },
              },
            })
            const state = whatsAppEditIntentStateSchema.safeParse(
              intent?.formData,
            )
            const review = await tx.assistantWhatsAppActionReview.findFirst({
              where: {
                id: reference.reviewId,
                bindingId: binding.id,
                state: "CONSUMED",
                decision: "cancel",
                completedAt: { not: null },
                resultRef: { equals: reference },
              },
            })
            if (
              !intent ||
              !state.success ||
              !review ||
              state.data.bindingId !== binding.id ||
              state.data.proposalId !== reference.proposalId ||
              state.data.revision !== reference.revision ||
              state.data.identityGeneration !== binding.identityGeneration ||
              state.data.grantGeneration !== binding.grantGeneration ||
              state.data.selectionGeneration !== binding.selectionGeneration ||
              state.data.scopeDigest !== row.authorityDigest
            )
              return cancel("cancelled", "EDIT_CHANGED")
            const proposal = await tx.assistantActionProposal.findFirst({
              where: {
                id: reference.proposalId,
                revision: reference.revision,
                status: "PENDING",
                payloadHash: state.data.payloadHash,
                actorUserId: resolved.scope.userId,
                tenantId: resolved.scope.tenantId,
                storeId: resolved.scope.storeId,
                conversationId: resolved.conversation.id,
                expiresAt: { gt: now },
              },
            })
            if (
              !proposal ||
              assistantWhatsAppActionPayloadDigest(proposal.payload) !==
                state.data.payloadHash
            )
              return cancel("cancelled", "EDIT_CHANGED")
            dispatchBefore = Math.min(
              dispatchBefore,
              intent.expiresAt.getTime(),
              proposal.expiresAt.getTime(),
            )
          }
        } else if (row.renderKind === "workflow_action_result") {
          const parsed = whatsAppWorkflowActionResultContentSchema.safeParse(
            row.inbox.content,
          )
          if (
            row.inbox.kind !== "ACTION" ||
            row.runId ||
            row.messageId ||
            row.rendererVersion !== WHATSAPP_WORKFLOW_ACTION_RESULT_VERSION ||
            row.chunkCount !== 1 ||
            row.chunkIndex !== 0 ||
            !parsed.success
          )
            return cancel("cancelled", "SAVED_RESULT_CHANGED")
          if (parsed.data.type === "workflow_action_refusal") {
            if (
              body !==
              (parsed.data.reason === "disabled"
                ? WHATSAPP_WORKFLOW_ACTION_DISABLED_REPLY
                : WHATSAPP_WORKFLOW_ACTION_INVALID_REPLY)
            )
              return cancel("cancelled", "SAVED_RESULT_CHANGED")
          } else {
            const receipt = await resolveAssistantWhatsAppWorkflowReceipt(
              tx,
              {
                kind: "linked_whatsapp",
                phoneNumberId: identity.phoneNumberId,
                senderId: identity.senderId,
                bindingId: binding.id,
                grantId: binding.grantId,
                identityGeneration: binding.identityGeneration,
                grantGeneration: binding.grantGeneration,
                selectionGeneration: binding.selectionGeneration,
              },
              parsed.data.reviewId,
              now,
            )
            if (
              assistantWhatsAppActionPayloadDigest(parsed.data.resultRef) !==
              assistantWhatsAppActionPayloadDigest(receipt.result)
            )
              return cancel("cancelled", "SAVED_RESULT_CHANGED")
            const expected = renderWhatsAppWorkflowActionResult(
              receipt.source,
              receipt.result,
              {
                currentScope: receipt.source.origin,
                trustedAppOrigin:
                  process.env.DASHBOARD_URL ??
                  process.env.NEXT_PUBLIC_DASHBOARD_URL ??
                  "https://dash.ewatrade.com",
              },
            )
            if (expected !== body)
              return cancel("cancelled", "SAVED_RESULT_CHANGED")
          }
        } else if (row.renderKind === "notice") {
          const notice = whatsAppNoticeContentSchema.safeParse(
            row.inbox.content,
          )
          const store = resolved.tenantContext.activeStore
          if (
            row.inbox.kind !== "TURN" ||
            row.runId ||
            row.messageId ||
            row.rendererVersion !== WHATSAPP_NOTICE_VERSION ||
            row.chunkCount !== 1 ||
            row.chunkIndex !== 0 ||
            !notice.success ||
            !store
          )
            return cancel("cancelled", "SAVED_REPLY_CHANGED")
          const expected = renderWhatsAppNotice(
            notice.data.code,
            {
              businessName: resolved.tenantContext.tenant.name,
              storeName: store.name,
              tenantId: resolved.scope.tenantId,
              storeId: resolved.scope.storeId,
              conversationId: resolved.conversation.id,
              purpose: resolved.conversation.purpose,
            },
            process.env.DASHBOARD_URL ??
              process.env.NEXT_PUBLIC_DASHBOARD_URL ??
              "https://dash.ewatrade.com",
          )
          if (expected !== body)
            return cancel("cancelled", "SAVED_REPLY_CHANGED")
        } else if (row.renderKind === "voice_review") {
          if (
            row.inbox.kind !== "TURN" ||
            row.runId ||
            row.messageId ||
            row.rendererVersion !== WHATSAPP_VOICE_REVIEW_VERSION ||
            row.chunkCount !== 1 ||
            row.chunkIndex !== 0
          )
            return cancel("cancelled", "SAVED_REPLY_CHANGED")
          const expected = await validateAssistantWhatsAppVoiceReview(
            tx,
            {
              principal: {
                kind: "linked_whatsapp",
                phoneNumberId: identity.phoneNumberId,
                senderId: identity.senderId,
                bindingId: binding.id,
                grantId: binding.grantId,
                identityGeneration: binding.identityGeneration,
                grantGeneration: binding.grantGeneration,
                selectionGeneration: binding.selectionGeneration,
              },
              outboxId: row.id,
            },
            now,
          )
          if (expected.body !== body)
            return cancel("cancelled", "SAVED_REPLY_CHANGED")
        } else if (row.inbox.kind === "ACTION") {
          if (
            row.runId ||
            row.messageId ||
            row.inbox.runId ||
            row.actionReview ||
            row.chunkCount !== 1 ||
            row.chunkIndex !== 0 ||
            row.renderKind !== "action_result" ||
            row.rendererVersion !== WHATSAPP_ACTION_RESULT_VERSION ||
            resolved.conversation.purpose !== "GENERAL"
          )
            return cancel("cancelled", "SAVED_RESULT_CHANGED")
          const result = whatsAppActionResultContentSchema.safeParse(
            row.inbox.content,
          )
          if (!result.success)
            return cancel("cancelled", "SAVED_RESULT_CHANGED")
          if (result.data.type === "action_refusal") {
            if (
              ![
                WHATSAPP_ACTION_INVALID_REPLY,
                WHATSAPP_ACTION_DISABLED_REPLY,
              ].includes(body)
            )
              return cancel("cancelled", "SAVED_RESULT_CHANGED")
          } else {
            const reference = result.data.resultRef
            const review = await tx.assistantWhatsAppActionReview.findFirst({
              where: {
                bindingId: binding.id,
                proposalId: reference.proposalId,
                proposalRevision: reference.revision,
                decision: reference.decision,
                state: "CONSUMED",
                completedAt: { not: null },
                identityGeneration: binding.identityGeneration,
                grantGeneration: binding.grantGeneration,
                selectionGeneration: binding.selectionGeneration,
                resultRef: { equals: reference },
              },
              include: { proposal: true },
            })
            if (
              !review ||
              review.proposal.status !== reference.status ||
              review.proposal.revision !== reference.revision ||
              review.proposal.conversationId !== resolved.conversation.id ||
              review.proposal.tenantId !== resolved.scope.tenantId ||
              review.proposal.storeId !== resolved.scope.storeId ||
              review.proposal.actorUserId !== resolved.scope.userId ||
              review.proposal.payloadHash !== review.payloadHash ||
              assistantWhatsAppActionPayloadDigest(review.proposal.payload) !==
                review.payloadHash ||
              review.proposal.targetRevision !== review.targetRevision
            )
              return cancel("cancelled", "CANONICAL_RESULT_UNAVAILABLE")
            const receipt =
              reference.status === "COMPLETED"
                ? generalReceiptSchema.safeParse(review.proposal.executedResult)
                : null
            if (reference.status === "COMPLETED" && !receipt?.success)
              return cancel("cancelled", "CANONICAL_RECEIPT_UNAVAILABLE")
            const currentScope = {
              tenantId: resolved.scope.tenantId,
              storeId: resolved.scope.storeId,
            }
            const link = conversationAppLink(
              {
                conversationId: resolved.conversation.id,
                purpose: "GENERAL",
                origin: currentScope,
              },
              {
                trustedAppOrigin:
                  process.env.DASHBOARD_URL ??
                  process.env.NEXT_PUBLIC_DASHBOARD_URL ??
                  "https://dash.ewatrade.com",
                currentScope,
              },
            )
            if (
              renderWhatsAppActionResult(
                {
                  status: reference.status,
                  receipt: receipt?.success ? receipt.data : null,
                },
                link?.href,
              ) !== body
            )
              return cancel("cancelled", "SAVED_RESULT_CHANGED")
          }
        } else {
          const run =
            row.runId && row.messageId
              ? await tx.assistantRun.findFirst({
                  where: {
                    id: row.runId,
                    requestId: row.inbox.requestId,
                    actorUserId: identity.userId,
                    conversationId: binding.conversationId,
                    status: "COMPLETED",
                    assistantMessageId: row.messageId,
                    assistantMessage: {
                      conversationId: binding.conversationId,
                      role: "assistant",
                    },
                  },
                  select: { id: true },
                })
              : null
          if (!run || !row.messageId)
            return cancel("cancelled", "SAVED_REPLY_CHANGED")
          if (row.renderKind === "web_review") {
            if (
              row.rendererVersion !== WHATSAPP_WEB_REVIEW_VERSION ||
              row.chunkCount !== 1 ||
              row.chunkIndex !== 0
            )
              return cancel("cancelled", "SAVED_REVIEW_CHANGED")
            const dispatch = await resolveAssistantWhatsAppWebReviewDispatch(
              tx,
              {
                content: body,
                outboxId: row.id,
                inboxId: row.inbox.id,
                bindingId: binding.id,
                conversationId: resolved.conversation.id,
                actorUserId: resolved.scope.userId,
                tenantId: resolved.scope.tenantId,
                storeId: resolved.scope.storeId,
                scopeLabel: `${resolved.tenantContext.tenant.name} · ${resolved.tenantContext.activeStore?.name ?? "Store"}`,
                messageId: row.messageId,
                trustedAppOrigin:
                  process.env.DASHBOARD_URL ??
                  process.env.NEXT_PUBLIC_DASHBOARD_URL ??
                  "https://dash.ewatrade.com",
                now,
              },
            )
            if (!dispatch) return cancel("cancelled", "WEB_REVIEW_UNAVAILABLE")
            providerBody = dispatch.body
            dispatchBefore = Math.min(dispatchBefore, dispatch.expiresAt)
          } else if (row.renderKind === "web_review_result") {
            if (
              row.rendererVersion !== WHATSAPP_WEB_REVIEW_RESULT_VERSION ||
              row.chunkCount !== 1 ||
              row.chunkIndex !== 0
            )
              return cancel("cancelled", "SAVED_RESULT_CHANGED")
            const outcome = await resolveAssistantWhatsAppWebReviewOutcome(tx, {
              content: body,
              inboxId: row.inbox.id,
              bindingId: binding.id,
              runId: run.id,
              messageId: row.messageId,
              actorUserId: resolved.scope.userId,
              tenantId: resolved.scope.tenantId,
              storeId: resolved.scope.storeId,
              authorityDigest: row.authorityDigest,
              now,
            })
            if (!outcome)
              return cancel("cancelled", "CANONICAL_RESULT_UNAVAILABLE")
            providerBody = outcome.body
          } else if (row.renderKind === "workflow_action_review") {
            if (
              row.rendererVersion !== WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION ||
              row.chunkCount !== 1 ||
              row.chunkIndex !== 0 ||
              !row.workflowReview
            )
              return cancel("cancelled", "SAVED_REVIEW_CHANGED")
            const dispatch =
              await prepareAssistantWhatsAppWorkflowReviewDispatch(
                tx,
                {
                  principal: {
                    kind: "linked_whatsapp",
                    phoneNumberId: identity.phoneNumberId,
                    senderId: identity.senderId,
                    bindingId: binding.id,
                    grantId: binding.grantId,
                    identityGeneration: binding.identityGeneration,
                    grantGeneration: binding.grantGeneration,
                    selectionGeneration: binding.selectionGeneration,
                  },
                  reviewOutboxId: row.id,
                  signingKey: process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
                  keyVersion:
                    process.env.ASSISTANT_APPROVAL_SIGNING_KEY_VERSION ?? "v1",
                },
                now,
              )
            providerBody = dispatch.body
            providerButtons = dispatch.buttons
            dispatchBefore = Math.min(
              dispatchBefore,
              row.workflowReview.expiresAt.getTime(),
            )
          } else if (row.renderKind === "action_review") {
            const review = row.actionReview
            if (
              !review ||
              row.rendererVersion !== WHATSAPP_ACTION_REVIEW_VERSION ||
              row.chunkCount !== 1 ||
              row.chunkIndex !== 0 ||
              review.reviewOutboxId !== row.id ||
              review.proposal.conversationId !== resolved.conversation.id ||
              review.proposal.tenantId !== resolved.scope.tenantId ||
              review.proposal.storeId !== resolved.scope.storeId ||
              review.proposal.actorUserId !== resolved.scope.userId
            )
              return cancel("cancelled", "SAVED_REVIEW_CHANGED")
            const dispatch = assistantWhatsAppActionReviewDispatch(
              {
                body,
                review,
                proposal: review.proposal,
                binding: resolved.binding,
                authorityDigest: row.authorityDigest,
                role: resolved.tenantContext.membership.role,
              },
              now,
            )
            if (!dispatch)
              return cancel("cancelled", "ACTION_REVIEW_UNAVAILABLE")
            providerBody = dispatch.body
            providerButtons = dispatch.buttons
            dispatchBefore = Math.min(
              dispatchBefore,
              review.expiresAt.getTime(),
              review.proposal.expiresAt.getTime(),
            )
          } else if (row.rendererVersion === WHATSAPP_WORKFLOW_RENDER_VERSION) {
            if (
              binding.purpose !== "SETUP" &&
              binding.purpose !== "PRODUCT_CREATE"
            )
              return cancel("cancelled", "SAVED_REPLY_CHANGED")
            const rendered = await renderAssistantWhatsAppWorkflowReply(tx, {
              inboxId: row.inbox.id,
              runId: run.id,
              actorUserId: identity.userId,
              tenantId: resolved.scope.tenantId,
              storeId: resolved.scope.storeId,
              purpose: binding.purpose,
              trustedAppOrigin:
                process.env.DASHBOARD_URL ??
                process.env.NEXT_PUBLIC_DASHBOARD_URL ??
                "https://dash.ewatrade.com",
            })
            if (
              !rendered ||
              rendered.kind !== row.renderKind ||
              rendered.chunks.length !== row.chunkCount ||
              rendered.chunks[row.chunkIndex] !== body
            )
              return cancel("cancelled", "SAVED_REPLY_CHANGED")
          } else if (
            !["whatsapp-reply-v1", WHATSAPP_RENDER_VERSION].includes(
              row.rendererVersion,
            ) ||
            !["reply", "app_review"].includes(row.renderKind)
          )
            return cancel("cancelled", "SAVED_REPLY_CHANGED")
        }
      }
      if (
        row.phoneNumberId !== options.phoneNumberId ||
        identity.phoneNumberId !== options.phoneNumberId ||
        !assistantWhatsAppUserAllowed(
          identity.userId,
          options.permittedUserIds,
        ) ||
        row.inbox.state !== "COMPLETED" ||
        !row.inbox.executionAuthorityDigest ||
        row.authorityDigest !== row.inbox.executionAuthorityDigest
      )
        throw new AssistantWhatsAppError("UNAUTHORIZED")
      if (
        classifications.some(
          (classification) =>
            !evaluateQaProviderPolicy({
              operation: "whatsapp",
              adapter: options.providerMode ?? "live",
              tenantDataClassification: classification,
            }).allowed,
        )
      )
        return cancel("cancelled", "QA_PROVIDER_BLOCKED")
    } catch (error) {
      if (!(error instanceof AssistantWhatsAppError)) throw error
      return cancel("cancelled", "AUTHORITY_CHANGED")
    }
    const earlierChunk = await tx.assistantWhatsAppOutbox.findFirst({
      where: {
        inboxId: row.inboxId,
        responseRevision: row.responseRevision,
        chunkIndex: { lt: row.chunkIndex },
        state: { notIn: ["SENT", "DELIVERED", "READ"] },
      },
      select: { state: true },
    })
    if (earlierChunk)
      return ["FAILED", "CANCELLED", "EXPIRED"].includes(earlierChunk.state)
        ? cancel("cancelled", "PRIOR_CHUNK_NOT_SENT")
        : { kind: "busy" as const }
    const head = await tx.assistantWhatsAppOutbox.findFirst({
      where: { inbox: association, state: { in: [...pending] } },
      orderBy: [{ inbox: { sequence: "asc" } }, { chunkIndex: "asc" }],
      select: { id: true },
    })
    if (head?.id !== outboxId) return { kind: "busy" as const }
    if (row.attempts >= WHATSAPP_DELIVERY_MAX_ATTEMPTS) {
      await tx.assistantWhatsAppOutbox.update({
        where: { id: outboxId },
        data: {
          state: "FAILED",
          failedAt: now,
          errorCode: "ATTEMPTS_EXHAUSTED",
        },
      })
      return { kind: "failed" as const }
    }
    const usage = await reserveAssistantWhatsAppTransportInTransaction(
      tx,
      usageScope,
      "deliveryAttempts",
      now,
    )
    if (!usage.allowed) {
      await tx.assistantWhatsAppOutbox.update({
        where: { id: outboxId },
        data: {
          nextAttemptAt: usage.retryAt,
          errorCode: "DELIVERY_RATE_LIMITED",
        },
      })
      return { kind: "busy" as const }
    }
    const generation = row.leaseGeneration + 1
    const owner = randomUUID()
    const callbackData = `ewa-wa-v1:${randomUUID()}`
    const attempt = await tx.assistantWhatsAppAttempt.create({
      data: {
        outboxId,
        generation,
        owner,
        callbackDigest: hash(callbackData),
        startedAt: now,
      },
    })
    await tx.assistantWhatsAppOutbox.update({
      where: { id: outboxId },
      data: {
        state: "SENDING",
        attempts: { increment: 1 },
        leaseGeneration: generation,
        leaseOwner: owner,
        leaseExpiresAt: new Date(now.getTime() + WHATSAPP_DELIVERY_LEASE_MS),
        nextAttemptAt: null,
        errorCode: null,
      },
    })
    return {
      kind: "started" as const,
      proof: { outboxId, attemptId: attempt.id, owner, generation },
      callbackData,
      body: providerBody ?? body,
      ...(providerButtons ? { buttons: providerButtons } : {}),
      phoneNumberId: row.phoneNumberId,
      senderId: identity.senderId,
      userId: identity.userId,
      dispatchBefore: new Date(dispatchBefore),
    }
  }).catch((error) => {
    // Proven rolled-back admission has no provider effect. Recovery can try it later.
    if (isOwnSerializationConflict(error)) return { kind: "busy" as const }
    throw error
  })
}

/** A late original response may reconcile UNKNOWN, but can never acquire another attempt's authority. */
export function finishAssistantWhatsAppDelivery(
  db: PrismaClient,
  proof: WhatsAppDeliveryProof,
  outcome:
    | { kind: "accepted"; providerMessageId: string }
    | { kind: "rejected" | "unknown" | "cancelled" },
  now = new Date(),
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockDeliveryIdentity(tx, proof.outboxId)
    const row = await tx.assistantWhatsAppOutbox.findUnique({
      where: { id: proof.outboxId },
    })
    const attempt = await tx.assistantWhatsAppAttempt.findFirst({
      where: {
        id: proof.attemptId,
        outboxId: proof.outboxId,
        owner: proof.owner,
        generation: proof.generation,
      },
    })
    if (!row || !attempt || row.leaseGeneration !== proof.generation)
      return null
    if (outcome.kind === "cancelled") {
      if (attempt.state !== "STARTED") return null
      await tx.assistantWhatsAppAttempt.update({
        where: { id: attempt.id },
        data: {
          state: "REJECTED",
          errorCode: "DISABLED_BEFORE_SEND",
          resolvedAt: now,
        },
      })
      await tx.assistantWhatsAppOutbox.update({
        where: { id: row.id },
        data: {
          state: "CANCELLED",
          content: null,
          errorCode: "DISABLED_BEFORE_SEND",
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      })
      return { state: "CANCELLED" as const }
    }
    if (outcome.kind === "accepted") {
      if (!outcome.providerMessageId || outcome.providerMessageId.length > 512)
        throw new AssistantWhatsAppError("CONFLICT")
      if (
        (attempt.providerMessageId &&
          attempt.providerMessageId !== outcome.providerMessageId) ||
        (row.providerMessageId &&
          row.providerMessageId !== outcome.providerMessageId)
      )
        throw new AssistantWhatsAppError("CONFLICT")
      await tx.assistantWhatsAppAttempt.update({
        where: { id: attempt.id },
        data: {
          state: "ACCEPTED",
          providerMessageId: outcome.providerMessageId,
          resolvedAt: now,
          errorCode: null,
        },
      })
      await tx.assistantWhatsAppOutbox.update({
        where: { id: row.id },
        data: {
          providerMessageId: outcome.providerMessageId,
          sentAt: row.sentAt ?? now,
          state: ["DELIVERED", "READ", "FAILED"].includes(row.state)
            ? row.state
            : "SENT",
          errorCode: row.state === "FAILED" ? row.errorCode : null,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      })
    } else if (
      attempt.state !== "ACCEPTED" &&
      !["SENT", "DELIVERED", "READ", "FAILED"].includes(row.state)
    ) {
      const unknown = outcome.kind === "unknown"
      const retry =
        !unknown &&
        row.content !== null &&
        row.attempts < WHATSAPP_DELIVERY_MAX_ATTEMPTS &&
        row.expiresAt > now
      await tx.assistantWhatsAppAttempt.update({
        where: { id: attempt.id },
        data: {
          state: unknown ? "UNKNOWN" : "REJECTED",
          resolvedAt: now,
          errorCode: unknown ? "OUTCOME_UNKNOWN" : "PROVIDER_REJECTED",
        },
      })
      await tx.assistantWhatsAppOutbox.update({
        where: { id: row.id },
        data: {
          state: unknown ? "UNKNOWN" : retry ? "PENDING" : "FAILED",
          failedAt: !unknown && !retry ? now : undefined,
          errorCode: unknown ? "OUTCOME_UNKNOWN" : "PROVIDER_REJECTED",
          nextAttemptAt: retry
            ? new Date(now.getTime() + WHATSAPP_DELIVERY_RETRY_MS)
            : null,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      })
    }
    return {
      state: (
        await tx.assistantWhatsAppOutbox.findUniqueOrThrow({
          where: { id: row.id },
          select: { state: true },
        })
      ).state,
    }
  })
}

export type AssistantWhatsAppStatus = {
  phoneNumberId: string
  messageId: string
  callbackData?: string
  recipientId?: string
  status: "sent" | "delivered" | "read" | "failed"
  timestamp?: string
  failureCode?: string
}
/** Only called after Meta signature verification and platform destination classification. */
export function acceptAssistantWhatsAppStatus(
  db: PrismaClient,
  event: AssistantWhatsAppStatus,
  now = new Date(),
) {
  const occurred =
    event.timestamp && /^\d{1,12}$/.test(event.timestamp)
      ? new Date(Number(event.timestamp) * 1000)
      : null
  if (
    !occurred ||
    !Number.isFinite(occurred.getTime()) ||
    occurred.getTime() > now.getTime() + 300_000 ||
    !event.messageId ||
    event.messageId.length > 512
  )
    return Promise.resolve(null)
  return runInOwnSerializableTransaction(db, async (tx) => {
    const callback = whatsAppAssistantCallbackSchema.safeParse(
      event.callbackData,
    )
    const owned = callback.success
      ? null
      : await tx.assistantWhatsAppOutbox.findUnique({
          where: {
            phoneNumberId_providerMessageId: {
              phoneNumberId: event.phoneNumberId,
              providerMessageId: event.messageId,
            },
          },
          select: { id: true, leaseGeneration: true },
        })
    const known = callback.success
      ? await tx.assistantWhatsAppAttempt.findFirst({
          where: {
            callbackDigest: hash(callback.data),
            outbox: { phoneNumberId: event.phoneNumberId },
          },
          select: { id: true, outboxId: true },
        })
      : owned
        ? await tx.assistantWhatsAppAttempt.findUnique({
            where: {
              outboxId_generation: {
                outboxId: owned.id,
                generation: owned.leaseGeneration,
              },
            },
            select: { id: true, outboxId: true },
          })
        : null
    if (!known) return null // Unmatched platform/OTP receipts are never assistant/customer data.
    await lockDeliveryIdentity(tx, known.outboxId)
    const attempt = await tx.assistantWhatsAppAttempt.findUniqueOrThrow({
      where: { id: known.id },
      include: {
        outbox: {
          include: {
            inbox: {
              include: {
                identity: { select: { senderId: true } },
                binding: {
                  select: { identity: { select: { senderId: true } } },
                },
              },
            },
          },
        },
      },
    })
    const { outbox } = attempt
    const recipient =
      outbox.inbox.kind === "CONTROL" && !outbox.inbox.bindingId
        ? outbox.inbox.identity?.senderId
        : (outbox.inbox.kind === "TURN" || outbox.inbox.kind === "ACTION") &&
            !outbox.inbox.identityId
          ? outbox.inbox.binding?.identity.senderId
          : null
    if (!recipient) return null
    if (
      (callback.success && event.recipientId !== recipient) ||
      (event.recipientId !== undefined && event.recipientId !== recipient)
    )
      return null
    if (
      occurred.getTime() < attempt.startedAt.getTime() - 1000 ||
      (attempt.providerMessageId &&
        attempt.providerMessageId !== event.messageId) ||
      outbox.leaseGeneration !== attempt.generation ||
      (outbox.providerMessageId && outbox.providerMessageId !== event.messageId)
    )
      return null
    const eventDigest = hash(
      JSON.stringify([
        event.phoneNumberId,
        event.messageId,
        event.status,
        occurred.toISOString(),
      ]),
    )
    const existing = await tx.assistantWhatsAppReceipt.findUnique({
      where: { eventDigest },
    })
    if (existing) return null
    await tx.assistantWhatsAppReceipt.create({
      data: {
        attemptId: attempt.id,
        eventDigest,
        status: event.status,
        providerOccurredAt: occurred,
        receivedAt: now,
        failureCode:
          event.failureCode && /^[a-zA-Z0-9_-]{1,80}$/.test(event.failureCode)
            ? event.failureCode
            : null,
      },
    })
    const state =
      event.status === "read" || outbox.state === "READ"
        ? "READ"
        : event.status === "delivered" || outbox.state === "DELIVERED"
          ? "DELIVERED"
          : event.status === "failed" || outbox.state === "FAILED"
            ? "FAILED"
            : "SENT"
    await tx.assistantWhatsAppAttempt.update({
      where: { id: attempt.id },
      data: {
        state: "ACCEPTED",
        providerMessageId: event.messageId,
        resolvedAt: now,
        errorCode: null,
      },
    })
    await tx.assistantWhatsAppOutbox.update({
      where: { id: outbox.id },
      data: {
        state,
        providerMessageId: event.messageId,
        sentAt: outbox.sentAt ?? occurred,
        deliveredAt:
          event.status === "delivered"
            ? (outbox.deliveredAt ?? occurred)
            : outbox.deliveredAt,
        readAt:
          event.status === "read" ? (outbox.readAt ?? occurred) : outbox.readAt,
        failedAt:
          event.status === "failed"
            ? (outbox.failedAt ?? occurred)
            : outbox.failedAt,
        errorCode: state === "FAILED" ? "PROVIDER_DELIVERY_FAILED" : null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    })
    return { outboxId: outbox.id, bindingId: outbox.inbox.bindingId, state }
  })
}
export function listAssistantWhatsAppOutboxRecovery(
  db: PrismaClient,
  now = new Date(),
) {
  // Only each binding's head is eligible. Unknown/blocked chunks must not starve other bindings.
  return db.$queryRaw<{ id: string }[]>`
    SELECT o.id FROM "AssistantWhatsAppOutbox" o JOIN "AssistantWhatsAppInbox" q ON q.id=o."inboxId"
    WHERE ((o.state='PENDING' AND (o."nextAttemptAt" IS NULL OR o."nextAttemptAt"<=${now}))
      OR (o.state='SENDING' AND o."leaseExpiresAt"<=${now}))
    AND NOT EXISTS (
      SELECT 1 FROM "AssistantWhatsAppOutbox" p JOIN "AssistantWhatsAppInbox" previous ON previous.id=p."inboxId"
      WHERE ((previous.kind IN ('TURN','ACTION') AND q.kind IN ('TURN','ACTION') AND previous."bindingId"=q."bindingId") OR (previous.kind='CONTROL' AND q.kind='CONTROL' AND previous.id=q.id)) AND p.state IN ('PENDING','SENDING','UNKNOWN')
      AND (previous.sequence<q.sequence OR (previous.sequence=q.sequence AND p."chunkIndex"<o."chunkIndex"))
    )
    ORDER BY o."createdAt" ASC LIMIT 50
  `
}
export function nextAssistantWhatsAppOutbox(
  db: PrismaClient,
  outboxId: string,
) {
  return db.assistantWhatsAppOutbox
    .findUnique({
      where: { id: outboxId },
      select: {
        inbox: {
          select: {
            kind: true,
            bindingId: true,
            identityId: true,
            identity: { select: { controlSequence: true } },
          },
        },
      },
    })
    .then((row) => (row ? txHead(db, row.inbox) : null))
}
function txHead(
  db: PrismaClient,
  inbox: {
    kind: "TURN" | "CONTROL" | "ACTION"
    bindingId: string | null
    identityId: string | null
    identity: { controlSequence: number } | null
  },
) {
  const association =
    (inbox.kind === "TURN" || inbox.kind === "ACTION") &&
    inbox.bindingId &&
    !inbox.identityId
      ? { bindingId: inbox.bindingId, identityId: null }
      : inbox.kind === "CONTROL" && inbox.identityId && !inbox.bindingId
        ? {
            kind: "CONTROL" as const,
            identityId: inbox.identityId,
            bindingId: null,
            sequence: inbox.identity?.controlSequence,
          }
        : null
  if (!association) return Promise.resolve(null)
  return db.assistantWhatsAppOutbox.findFirst({
    where: { inbox: association, state: { in: [...pending] } },
    orderBy: [{ inbox: { sequence: "asc" } }, { chunkIndex: "asc" }],
    select: { id: true },
  })
}
export function firstAssistantWhatsAppOutboxForIngress(
  db: PrismaClient,
  inboxId: string,
) {
  return db.assistantWhatsAppOutbox.findFirst({
    where: { inboxId },
    orderBy: { chunkIndex: "asc" },
    select: { id: true },
  })
}
