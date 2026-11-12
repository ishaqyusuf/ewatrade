import {
  WHATSAPP_REPLY_CHOICE_LIFETIME_MS,
  whatsAppSavedReplyChoices,
} from "@ewatrade/assistant/channels/reply-choices"
import type { DbClient } from "../types"
import {
  AssistantTelegramError,
  type TelegramInboxLease,
  assistantTelegramAuthorityDigest,
  isTelegramId,
  resolveAssistantTelegramConversation,
  telegramInboxLeaseWhere,
  telegramPrincipal,
} from "./authority"

/**
 * A `ch:N` tap on a Telegram answer (Workshop telegram-system 02, l-ambig). The tap
 * names only a position; the text comes from the saved answer that this binding sent
 * as that exact Telegram message, under unchanged authority, within ten minutes and
 * before any newer message. It is plain user input, never a confirmation.
 */
export async function resolveAssistantTelegramReplyChoice(
  db: DbClient,
  lease: TelegramInboxLease,
  input: { providerMessageId: string; index: number },
  now = new Date(),
) {
  if (
    !isTelegramId(input.providerMessageId) ||
    !Number.isInteger(input.index) ||
    input.index < 1 ||
    input.index > 3
  )
    return null
  const inbox = await db.assistantTelegramInbox.findFirst({
    where: telegramInboxLeaseWhere(lease, now),
    include: { binding: { include: { identity: true } } },
  })
  if (!inbox) return null
  let resolved: Awaited<ReturnType<typeof resolveAssistantTelegramConversation>>
  try {
    resolved = await resolveAssistantTelegramConversation(
      db,
      telegramPrincipal(inbox.binding),
      lease,
      now,
    )
  } catch (error) {
    if (error instanceof AssistantTelegramError) return null
    throw error
  }
  const source = await db.assistantTelegramOutbox.findFirst({
    where: {
      providerMessageId: input.providerMessageId,
      state: "SENT",
      messageId: { not: null },
      completedAt: {
        gt: new Date(now.getTime() - WHATSAPP_REPLY_CHOICE_LIFETIME_MS),
      },
      inbox: { bindingId: lease.bindingId },
    },
    orderBy: { completedAt: "desc" },
    include: { inbox: { select: { sequence: true } } },
  })
  if (
    !source?.messageId ||
    source.authorityDigest !==
      (await assistantTelegramAuthorityDigest(db, resolved))
  )
    return null
  // Any later message in this chat (including the edit after a first pick) spends the choices.
  const newer = await db.assistantTelegramOutbox.findFirst({
    where: {
      state: "SENT",
      OR: [
        {
          inbox: {
            bindingId: lease.bindingId,
            sequence: { gt: source.inbox.sequence },
          },
        },
        { inboxId: source.inboxId, sequence: { gt: source.sequence } },
      ],
    },
    select: { id: true },
  })
  if (newer) return null
  const run = await db.assistantRun.findFirst({
    where: {
      status: "COMPLETED",
      actorUserId: resolved.scope.userId,
      conversationId: resolved.conversation.id,
      assistantMessageId: source.messageId,
      assistantMessage: {
        role: "assistant",
        conversationId: resolved.conversation.id,
      },
    },
    select: { assistantMessage: { select: { parts: true } } },
  })
  const parts = run?.assistantMessage?.parts
  const choice = whatsAppSavedReplyChoices(parts)?.[input.index - 1]
  return choice
    ? {
        text: choice.text,
        title: choice.title,
        messageId: source.messageId,
        parts,
      }
    : null
}
