import { createHash } from "node:crypto"
import {
  WHATSAPP_IMPORT_HANDOFF_VERSION,
  WHATSAPP_PHOTO_HOLD_MS,
  WHATSAPP_PHOTO_ORDER_LIST_MAX,
  WHATSAPP_PHOTO_ORDER_LIST_VERSION,
  WHATSAPP_PHOTO_REVIEW_VERSION,
  WHATSAPP_VOICE_REVIEW_VERSION,
  type WhatsAppPhotoChoice,
  type WhatsAppPhotoOfferOrder,
  type WhatsAppPhotoOrder,
  type WhatsAppPhotoOrderPick,
  type WhatsAppVoiceChoice,
  renderWhatsAppPhotoReview,
  renderWhatsAppVoiceReview,
  whatsAppImportHandoffContentSchema,
  whatsAppMediaContentSchema,
  whatsAppPhotoChoiceContentSchema,
  whatsAppPhotoOrderList,
  whatsAppPhotoOrderListFallback,
  whatsAppPhotoOrderOfferContentSchema,
  whatsAppPhotoOrderOfferRows,
  whatsAppPhotoOrderPickContentSchema,
  whatsAppPhotoReviewButtons,
  whatsAppPhotoReviewContentSchema,
  whatsAppVoiceChoiceContentSchema,
  whatsAppVoiceReviewContentSchema,
} from "@ewatrade/assistant/channels/media"
import { renderWhatsAppImportHandoff } from "@ewatrade/assistant/channels/notice"
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

type Resolved = Awaited<ReturnType<typeof resolveAssistantWhatsAppConversation>>
const trustedAppOrigin = () =>
  process.env.DASHBOARD_URL ??
  process.env.NEXT_PUBLIC_DASHBOARD_URL ??
  "https://dash.ewatrade.com"

/** The original media TURN's own canonical attachment id, never a caller pointer alone. */
function sourceAttachmentId(
  resolved: Resolved,
  inbox: { phoneNumberId: string; providerMessageId: string },
  mediaId: string,
) {
  return assistantAttachmentRequestId(
    resolved.scope,
    resolved.conversation.id,
    assistantWhatsAppMediaClientRequestId(
      inbox.phoneNumberId,
      inbox.providerMessageId,
      mediaId,
    ),
  )
}

async function photo(
  db: DbClient,
  resolved: Resolved,
  review: { attachmentId: string; contentDigest?: string },
  now: Date,
) {
  const row = await db.assistantAttachment.findFirst({
    where: {
      id: review.attachmentId,
      conversationId: resolved.conversation.id,
      tenantId: resolved.scope.tenantId,
      storeId: resolved.scope.storeId,
      actorUserId: resolved.scope.userId,
      kind: "IMAGE",
      status: "READY",
      messageId: null,
      retentionUntil: { gt: now },
      ...(review.contentDigest ? { contentDigest: review.contentDigest } : {}),
    },
  })
  if (!row) throw new AssistantWhatsAppError("EXPIRED")
  return row
}

function photoOrder(order: {
  id: string
  orderNumber: string
  customerName: string | null
}): WhatsAppPhotoOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName ?? null,
  }
}

/**
 * Completes the original GENERAL photo TURN without a model: the photo is held
 * unsent for at most 24 hours while the owner picks Attach, Other order or
 * Discard on this exact review message. The caller resolved the visible order.
 */
