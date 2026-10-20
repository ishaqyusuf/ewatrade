import {
  whatsAppMediaContentSchema,
  whatsAppVoiceReviewContentSchema,
} from "@ewatrade/assistant/channels/media"
import {
  assistantWhatsAppConfigurationValid,
  assistantWhatsAppUserAllowed,
  whatsAppChannelPolicy,
} from "@ewatrade/assistant/channels/policy"
import { whatsAppWorkflowEnabled } from "@ewatrade/assistant/channels/workflow"
import { Prisma } from "../../../generated/prisma/client"
import { assistantAttachmentRequestId } from "../assistant-attachments"
import type { DbClient } from "../types"
import { AssistantWhatsAppError } from "./authority"
import {
  type WhatsAppConversationPrincipal,
  resolveAssistantWhatsAppConversation,
} from "./conversations"
import { assistantWhatsAppAuthorityDigest } from "./execution"
import { assistantWhatsAppMediaClientRequestId } from "./media-source"
import {
  type WhatsAppInboxLease,
  assertAssistantWhatsAppInboxLease,
} from "./processing"

const sourceSelect = {
  id: true,
  kind: true,
  identityId: true,
  phoneNumberId: true,
  providerMessageId: true,
  content: true,
  state: true,
  expiresAt: true,
  executionAuthorityDigest: true,
  binding: {
    select: {
      id: true,
      grantId: true,
      identityGeneration: true,
      grantGeneration: true,
      selectionGeneration: true,
      conversationId: true,
      identity: {
        select: { userId: true, phoneNumberId: true, senderId: true },
      },
      conversation: {
        select: { id: true, ownerUserId: true, tenantId: true, storeId: true },
      },
    },
  },
} satisfies Prisma.AssistantWhatsAppInboxSelect
type Source = Prisma.AssistantWhatsAppInboxGetPayload<{
  select: typeof sourceSelect
}>

/** Resolve only the original verified event and immutable owning scope, never a caller-supplied pointer alone. */
export function assistantWhatsAppMediaSourceReference(row: Source) {
  const binding = row.binding
  if (
    row.kind !== "TURN" ||
    row.identityId ||
    !binding ||
    row.phoneNumberId !== binding.identity.phoneNumberId ||
    binding.conversationId !== binding.conversation.id ||
    binding.identity.userId !== binding.conversation.ownerUserId
  )
    return null
  const raw = whatsAppMediaContentSchema.safeParse(row.content)
  const voice = whatsAppVoiceReviewContentSchema.safeParse(row.content)
  const media = raw.success
    ? raw.data
    : voice.success
      ? voice.data.source
      : null
  if (!media) return null
  const scope = {
    tenantId: binding.conversation.tenantId,
    storeId: binding.conversation.storeId,
    userId: binding.identity.userId,
  }
  const clientRequestId = assistantWhatsAppMediaClientRequestId(
    row.phoneNumberId,
    row.providerMessageId,
    media.media.id,
  )
  const attachmentId = assistantAttachmentRequestId(
    scope,
    binding.conversation.id,
    clientRequestId,
  )
  if (
    (media.attachmentId && media.attachmentId !== attachmentId) ||
    (voice.success && voice.data.review.attachmentId !== attachmentId)
  )
    return null
  return {
    scope,
    conversationId: binding.conversation.id,
    clientRequestId,
    attachmentId,
    media,
  }
}

