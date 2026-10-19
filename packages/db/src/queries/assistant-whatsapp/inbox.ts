import { createHash, randomUUID } from "node:crypto"
import {
  parseWhatsAppActionButton,
  parseWhatsAppTypedAction,
} from "@ewatrade/assistant/channels/action-review"
import {
  WHATSAPP_INGRESS_CLOCK_SKEW_MS,
  WHATSAPP_INGRESS_RETENTION_MS,
  type WhatsAppIngressInput,
  whatsAppIngressSchema,
} from "@ewatrade/assistant/channels/ingress"
import {
  isWhatsAppVoiceChoiceIntent,
  parseWhatsAppVoiceChoice,
} from "@ewatrade/assistant/channels/media"
import {
  parseWhatsAppTypedWorkflowAction,
  parseWhatsAppWorkflowActionButton,
} from "@ewatrade/assistant/channels/workflow-action-review"
import type { PrismaClient } from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import { assistantWhatsAppActionDecisionDigest } from "./action-reviews"
import { AssistantWhatsAppError } from "./authority"
import { acceptAssistantWhatsAppControlIngress } from "./controls"
import { resolveAssistantWhatsAppConversation } from "./conversations"
import { touchAssistantWhatsAppActivity } from "./grants"
import { stageAssistantWhatsAppQuotaNoticeInTransaction } from "./quota-notice"
import { reserveAssistantWhatsAppTransportInTransaction } from "./usage"
import { assistantWhatsAppWorkflowDecisionDigest } from "./workflow-action-reviews"
import { resolveAssistantWhatsAppWorkflowActionReceiptScope } from "./workflow-terminal"

/** Classify before generic queued text: proofs are digest-only and malformed decisions never reach a model. */
export function assistantWhatsAppIngressActionContent(
  event: Pick<
    WhatsAppIngressInput,
    "type" | "text" | "quickActionId" | "replyToMessageId"
  >,
) {
  if (event.type === "text" && isWhatsAppVoiceChoiceIntent(event.text))
    return null
  const workflow =
    parseWhatsAppWorkflowActionButton(
      event.quickActionId,
      event.replyToMessageId,
    ) ??
    (event.type === "text"
      ? parseWhatsAppTypedWorkflowAction(event.text, event.replyToMessageId)
      : null)
  if (workflow)
    return workflow.kind === "workflow_action"
      ? {
          type: "workflow_action" as const,
          purpose: workflow.purpose,
          decision: workflow.decision,
          decisionDigest: assistantWhatsAppWorkflowDecisionDigest(
            workflow.code,
            workflow.decision,
            workflow.purpose,
          ),
          replyToMessageId: workflow.replyToMessageId,
        }
      : { type: "invalid_workflow_action" as const }
  const command =
    parseWhatsAppActionButton(event.quickActionId, event.replyToMessageId) ??
    (event.type === "text"
      ? parseWhatsAppTypedAction(event.text, event.replyToMessageId)
      : null)
  if (!command) return null
  if (command.kind === "invalid_action")
    return { type: "invalid_action" as const }
  return {
    type: "action" as const,
    decision: command.decision,
    decisionDigest: assistantWhatsAppActionDecisionDigest(
      command.code,
      command.decision,
    ),
    replyToMessageId: command.replyToMessageId,
  }
}

export type WhatsAppInboxReceipt =
  | {
      kind: "quota_notice_accepted"
      id: string
      bindingId: string
      requestId: string
      outboxId: string
    }
  | {
      kind: "control_accepted" | "control_duplicate"
      bindingId: null
      id: string
      identityId: string
      requestId: string
    }
  | {
      kind: "accepted" | "duplicate"
      id: string
      bindingId: string
      requestId: string
    }
  | {
      kind: "ignored"
      reason:
        | "invalid"
        | "unlinked"
        | "unavailable"
        | "stale"
        | "collision"
        | "rate_limited"
    }

