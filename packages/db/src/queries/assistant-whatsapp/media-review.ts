import { createHash } from "node:crypto"
import {
  WHATSAPP_VOICE_REVIEW_VERSION,
  type WhatsAppVoiceChoice,
  renderWhatsAppVoiceReview,
  whatsAppMediaContentSchema,
  whatsAppVoiceChoiceContentSchema,
  whatsAppVoiceReviewContentSchema,
} from "@ewatrade/assistant/channels/media"
import { whatsAppChannelPolicy } from "@ewatrade/assistant/channels/policy"
import { whatsAppWorkflowEnabled } from "@ewatrade/assistant/channels/workflow"
import { Prisma } from "../../../generated/prisma/client"
import { assistantAttachmentRequestId } from "../assistant-attachments"
import type { DbClient } from "../types"
import { AssistantWhatsAppError } from "./authority"
import {
  type WhatsAppConversationPrincipal,
  resolveAssistantWhatsAppConversation,
} from "./conversations"
import {
  assistantWhatsAppAuthorityDigest,
  stampAssistantWhatsAppExecution,
} from "./execution"
import { assistantWhatsAppMediaClientRequestId } from "./media-source"
import {
  type WhatsAppInboxLease,
  assertAssistantWhatsAppInboxLease,
} from "./processing"

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
const VOICE_REVIEW_LIFETIME_MS = 5 * 60_000
type Proof = {
  attachmentId: string
  transcriptDigest: string
  processingGeneration: number
}
type PrincipalInput = {
  principal: WhatsAppConversationPrincipal
  lease: WhatsAppInboxLease
}

export function assistantWhatsAppVoiceAttachmentMatches(
  row: {
    id: string
    contentDigest: string
    transcript: string | null
    processingAttempts: number
    kind: string
    status: string
    messageId: string | null
    retentionUntil: Date
  },
  proof: Proof & { contentDigest?: string },
  now: Date,
) {
  return (
    row.id === proof.attachmentId &&
    row.kind === "AUDIO" &&
    row.status === "READY" &&
    !row.messageId &&
    row.retentionUntil > now &&
    row.processingAttempts === proof.processingGeneration &&
    (!proof.contentDigest || row.contentDigest === proof.contentDigest) &&
    Boolean(row.transcript) &&
    digest(row.transcript ?? "") === proof.transcriptDigest &&
    Boolean(renderWhatsAppVoiceReview(row.transcript ?? ""))
  )
}