/** Called only inside the existing canonical intent transaction after fresh linked authorization. */
export async function pinAssistantWhatsAppMediaSourceInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    principal: WhatsAppConversationPrincipal
    lease: WhatsAppInboxLease
    attachmentId: string
  },
  now = new Date(),
) {
  const resolved = await resolveAssistantWhatsAppConversation(
    tx,
    input.principal,
    now,
  )
  await assertAssistantWhatsAppInboxLease(tx, input.lease, now)
  const row = await tx.assistantWhatsAppInbox.findUnique({
    where: { id: input.lease.inboxId },
    select: sourceSelect,
  })
  const reference = row && assistantWhatsAppMediaSourceReference(row)
  if (
    !row ||
    !reference ||
    !whatsAppMediaContentSchema.safeParse(row.content).success ||
    row.binding?.id !== input.lease.bindingId ||
    resolved.binding.id !== input.lease.bindingId ||
    reference.attachmentId !== input.attachmentId ||
    reference.scope.userId !== resolved.scope.userId ||
    reference.scope.tenantId !== resolved.scope.tenantId ||
    reference.scope.storeId !== resolved.scope.storeId ||
    reference.conversationId !== resolved.conversation.id ||
    row.executionAuthorityDigest !==
      (await assistantWhatsAppAuthorityDigest(tx, resolved)) ||
    !(await tx.assistantAttachment.findFirst({
      where: {
        id: reference.attachmentId,
        clientRequestId: reference.clientRequestId,
        actorUserId: reference.scope.userId,
        tenantId: reference.scope.tenantId,
        storeId: reference.scope.storeId,
        conversationId: reference.conversationId,
        messageId: null,
      },
      select: { id: true },
    }))
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  await tx.assistantWhatsAppInbox.update({
    where: { id: row.id },
    data: {
      content: { ...reference.media, attachmentId: reference.attachmentId },
    },
  })
}

/** Before erasing original source metadata, fence only its exact unsent canonical attachment. */
export async function cancelAssistantWhatsAppPendingMediaInTransaction(
  tx: Prisma.TransactionClient,
  inboxIds: readonly string[],
  now = new Date(),
) {
  if (!inboxIds.length) return { cancelled: 0 }
  const rows = await tx.assistantWhatsAppInbox.findMany({
    where: { id: { in: [...inboxIds] }, kind: "TURN", identityId: null },
    select: sourceSelect,
  })
  let cancelled = 0
  for (const row of rows) {
    const reference = assistantWhatsAppMediaSourceReference(row)
    if (!reference) continue
    cancelled += (
      await tx.assistantAttachment.updateMany({
        where: {
          id: reference.attachmentId,
          clientRequestId: reference.clientRequestId,
          actorUserId: reference.scope.userId,
          tenantId: reference.scope.tenantId,
          storeId: reference.scope.storeId,
          conversationId: reference.conversationId,
          messageId: null,
          status: { in: ["PENDING_UPLOAD", "UPLOADED", "PROCESSING", "READY"] },
        },
        data: {
          status: "FAILED",
          errorCode: "WHATSAPP_SOURCE_CANCELLED",
          processingAttempts: { increment: 1 },
          leaseUntil: null,
          transcript: null,
          extraction: Prisma.DbNull,
          retentionUntil: new Date(now.getTime() - 1),
        },
      })
    ).count
  }
  return { cancelled }
}

/** Pending legacy WhatsApp rows without a provable original source fail closed; ordinary app rows are unaffected. */
export async function assertAssistantWhatsAppMediaProcessingSourceActive(
  db: DbClient,
  attachment: {
    id: string
    clientRequestId: string | null
    actorUserId: string
    tenantId: string
    storeId: string
    conversationId: string
  },
  now = new Date(),
) {
  if (!attachment.clientRequestId?.startsWith("whatsapp-media:")) return
  if (
    process.env.ASSISTANT_WHATSAPP_ENABLED !== "true" ||
    !assistantWhatsAppConfigurationValid() ||
    !whatsAppChannelPolicy().media ||
    !assistantWhatsAppUserAllowed(
      attachment.actorUserId,
      (process.env.ASSISTANT_WHATSAPP_PILOT_USER_IDS ?? "")
        .split(",")
        .map((value) => value.trim()),
    )
  )
    throw new AssistantWhatsAppError("UNAVAILABLE")
  const rows = await db.assistantWhatsAppInbox.findMany({
    where: {
      kind: "TURN",
      identityId: null,
      binding: {
        conversationId: attachment.conversationId,
        identity: { userId: attachment.actorUserId },
      },
      OR: [
        { content: { path: ["attachmentId"], equals: attachment.id } },
        {
          content: { path: ["review", "attachmentId"], equals: attachment.id },
        },
      ],
    },
    select: sourceSelect,
    take: 2,
  })
  if (rows.length !== 1) throw new AssistantWhatsAppError("UNAUTHORIZED")
  const row = rows[0]
  const reference = row && assistantWhatsAppMediaSourceReference(row)
  const binding = row?.binding
  if (
    !row ||
    !reference ||
    !binding ||
    row.phoneNumberId !== process.env.WHATSAPP_OTP_PHONE_NUMBER_ID?.trim() ||
    row.expiresAt <= now ||
    !["PENDING", "PROCESSING"].includes(row.state) ||
    reference.media.attachmentId !== attachment.id ||
    reference.attachmentId !== attachment.id ||
    reference.clientRequestId !== attachment.clientRequestId ||
    reference.scope.userId !== attachment.actorUserId ||
    reference.scope.tenantId !== attachment.tenantId ||
    reference.scope.storeId !== attachment.storeId ||
    reference.conversationId !== attachment.conversationId ||
    !row.executionAuthorityDigest
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const resolved = await resolveAssistantWhatsAppConversation(
    db,
    {
      kind: "linked_whatsapp",
      phoneNumberId: row.phoneNumberId,
      senderId: binding.identity.senderId,
      bindingId: binding.id,
      grantId: binding.grantId,
      identityGeneration: binding.identityGeneration,
      grantGeneration: binding.grantGeneration,
      selectionGeneration: binding.selectionGeneration,
    },
    now,
  )
  if (
    resolved.scope.userId !== attachment.actorUserId ||
    resolved.scope.tenantId !== attachment.tenantId ||
    resolved.scope.storeId !== attachment.storeId ||
    resolved.conversation.id !== attachment.conversationId ||
    (resolved.conversation.purpose !== "GENERAL" &&
      !whatsAppWorkflowEnabled(resolved.conversation.purpose)) ||
    row.executionAuthorityDigest !==
      (await assistantWhatsAppAuthorityDigest(db, resolved))
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
}