/** Commit before acknowledging. Retries keep the original immutable binding and sequence. */
export async function acceptAssistantWhatsAppIngress(
  db: PrismaClient,
  input: unknown,
  permittedUserIds: readonly string[],
  now = new Date(),
): Promise<WhatsAppInboxReceipt> {
  const parsed = whatsAppIngressSchema.safeParse(input)
  if (!parsed.success) return { kind: "ignored", reason: "invalid" }
  const event = parsed.data
  const providerOccurredAt = new Date(Number(event.timestamp) * 1000)
  if (
    !Number.isFinite(providerOccurredAt.getTime()) ||
    providerOccurredAt.getTime() >
      now.getTime() + WHATSAPP_INGRESS_CLOCK_SKEW_MS ||
    providerOccurredAt.getTime() < now.getTime() - WHATSAPP_INGRESS_RETENTION_MS
  )
    return { kind: "ignored", reason: "stale" }
  const control = await acceptAssistantWhatsAppControlIngress(
    db,
    event,
    permittedUserIds,
    now,
  )
  if (control) return control
  const voiceIntent =
    event.type === "text" && isWhatsAppVoiceChoiceIntent(event.text)
  const action = voiceIntent
    ? null
    : assistantWhatsAppIngressActionContent(event)
  const voiceChoice = voiceIntent
    ? parseWhatsAppVoiceChoice(event.text, event.replyToMessageId)
    : null
  const voice = voiceChoice
    ? { type: "voice_choice" as const, choice: voiceChoice }
    : voiceIntent
      ? { type: "invalid_voice_choice" as const }
      : null
  const inboxKind = action ? "ACTION" : "TURN"
  const content = action ??
    voice ?? {
      type: event.type,
      ...(event.text !== undefined ? { text: event.text } : {}),
      // Opaque review/selection proofs must never be recoverable from queued content.
      ...(event.quickActionId
        ? {
            quickActionDigest: createHash("sha256")
              .update(`assistant-whatsapp-action:v1:${event.quickActionId}`)
              .digest("hex"),
          }
        : {}),
      ...(event.replyToMessageId
        ? { replyToMessageId: event.replyToMessageId }
        : {}),
      ...(event.media ? { media: event.media } : {}),
    }
  const contentDigest = createHash("sha256")
    .update(
      JSON.stringify({
        senderId: event.senderId,
        timestamp: event.timestamp,
        // Only a hash of the action's original source bytes is durable, so altered retries collide.
        content: action ? event : content,
      }),
    )
    .digest("hex")
  return runInOwnSerializableTransaction(db, async (tx) => {
    // Same lock order as selection/link/revoke; queued content can never move to a new scope.
    await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${event.phoneNumberId} AND "senderId"=${event.senderId} FOR UPDATE`
    const prior = await tx.assistantWhatsAppInbox.findUnique({
      where: {
        phoneNumberId_providerMessageId: {
          phoneNumberId: event.phoneNumberId,
          providerMessageId: event.providerMessageId,
        },
      },
      include: {
        binding: { include: { identity: { select: { senderId: true } } } },
      },
    })
    if (prior)
      return prior.kind === inboxKind &&
        prior.binding &&
        prior.contentDigest === contentDigest &&
        prior.binding.identity.senderId === event.senderId
        ? {
            kind: "duplicate",
            id: prior.id,
            bindingId: prior.binding.id,
            requestId: prior.requestId,
          }
        : { kind: "ignored", reason: "collision" }
    const identity = await tx.assistantWhatsAppIdentity.findUnique({
      where: {
        phoneNumberId_senderId: {
          phoneNumberId: event.phoneNumberId,
          senderId: event.senderId,
        },
      },
    })
    if (
      !identity ||
      identity.revokedAt ||
      !identity.activeBindingId ||
      !permittedUserIds.includes(identity.userId)
    )
      return { kind: "ignored", reason: "unlinked" }
    const binding = await tx.assistantWhatsAppBinding.findFirst({
      where: { id: identity.activeBindingId, identityId: identity.id },
    })
    if (!binding) return { kind: "ignored", reason: "unavailable" }
    const principal = {
      kind: "linked_whatsapp" as const,
      phoneNumberId: event.phoneNumberId,
      senderId: event.senderId,
      identityGeneration: binding.identityGeneration,
      grantId: binding.grantId,
      grantGeneration: binding.grantGeneration,
      bindingId: binding.id,
      selectionGeneration: binding.selectionGeneration,
    }
    let resolved: Awaited<
      ReturnType<typeof resolveAssistantWhatsAppConversation>
    >
    try {
      try {
        resolved = await resolveAssistantWhatsAppConversation(
          tx,
          principal,
          now,
        )
      } catch (error) {
        if (
          !(error instanceof AssistantWhatsAppError) ||
          inboxKind !== "ACTION"
        )
          throw error
        resolved = await resolveAssistantWhatsAppWorkflowActionReceiptScope(
          tx,
          principal,
          content,
          now,
        )
      }
    } catch (error) {
      if (error instanceof AssistantWhatsAppError)
        return { kind: "ignored", reason: "unavailable" }
      throw error
    }
    if (
      providerOccurredAt.getTime() <
      Math.floor(binding.createdAt.getTime() / 1000) * 1000
    )
      return { kind: "ignored", reason: "stale" }
    const usage = await reserveAssistantWhatsAppTransportInTransaction(
      tx,
      resolved.scope,
      "ingress",
      now,
    )
    if (!usage.allowed) {
      try {
        const notice = await stageAssistantWhatsAppQuotaNoticeInTransaction(
          tx,
          {
            principal,
            providerMessageId: event.providerMessageId,
            providerOccurredAt,
          },
          now,
        )
        if (notice) return notice
      } catch (error) {
        // Closed Product receipt-only scope is not authority to create a TURN notice.
        if (!(error instanceof AssistantWhatsAppError)) throw error
      }
      return { kind: "ignored", reason: "rate_limited" }
    }
    await touchAssistantWhatsAppActivity(
      tx,
      resolved.grant,
      principal.identityGeneration,
      now,
    )
    const { inboundSequence } = await tx.assistantWhatsAppBinding.update({
      where: { id: binding.id },
      data: { inboundSequence: { increment: 1 } },
      select: { inboundSequence: true },
    })
    const id = `wa-in_${randomUUID()}`
    const row = await tx.assistantWhatsAppInbox.create({
      data: {
        id,
        kind: inboxKind,
        phoneNumberId: event.phoneNumberId,
        providerMessageId: event.providerMessageId,
        contentDigest,
        bindingId: binding.id,
        sequence: inboundSequence,
        requestId: `${id}-turn`,
        userMessageId: `${id}-message`,
        providerOccurredAt,
        receivedAt: now,
        expiresAt: new Date(
          Math.min(now.getTime(), providerOccurredAt.getTime()) +
            WHATSAPP_INGRESS_RETENTION_MS,
        ),
        content,
      },
    })
    return {
      kind: "accepted",
      id: row.id,
      bindingId: binding.id,
      requestId: row.requestId,
    }
  })
}