async function fresh(
  db: Prisma.TransactionClient,
  input: PrincipalInput,
  now: Date,
) {
  if (!whatsAppChannelPolicy().media)
    throw new AssistantWhatsAppError("UNAVAILABLE")
  await db.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${input.principal.phoneNumberId} AND "senderId"=${input.principal.senderId} FOR UPDATE`
  const resolved = await resolveAssistantWhatsAppConversation(
    db,
    input.principal,
    now,
  )
  const inbox = await assertAssistantWhatsAppInboxLease(db, input.lease, now)
  if (
    resolved.binding.id !== input.lease.bindingId ||
    (resolved.conversation.purpose !== "GENERAL" &&
      !whatsAppWorkflowEnabled(resolved.conversation.purpose)) ||
    inbox.kind !== "TURN"
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const authorityDigest = await stampAssistantWhatsAppExecution(
    db,
    input.lease,
    resolved,
    now,
  )
  return { resolved, inbox, authorityDigest }
}

async function audio(
  db: DbClient,
  resolved: Awaited<ReturnType<typeof resolveAssistantWhatsAppConversation>>,
  proof: Proof,
  now: Date,
) {
  const row = await db.assistantAttachment.findFirst({
    where: {
      id: proof.attachmentId,
      conversationId: resolved.conversation.id,
      tenantId: resolved.scope.tenantId,
      storeId: resolved.scope.storeId,
      actorUserId: resolved.scope.userId,
      kind: "AUDIO",
      status: "READY",
      messageId: null,
      retentionUntil: { gt: now },
      processingAttempts: proof.processingGeneration,
    },
  })
  if (!row || !assistantWhatsAppVoiceAttachmentMatches(row, proof, now))
    throw new AssistantWhatsAppError("CONFLICT")
  return row
}

/** Atomic model-free completion of the original media TURN plus immutable review outbox. */
export async function stageAssistantWhatsAppVoiceReviewInTransaction(
  db: Prisma.TransactionClient,
  input: PrincipalInput & Proof,
  now = new Date(),
) {
  const { resolved, inbox, authorityDigest } = await fresh(db, input, now)
  const source = whatsAppMediaContentSchema.safeParse(inbox.content)
  if (
    !source.success ||
    source.data.media.sourceType !== "audio" ||
    inbox.runId
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const expectedAttachmentId = assistantAttachmentRequestId(
    resolved.scope,
    resolved.conversation.id,
    assistantWhatsAppMediaClientRequestId(
      inbox.phoneNumberId,
      inbox.providerMessageId,
      source.data.media.id,
    ),
  )
  if (input.attachmentId !== expectedAttachmentId)
    throw new AssistantWhatsAppError("CONFLICT")
  await db.$queryRaw`SELECT id FROM "AssistantAttachment" WHERE id=${input.attachmentId} FOR UPDATE`
  const attachment = await audio(db, resolved, input, now)
  const body = renderWhatsAppVoiceReview(attachment.transcript ?? "")
  if (!body) throw new AssistantWhatsAppError("CONFLICT")
  const expiresAt = new Date(
    Math.min(
      inbox.expiresAt.getTime(),
      resolved.grant.expiresAt.getTime(),
      resolved.grant.idleExpiresAt.getTime(),
      now.getTime() + VOICE_REVIEW_LIFETIME_MS,
    ),
  )
  if (expiresAt <= now) throw new AssistantWhatsAppError("EXPIRED")
  const content = whatsAppVoiceReviewContentSchema.parse({
    type: "voice_review",
    source: source.data,
    review: {
      attachmentId: attachment.id,
      contentDigest: attachment.contentDigest,
      transcriptDigest: input.transcriptDigest,
      processingGeneration: input.processingGeneration,
      authorityDigest,
      expiresAt: expiresAt.toISOString(),
    },
  })
  if (await db.assistantWhatsAppOutbox.count({ where: { inboxId: inbox.id } }))
    throw new AssistantWhatsAppError("CONFLICT")
  const outbox = await db.assistantWhatsAppOutbox.create({
    data: {
      inboxId: inbox.id,
      phoneNumberId: inbox.phoneNumberId,
      responseRevision: 1,
      chunkIndex: 0,
      chunkCount: 1,
      rendererVersion: WHATSAPP_VOICE_REVIEW_VERSION,
      renderKind: "voice_review",
      authorityDigest,
      content: body,
      contentDigest: digest(body),
      expiresAt,
    },
  })
  await db.assistantWhatsAppInbox.update({
    where: { id: inbox.id },
    data: {
      content,
      state: "COMPLETED",
      completedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
      errorCode: null,
    },
  })
  return { state: "completed" as const, outboxId: outbox.id }
}

/** Fresh dispatch proof. Delivery retains sole ownership of attempts/provider effects. */
export async function validateAssistantWhatsAppVoiceReview(
  db: DbClient,
  input: { principal: WhatsAppConversationPrincipal; outboxId: string },
  now = new Date(),
) {
  if (!whatsAppChannelPolicy().media)
    throw new AssistantWhatsAppError("UNAVAILABLE")
  const resolved = await resolveAssistantWhatsAppConversation(
    db,
    input.principal,
    now,
  )
  const outbox = await db.assistantWhatsAppOutbox.findFirst({
    where: { id: input.outboxId },
    include: { inbox: true },
  })
  const parsed = whatsAppVoiceReviewContentSchema.safeParse(
    outbox?.inbox.content,
  )
  if (
    !outbox ||
    !parsed.success ||
    (resolved.conversation.purpose !== "GENERAL" &&
      !whatsAppWorkflowEnabled(resolved.conversation.purpose)) ||
    outbox.phoneNumberId !== input.principal.phoneNumberId ||
    outbox.inbox.bindingId !== resolved.binding.id ||
    outbox.inbox.kind !== "TURN" ||
    outbox.inbox.runId ||
    outbox.runId ||
    outbox.messageId ||
    outbox.inbox.state !== "COMPLETED" ||
    outbox.renderKind !== "voice_review" ||
    outbox.rendererVersion !== WHATSAPP_VOICE_REVIEW_VERSION ||
    outbox.chunkCount !== 1 ||
    outbox.chunkIndex !== 0 ||
    outbox.expiresAt <= now ||
    outbox.inbox.expiresAt <= now ||
    new Date(parsed.data.review.expiresAt) <= now ||
    parsed.data.review.consumedBy ||
    parsed.data.review.authorityDigest !== outbox.authorityDigest ||
    outbox.inbox.executionAuthorityDigest !== outbox.authorityDigest ||
    outbox.authorityDigest !==
      (await assistantWhatsAppAuthorityDigest(db, resolved))
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const attachment = await audio(db, resolved, parsed.data.review, now)
  const body = renderWhatsAppVoiceReview(attachment.transcript ?? "")
  if (
    attachment.contentDigest !== parsed.data.review.contentDigest ||
    !body ||
    body !== outbox.content ||
    digest(body) !== outbox.contentDigest
  )
    throw new AssistantWhatsAppError("CONFLICT")
  return { body, attachmentId: attachment.id }
}

/** Durable ingress claims the choice once; only this exact ingress may recover its canonical turn. */
export async function consumeAssistantWhatsAppVoiceReviewInTransaction(
  db: Prisma.TransactionClient,
  input: PrincipalInput & { choice: WhatsAppVoiceChoice },
  now = new Date(),
) {
  const { resolved, inbox, authorityDigest } = await fresh(db, input, now)
  const chosen = whatsAppVoiceChoiceContentSchema.safeParse(inbox.content)
  if (
    !chosen.success ||
    chosen.data.choice.decision !== input.choice.decision ||
    chosen.data.choice.replyToMessageId !== input.choice.replyToMessageId ||
    (chosen.data.choice.decision === "edit" &&
      (input.choice.decision !== "edit" ||
        chosen.data.choice.text !== input.choice.text))
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const choice = chosen.data.choice
  const outbox = await db.assistantWhatsAppOutbox.findFirst({
    where: {
      phoneNumberId: input.principal.phoneNumberId,
      providerMessageId: choice.replyToMessageId,
      state: { in: ["SENT", "DELIVERED", "READ"] },
      renderKind: "voice_review",
      deliveryAttempts: {
        some: { state: "ACCEPTED", providerMessageId: choice.replyToMessageId },
      },
      inbox: {
        bindingId: resolved.binding.id,
        kind: "TURN",
        state: "COMPLETED",
      },
    },
    include: { inbox: true },
  })
  if (!outbox) throw new AssistantWhatsAppError("UNAUTHORIZED")
  await db.$queryRaw`SELECT id FROM "AssistantWhatsAppInbox" WHERE id=${outbox.inboxId} FOR UPDATE`
  const original = await db.assistantWhatsAppInbox.findUniqueOrThrow({
    where: { id: outbox.inboxId },
  })
  const parsed = whatsAppVoiceReviewContentSchema.safeParse(original.content)
  if (
    !parsed.success ||
    original.expiresAt <= now ||
    new Date(parsed.data.review.expiresAt) <= now ||
    outbox.expiresAt <= now ||
    outbox.rendererVersion !== WHATSAPP_VOICE_REVIEW_VERSION ||
    outbox.chunkCount !== 1 ||
    outbox.chunkIndex !== 0 ||
    outbox.runId ||
    outbox.messageId ||
    original.runId ||
    original.executionAuthorityDigest !== authorityDigest ||
    outbox.authorityDigest !== authorityDigest ||
    parsed.data.review.authorityDigest !== authorityDigest
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const review = parsed.data.review
  if (review.consumedBy && review.consumedBy !== inbox.id)
    return { state: "already_consumed" as const }
  if (review.consumedBy && review.decision !== choice.decision)
    throw new AssistantWhatsAppError("CONFLICT")
  if (review.consumedBy === inbox.id && choice.decision === "cancel")
    return { state: "cancelled" as const }
  await db.$queryRaw`SELECT id FROM "AssistantAttachment" WHERE id=${review.attachmentId} FOR UPDATE`
  const attachment = await audio(db, resolved, review, now)
  const body = renderWhatsAppVoiceReview(attachment.transcript ?? "")
  if (
    attachment.contentDigest !== review.contentDigest ||
    body !== outbox.content ||
    digest(body ?? "") !== outbox.contentDigest
  )
    throw new AssistantWhatsAppError("CONFLICT")
  if (!review.consumedBy)
    await db.assistantWhatsAppInbox.update({
      where: { id: original.id },
      data: {
        content: {
          ...parsed.data,
          review: {
            ...review,
            consumedBy: inbox.id,
            decision: choice.decision,
          },
        },
      },
    })
  if (choice.decision === "cancel") {
    // Keep physical-object attribution until the canonical retention worker deletes bytes first.
    await db.assistantAttachment.update({
      where: { id: attachment.id },
      data: {
        status: "FAILED",
        errorCode: "VOICE_CANCELLED",
        retentionUntil: new Date(now.getTime() - 1),
        transcript: null,
        extraction: Prisma.DbNull,
      },
    })
    return { state: "cancelled" as const }
  }
  return {
    state: "ready" as const,
    attachmentId: attachment.id,
    text:
      choice.decision === "edit" ? choice.text : (attachment.transcript ?? ""),
  }
}