export async function stageAssistantWhatsAppPhotoReviewInTransaction(
  db: Prisma.TransactionClient,
  input: PrincipalInput & { attachmentId: string; orderId: string },
  now = new Date(),
) {
  const { resolved, inbox, authorityDigest } = await fresh(db, input, now)
  const source = whatsAppMediaContentSchema.safeParse(inbox.content)
  if (
    !source.success ||
    resolved.conversation.purpose !== "GENERAL" ||
    inbox.runId ||
    input.attachmentId !==
      sourceAttachmentId(resolved, inbox, source.data.media.id)
  )
    throw new AssistantWhatsAppError("CONFLICT")
  await db.$queryRaw`SELECT id FROM "AssistantAttachment" WHERE id=${input.attachmentId} FOR UPDATE`
  const attachment = await photo(db, resolved, input, now)
  const order = await db.commercialOrder.findFirst({
    where: { id: input.orderId, tenantId: resolved.scope.tenantId },
    select: { id: true, orderNumber: true, customerName: true },
  })
  const reviewOrder = order && photoOrder(order)
  const body = reviewOrder && renderWhatsAppPhotoReview(reviewOrder)
  if (!reviewOrder || !body) throw new AssistantWhatsAppError("CONFLICT")
  // The photo hold never outlives the original event or the attachment itself.
  const hold = Math.min(
    inbox.expiresAt.getTime(),
    attachment.retentionUntil.getTime(),
    now.getTime() + WHATSAPP_PHOTO_HOLD_MS,
  )
  const expiresAt = new Date(
    Math.min(
      hold,
      resolved.grant.expiresAt.getTime(),
      resolved.grant.idleExpiresAt.getTime(),
    ),
  )
  if (expiresAt <= now) throw new AssistantWhatsAppError("EXPIRED")
  const content = whatsAppPhotoReviewContentSchema.parse({
    type: "photo_review",
    source: source.data,
    review: {
      attachmentId: attachment.id,
      contentDigest: attachment.contentDigest,
      order: reviewOrder,
      retentionUntil: attachment.retentionUntil.toISOString(),
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
      rendererVersion: WHATSAPP_PHOTO_REVIEW_VERSION,
      renderKind: "photo_review",
      authorityDigest,
      content: body,
      contentDigest: digest(body),
      expiresAt,
    },
  })
  // An unchosen photo is removed by the existing retention job after the hold.
  await db.assistantAttachment.update({
    where: { id: attachment.id },
    data: { retentionUntil: new Date(hold) },
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

/**
 * Durable ingress claims one photo choice once. Attach hands the photo to the
 * canonical turn. Other order completes this choice TURN with a list of the
 * caller-resolved visible orders (still holding the photo) when any can be
 * offered, else hands the photo to the canonical turn to ask.
 */
export async function consumeAssistantWhatsAppPhotoReviewInTransaction(
  db: Prisma.TransactionClient,
  input: PrincipalInput & {
    choice: WhatsAppPhotoChoice
    offerOrderIds?: readonly string[]
  },
  now = new Date(),
): Promise<
  | { state: "discarded" }
  | { state: "offered"; outboxId: string }
  | {
      state: "attach" | "other"
      attachmentId: string
      order: WhatsAppPhotoOrder
    }
> {
  const { resolved, inbox, authorityDigest } = await fresh(db, input, now)
  const chosen = whatsAppPhotoChoiceContentSchema.safeParse(inbox.content)
  if (
    !chosen.success ||
    resolved.conversation.purpose !== "GENERAL" ||
    chosen.data.choice.decision !== input.choice.decision ||
    chosen.data.choice.replyToMessageId !== input.choice.replyToMessageId
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const choice = chosen.data.choice
  const outbox = await db.assistantWhatsAppOutbox.findFirst({
    where: {
      phoneNumberId: input.principal.phoneNumberId,
      providerMessageId: choice.replyToMessageId,
      state: { in: ["SENT", "DELIVERED", "READ"] },
      renderKind: "photo_review",
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
  const parsed = whatsAppPhotoReviewContentSchema.safeParse(original.content)
  if (!parsed.success) throw new AssistantWhatsAppError("UNAUTHORIZED")
  const review = parsed.data.review
  if (
    original.expiresAt <= now ||
    new Date(review.expiresAt) <= now ||
    outbox.expiresAt <= now
  )
    throw new AssistantWhatsAppError("EXPIRED")
  if (
    outbox.rendererVersion !== WHATSAPP_PHOTO_REVIEW_VERSION ||
    outbox.chunkCount !== 1 ||
    outbox.chunkIndex !== 0 ||
    outbox.runId ||
    outbox.messageId ||
    original.runId ||
    original.executionAuthorityDigest !== authorityDigest ||
    outbox.authorityDigest !== authorityDigest ||
    review.authorityDigest !== authorityDigest ||
    !outbox.content ||
    outbox.content !== renderWhatsAppPhotoReview(review.order) ||
    outbox.contentDigest !== digest(outbox.content)
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  if (review.consumedBy && review.consumedBy !== inbox.id)
    throw new AssistantWhatsAppError("EXPIRED")
  if (review.consumedBy && review.decision !== choice.decision)
    throw new AssistantWhatsAppError("CONFLICT")
  if (review.consumedBy === inbox.id && choice.decision === "discard")
    return { state: "discarded" }
  await db.$queryRaw`SELECT id FROM "AssistantAttachment" WHERE id=${review.attachmentId} FOR UPDATE`
  const attachment = await photo(db, resolved, review, now)
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
  if (choice.decision === "discard") {
    // The retention job deletes the unsent row and its bytes; nothing reaches the chat.
    await db.assistantAttachment.update({
      where: { id: attachment.id },
      data: {
        status: "FAILED",
        errorCode: "PHOTO_DISCARDED",
        retentionUntil: new Date(now.getTime() - 1),
        extraction: Prisma.DbNull,
      },
    })
    return { state: "discarded" }
  }
  if (choice.decision === "other" && input.offerOrderIds?.length) {
    const offered = await offerPhotoOrders(db, {
      resolved,
      inbox,
      authorityDigest,
      choice,
      sourceInboxId: original.id,
      review: { ...review, attachmentId: attachment.id },
      orderIds: input.offerOrderIds,
      now,
    })
    if (offered) return offered
  }
  // Kept: the photo returns to the canonical attachment retention.
  const retained = new Date(review.retentionUntil)
  if (retained > attachment.retentionUntil)
    await db.assistantAttachment.update({
      where: { id: attachment.id },
      data: { retentionUntil: retained },
    })
  return {
    state: choice.decision,
    attachmentId: attachment.id,
    order: review.order,
  }
}

/** Saves the offer on the choice TURN and its one list outbox; the photo stays held. */
async function offerPhotoOrders(
  db: Prisma.TransactionClient,
  input: {
    resolved: Resolved
    inbox: Awaited<ReturnType<typeof fresh>>["inbox"]
    authorityDigest: string
    choice: WhatsAppPhotoChoice
    sourceInboxId: string
    review: {
      attachmentId: string
      contentDigest: string
      retentionUntil: string
      expiresAt: string
    }
    orderIds: readonly string[]
    now: Date
  },
) {
  const { resolved, inbox, now } = input
  const ids = [...new Set(input.orderIds)].slice(
    0,
    WHATSAPP_PHOTO_ORDER_LIST_MAX,
  )
  const found = await db.commercialOrder.findMany({
    where: {
      id: { in: ids },
      tenantId: resolved.scope.tenantId,
      storeId: resolved.scope.storeId,
    },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      totalMinor: true,
      currencyCode: true,
    },
  })
  const byId = new Map(found.map((order) => [order.id, order]))
  const candidates: WhatsAppPhotoOfferOrder[] = []
  for (const id of ids) {
    const order = byId.get(id)
    if (order && order.totalMinor >= 0 && /^[A-Z]{3}$/.test(order.currencyCode))
      candidates.push({
        ...photoOrder(order),
        totalMinor: order.totalMinor,
        currencyCode: order.currencyCode,
      })
  }
  const orders = whatsAppPhotoOrderOfferRows(candidates).map((row) => row.order)
  if (
    !orders.length ||
    !whatsAppPhotoOrderList(orders) ||
    (await db.assistantWhatsAppOutbox.count({ where: { inboxId: inbox.id } }))
  )
    return null
  const expiresAt = new Date(
    Math.min(
      new Date(input.review.expiresAt).getTime(),
      inbox.expiresAt.getTime(),
      resolved.grant.expiresAt.getTime(),
      resolved.grant.idleExpiresAt.getTime(),
    ),
  )
  if (expiresAt <= now) throw new AssistantWhatsAppError("EXPIRED")
  const content = whatsAppPhotoOrderOfferContentSchema.parse({
    type: "photo_order_offer",
    choice: input.choice,
    offer: {
      sourceInboxId: input.sourceInboxId,
      attachmentId: input.review.attachmentId,
      contentDigest: input.review.contentDigest,
      orders,
      retentionUntil: input.review.retentionUntil,
      authorityDigest: input.authorityDigest,
      expiresAt: expiresAt.toISOString(),
    },
  })
  const body = whatsAppPhotoOrderListFallback(orders)
  const outbox = await db.assistantWhatsAppOutbox.create({
    data: {
      inboxId: inbox.id,
      phoneNumberId: inbox.phoneNumberId,
      responseRevision: 1,
      chunkIndex: 0,
      chunkCount: 1,
      rendererVersion: WHATSAPP_PHOTO_ORDER_LIST_VERSION,
      renderKind: "photo_order_list",
      authorityDigest: input.authorityDigest,
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
  return { state: "offered" as const, outboxId: outbox.id }
}

/**
 * Durable ingress claims one row of a sent order list once. The row resolves
 * only against the offer saved on that exact list message; the still-held
 * photo then goes to the canonical turn like Attach (or, for Not listed, like
 * the previous Other order question).
 */
export async function consumeAssistantWhatsAppPhotoOrderPickInTransaction(
  db: Prisma.TransactionClient,
  input: PrincipalInput & { pick: WhatsAppPhotoOrderPick },
  now = new Date(),
): Promise<
  | { state: "attach"; attachmentId: string; order: WhatsAppPhotoOrder }
  | { state: "other"; attachmentId: string }
> {
  const { resolved, inbox, authorityDigest } = await fresh(db, input, now)
  const chosen = whatsAppPhotoOrderPickContentSchema.safeParse(inbox.content)
  if (
    !chosen.success ||
    resolved.conversation.purpose !== "GENERAL" ||
    chosen.data.choice.row !== input.pick.row ||
    chosen.data.choice.replyToMessageId !== input.pick.replyToMessageId
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const pick = chosen.data.choice
  const outbox = await db.assistantWhatsAppOutbox.findFirst({
    where: {
      phoneNumberId: input.principal.phoneNumberId,
      providerMessageId: pick.replyToMessageId,
      state: { in: ["SENT", "DELIVERED", "READ"] },
      renderKind: "photo_order_list",
      deliveryAttempts: {
        some: { state: "ACCEPTED", providerMessageId: pick.replyToMessageId },
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
  const listed = await db.assistantWhatsAppInbox.findUniqueOrThrow({
    where: { id: outbox.inboxId },
  })
  const parsed = whatsAppPhotoOrderOfferContentSchema.safeParse(listed.content)
  if (!parsed.success) throw new AssistantWhatsAppError("UNAUTHORIZED")
  const offer = parsed.data.offer
  if (
    listed.expiresAt <= now ||
    new Date(offer.expiresAt) <= now ||
    outbox.expiresAt <= now
  )
    throw new AssistantWhatsAppError("EXPIRED")
  const body = whatsAppPhotoOrderListFallback(offer.orders)
  if (
    outbox.rendererVersion !== WHATSAPP_PHOTO_ORDER_LIST_VERSION ||
    outbox.chunkCount !== 1 ||
    outbox.chunkIndex !== 0 ||
    outbox.runId ||
    outbox.messageId ||
    listed.runId ||
    listed.executionAuthorityDigest !== authorityDigest ||
    outbox.authorityDigest !== authorityDigest ||
    offer.authorityDigest !== authorityDigest ||
    outbox.content !== body ||
    outbox.contentDigest !== digest(body)
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  if (offer.consumedBy && offer.consumedBy !== inbox.id)
    throw new AssistantWhatsAppError("EXPIRED")
  if (offer.consumedBy && offer.picked !== pick.row)
    throw new AssistantWhatsAppError("CONFLICT")
  const order = pick.row === "none" ? null : offer.orders[pick.row - 1]
  if (pick.row !== "none" && !order)
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  await db.$queryRaw`SELECT id FROM "AssistantAttachment" WHERE id=${offer.attachmentId} FOR UPDATE`
  const attachment = await photo(db, resolved, offer, now)
  if (!offer.consumedBy)
    await db.assistantWhatsAppInbox.update({
      where: { id: listed.id },
      data: {
        content: {
          ...parsed.data,
          offer: { ...offer, consumedBy: inbox.id, picked: pick.row },
        },
      },
    })
  // Kept: the photo returns to the canonical attachment retention.
  const retained = new Date(offer.retentionUntil)
  if (retained > attachment.retentionUntil)
    await db.assistantAttachment.update({
      where: { id: attachment.id },
      data: { retentionUntil: retained },
    })
  return order
    ? {
        state: "attach",
        attachmentId: attachment.id,
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
        },
      }
    : { state: "other", attachmentId: attachment.id }
}

/** Completes a GENERAL spreadsheet TURN with the fixed row-count handoff; nothing is stored or imported. */
export async function stageAssistantWhatsAppImportHandoffInTransaction(
  db: Prisma.TransactionClient,
  input: PrincipalInput & { fileName: string; rows: number },
  now = new Date(),
) {
  const { resolved, inbox, authorityDigest } = await fresh(db, input, now)
  const source = whatsAppMediaContentSchema.safeParse(inbox.content)
  const store = resolved.tenantContext.activeStore
  if (
    !source.success ||
    resolved.conversation.purpose !== "GENERAL" ||
    inbox.runId ||
    !store
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const content = whatsAppImportHandoffContentSchema.parse({
    type: "import_handoff",
    source: source.data,
    file: { name: input.fileName, rows: input.rows },
  })
  const body = importHandoffBody(content.file, resolved)
  if (!body) throw new AssistantWhatsAppError("CONFLICT")
  const expiresAt = new Date(
    Math.min(
      inbox.expiresAt.getTime(),
      resolved.grant.expiresAt.getTime(),
      resolved.grant.idleExpiresAt.getTime(),
    ),
  )
  if (expiresAt <= now) throw new AssistantWhatsAppError("EXPIRED")
  if (await db.assistantWhatsAppOutbox.count({ where: { inboxId: inbox.id } }))
    throw new AssistantWhatsAppError("CONFLICT")
  const outbox = await db.assistantWhatsAppOutbox.create({
    data: {
      inboxId: inbox.id,
      phoneNumberId: inbox.phoneNumberId,
      responseRevision: 1,
      chunkIndex: 0,
      chunkCount: 1,
      rendererVersion: WHATSAPP_IMPORT_HANDOFF_VERSION,
      renderKind: "import_handoff",
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

function importHandoffBody(
  file: { name: string; rows: number },
  resolved: Resolved,
) {
  const store = resolved.tenantContext.activeStore
  return store
    ? renderWhatsAppImportHandoff(
        file,
        {
          businessName: resolved.tenantContext.tenant.name,
          storeName: store.name,
          tenantId: resolved.scope.tenantId,
          storeId: resolved.scope.storeId,
          conversationId: resolved.conversation.id,
          purpose: resolved.conversation.purpose,
        },
        trustedAppOrigin(),
      )
    : null
}

/**
 * Fresh dispatch proof for photo reviews and spreadsheet handoffs: the saved
 * body must re-render from the original TURN, and photo buttons only while the
 * held photo is still unsent and unchosen.
 */
export async function validateAssistantWhatsAppMediaPrompt(
  db: DbClient,
  input: { principal: WhatsAppConversationPrincipal; outboxId: string },
  now = new Date(),
): Promise<{
  body: string
  buttons?: Array<{ id: string; title: string }>
  list?: NonNullable<ReturnType<typeof whatsAppPhotoOrderList>>
}> {
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
  if (
    !outbox ||
    resolved.conversation.purpose !== "GENERAL" ||
    outbox.phoneNumberId !== input.principal.phoneNumberId ||
    outbox.inbox.bindingId !== resolved.binding.id ||
    outbox.inbox.kind !== "TURN" ||
    outbox.inbox.runId ||
    outbox.runId ||
    outbox.messageId ||
    outbox.inbox.state !== "COMPLETED" ||
    outbox.chunkCount !== 1 ||
    outbox.chunkIndex !== 0 ||
    outbox.expiresAt <= now ||
    outbox.inbox.expiresAt <= now ||
    outbox.inbox.executionAuthorityDigest !== outbox.authorityDigest ||
    outbox.authorityDigest !==
      (await assistantWhatsAppAuthorityDigest(db, resolved))
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  if (outbox.renderKind === "import_handoff") {
    const parsed = whatsAppImportHandoffContentSchema.safeParse(
      outbox.inbox.content,
    )
    const body = parsed.success && importHandoffBody(parsed.data.file, resolved)
    if (
      outbox.rendererVersion !== WHATSAPP_IMPORT_HANDOFF_VERSION ||
      !body ||
      body !== outbox.content ||
      digest(body) !== outbox.contentDigest
    )
      throw new AssistantWhatsAppError("CONFLICT")
    return { body }
  }
  if (outbox.renderKind === "photo_order_list") {
    const parsed = whatsAppPhotoOrderOfferContentSchema.safeParse(
      outbox.inbox.content,
    )
    if (
      outbox.rendererVersion !== WHATSAPP_PHOTO_ORDER_LIST_VERSION ||
      !parsed.success ||
      new Date(parsed.data.offer.expiresAt) <= now ||
      parsed.data.offer.consumedBy ||
      parsed.data.offer.authorityDigest !== outbox.authorityDigest
    )
      throw new AssistantWhatsAppError("UNAUTHORIZED")
    await photo(db, resolved, parsed.data.offer, now)
    const body = whatsAppPhotoOrderListFallback(parsed.data.offer.orders)
    const list = whatsAppPhotoOrderList(
      parsed.data.offer.orders,
      resolved.tenantContext.activeStore?.name,
    )
    if (
      !list ||
      body !== outbox.content ||
      digest(body) !== outbox.contentDigest
    )
      throw new AssistantWhatsAppError("CONFLICT")
    return { body, list }
  }
  const parsed = whatsAppPhotoReviewContentSchema.safeParse(
    outbox.inbox.content,
  )
  if (
    outbox.renderKind !== "photo_review" ||
    outbox.rendererVersion !== WHATSAPP_PHOTO_REVIEW_VERSION ||
    !parsed.success ||
    new Date(parsed.data.review.expiresAt) <= now ||
    parsed.data.review.consumedBy ||
    parsed.data.review.authorityDigest !== outbox.authorityDigest
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  await photo(db, resolved, parsed.data.review, now)
  const body = renderWhatsAppPhotoReview(parsed.data.review.order)
  if (!body || body !== outbox.content || digest(body) !== outbox.contentDigest)
    throw new AssistantWhatsAppError("CONFLICT")
  return { body, buttons: whatsAppPhotoReviewButtons(parsed.data.review.order) }
}
