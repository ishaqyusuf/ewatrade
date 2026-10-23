import {
  WHATSAPP_REPLY_CHOICE_LIFETIME_MS,
  type WhatsAppReplyChoiceCommand,
  whatsAppReplyChoiceButtons,
  whatsAppReplyChoiceCommandSchema,
  whatsAppSavedReplyChoices,
} from "@ewatrade/assistant/channels/reply-choices"
import type { DbClient } from "../types"
import {
  type WhatsAppConversationPrincipal,
  resolveAssistantWhatsAppConversation,
} from "./conversations"
import { assistantWhatsAppAuthorityDigest } from "./execution"

async function committedChoices(
  db: DbClient,
  input: { messageId: string; conversationId: string; userId: string },
) {
  const run = await db.assistantRun.findFirst({
    where: {
      status: "COMPLETED",
      actorUserId: input.userId,
      conversationId: input.conversationId,
      assistantMessageId: input.messageId,
      assistantMessage: {
        role: "assistant",
        conversationId: input.conversationId,
      },
    },
    select: { assistantMessage: { select: { parts: true } } },
  })
  return whatsAppSavedReplyChoices(run?.assistantMessage?.parts)
}
/** Delivery already checked the current binding/authority; no raw user text is used. */
export async function assistantWhatsAppReplyChoiceButtons(
  db: DbClient,
  input: {
    outboxId: string
    messageId: string
    conversationId: string
    userId: string
  },
) {
  const choices = await committedChoices(db, input)
  return choices ? whatsAppReplyChoiceButtons(input.outboxId, choices) : []
}
/** Returns only an existing saved plain reply; never a principal, tool call or confirmation. */
export async function resolveAssistantWhatsAppReplyChoice(
  db: DbClient,
  principal: WhatsAppConversationPrincipal,
  raw: WhatsAppReplyChoiceCommand,
  now = new Date(),
) {
  const parsed = whatsAppReplyChoiceCommandSchema.safeParse(raw)
  if (!parsed.success) return
  const current = await resolveAssistantWhatsAppConversation(db, principal, now)
  if (current.conversation.purpose !== "GENERAL") return
  const digest = await assistantWhatsAppAuthorityDigest(db, current)
  const command = parsed.data
  const source = await db.assistantWhatsAppOutbox.findFirst({
    where: {
      ...(command.sourceOutboxId ? { id: command.sourceOutboxId } : {}),
      phoneNumberId: principal.phoneNumberId,
      providerMessageId: command.replyToMessageId,
      state: { in: ["SENT", "DELIVERED", "READ"] },
      renderKind: "reply",
      authorityDigest: digest,
      sentAt: {
        gt: new Date(now.getTime() - WHATSAPP_REPLY_CHOICE_LIFETIME_MS),
      },
      expiresAt: { gt: now },
      inbox: {
        bindingId: principal.bindingId,
        kind: "TURN",
        state: "COMPLETED",
      },
      deliveryAttempts: {
        some: {
          state: "ACCEPTED",
          providerMessageId: command.replyToMessageId,
        },
      },
    },
    include: { inbox: { select: { sequence: true } } },
  })
  if (!source?.messageId || source.chunkIndex !== source.chunkCount - 1) return
  const newer = await db.assistantWhatsAppOutbox.findFirst({
    where: {
      inbox: {
        bindingId: principal.bindingId,
        kind: "TURN",
        sequence: { gt: source.inbox.sequence },
      },
      state: { in: ["SENT", "DELIVERED", "READ"] },
    },
    select: { id: true },
  })
  if (newer) return
  const choices = await committedChoices(db, {
    messageId: source.messageId,
    userId: current.scope.userId,
    conversationId: current.conversation.id,
  })
  return choices?.[command.index - 1]?.text
}
