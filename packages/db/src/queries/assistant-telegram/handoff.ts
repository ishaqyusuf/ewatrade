import type { DbClient } from "../types"
import {
  AssistantTelegramError,
  type TelegramSender,
  isTelegramId,
  resolveAssistantTelegramConversation,
  telegramPrincipal,
} from "./authority"

/**
 * Telegram phase 5 (Workshop telegram-system 02, families 11–13): reads for the
 * text-only media reply and for editing the "Review in EwaTrade" message after
 * a decision in EwaTrade. Reads only; no new storage. Every result is checked
 * against the canonical connection authority, and callers treat chat effects
 * as best effort.
 */

const bindingInclude = {
  identity: {
    select: { id: true, botId: true, telegramUserId: true, chatId: true },
  },
} as const

async function resolve(
  db: DbClient,
  binding: Parameters<typeof telegramPrincipal>[0],
  now: Date,
) {
  try {
    return await resolveAssistantTelegramConversation(
      db,
      telegramPrincipal(binding),
      undefined,
      now,
    )
  } catch (error) {
    if (error instanceof AssistantTelegramError) return null
    throw error
  }
}

/** Scope of a connected chat, for the media reply and its EwaTrade chat link. */
export async function readAssistantTelegramChatScope(
  db: DbClient,
  sender: TelegramSender,
  now = new Date(),
) {
  if (
    !isTelegramId(sender.botId) ||
    !isTelegramId(sender.userId) ||
    !isTelegramId(sender.chatId)
  )
    return null
  const identity = await db.assistantTelegramIdentity.findFirst({
    where: {
      botId: sender.botId,
      telegramUserId: sender.userId,
      chatId: sender.chatId,
      revokedAt: null,
    },
    select: { activeBindingId: true },
  })
  if (!identity?.activeBindingId) return null
  const binding = await db.assistantTelegramBinding.findUnique({
    where: { id: identity.activeBindingId },
    include: bindingInclude,
  })
  const resolved = binding && (await resolve(db, binding, now))
  return resolved
    ? { ...resolved.scope, conversationId: resolved.conversation.id }
    : null
}

/** Whether an assistant reply's parts reference exactly this one draft. */
export const referencesTelegramHandoffProposal = (
  parts: unknown,
  proposalId: string,
) => {
  const references = Array.isArray(parts)
    ? parts.filter(
        (part) =>
          typeof part === "object" &&
          part !== null &&
          (part as { type?: unknown }).type ===
            "data-general-proposal-reference",
      )
    : []
  // The runtime sends a review link only for a reply with exactly one draft.
  return (
    references.length === 1 &&
    (references[0] as { data?: { proposalId?: unknown } }).data?.proposalId ===
      proposalId
  )
}

export type AssistantTelegramHandoffMessage = {
  botId: string
  chatId: string
  messageId: string
  outboxId: string
  tenantId: string
  storeId: string
  conversationId: string
}

/**
 * Sent "Review in EwaTrade" messages for a draft, newest first, in chats whose
 * connection still has the draft's exact user, Business and Store. The link
 * message is the run's only reply row that is not an in-chat review.
 */
export async function readAssistantTelegramHandoffMessages(
  db: DbClient,
  input: {
    proposalId: string
    tenantId: string
    actorUserId: string
    /** Leave out the reply being staged now (a new revision of the same draft). */
    exceptMessageId?: string
  },
  now = new Date(),
): Promise<AssistantTelegramHandoffMessage[]> {
  const proposal = await db.assistantActionProposal.findFirst({
    where: {
      id: input.proposalId,
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
    },
    select: {
      conversationId: true,
      tenantId: true,
      storeId: true,
      actorUserId: true,
      createdAt: true,
    },
  })
  if (!proposal) return []
  const binding = await db.assistantTelegramBinding.findFirst({
    where: { conversationId: proposal.conversationId },
    select: { id: true },
  })
  if (!binding) return []
  const messages = await db.assistantMessage.findMany({
    where: {
      conversationId: proposal.conversationId,
      role: "assistant",
      createdAt: { gte: new Date(proposal.createdAt.getTime() - 60_000) },
      ...(input.exceptMessageId ? { id: { not: input.exceptMessageId } } : {}),
    },
    orderBy: { sequence: "desc" },
    take: 20,
    select: { id: true, parts: true },
  })
  const messageIds = messages
    .filter(({ parts }) =>
      referencesTelegramHandoffProposal(parts, input.proposalId),
    )
    .map(({ id }) => id)
  if (!messageIds.length) return []
  const rows = await db.assistantTelegramOutbox.findMany({
    where: {
      messageId: { in: messageIds },
      runId: { not: null },
      review: { is: null },
      state: "SENT",
      providerMessageId: { not: null },
      inbox: { binding: { conversationId: proposal.conversationId } },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      providerMessageId: true,
      inbox: { select: { binding: { include: bindingInclude } } },
    },
  })
  const found: AssistantTelegramHandoffMessage[] = []
  for (const row of rows) {
    const resolved = await resolve(db, row.inbox.binding, now)
    if (
      !row.providerMessageId ||
      !resolved ||
      resolved.scope.userId !== proposal.actorUserId ||
      resolved.scope.tenantId !== proposal.tenantId ||
      resolved.scope.storeId !== proposal.storeId ||
      resolved.conversation.id !== proposal.conversationId
    )
      continue
    found.push({
      botId: row.inbox.binding.identity.botId,
      chatId: row.inbox.binding.identity.chatId,
      messageId: row.providerMessageId,
      outboxId: row.id,
      tenantId: proposal.tenantId,
      storeId: proposal.storeId,
      conversationId: proposal.conversationId,
    })
  }
  return found
}
