import type { PrismaClient } from "../../../generated/prisma/client"
import {
  generalConversationWhere,
  listGeneralConversations,
  startGeneralConversation,
} from "../assistant-general"
import { runInOwnSerializableTransaction } from "../own-transaction"
import type { DbClient } from "../types"
import {
  AssistantTelegramError,
  type TelegramSender,
  isTelegramId,
  isTelegramUpdateId,
  lockAssistantTelegramConversation,
  lockTelegramSender,
  resolveAssistantTelegramConversation,
  telegramDigest,
  telegramPrincipal,
} from "./authority"
import { cancelTelegramWork } from "./link"

/**
 * Telegram `/chats` and `/new` (Workshop telegram-system 02, family 7). A choice
 * moves the chat's active binding to another saved GENERAL chat of the same user,
 * Business and Store, so later turns, drafts and replies use that chat. Access is
 * never widened: the grant, membership and scope checks are the binding's own.
 */

export const TELEGRAM_CHATS_LISTED = 8
const maxAge = 15 * 60_000

const validSender = (sender: TelegramSender) =>
  isTelegramId(sender.botId) &&
  isTelegramId(sender.userId) &&
  isTelegramId(sender.chatId)

async function activeBinding(db: DbClient, sender: TelegramSender) {
  const identity = await db.assistantTelegramIdentity.findFirst({
    where: {
      botId: sender.botId,
      telegramUserId: sender.userId,
      chatId: sender.chatId,
      revokedAt: null,
    },
    select: { id: true, activeBindingId: true, selectionGeneration: true },
  })
  if (!identity?.activeBindingId) return null
  const binding = await db.assistantTelegramBinding.findFirst({
    where: { id: identity.activeBindingId, identityId: identity.id },
    include: { identity: true },
  })
  return binding ? { identity, binding } : null
}

/** Recent saved chats for the connected Business and Store, newest first. */
export async function listAssistantTelegramChats(
  db: DbClient,
  sender: TelegramSender,
  now = new Date(),
) {
  if (!validSender(sender)) return null
  const active = await activeBinding(db, sender)
  if (!active) return null
  try {
    const resolved = await resolveAssistantTelegramConversation(
      db,
      telegramPrincipal(active.binding),
      undefined,
      now,
    )
    const chats = await listGeneralConversations(db, resolved.scope)
    return {
      bindingId: active.binding.id,
      selectionGeneration: active.identity.selectionGeneration,
      userId: resolved.scope.userId,
      tenantId: resolved.scope.tenantId,
      storeName: resolved.tenantContext.activeStore?.name ?? "Store",
      timeZone: resolved.tenantContext.tenant.timezone ?? undefined,
      currentConversationId: resolved.conversation.id,
      chats: chats.slice(0, TELEGRAM_CHATS_LISTED),
    }
  } catch (error) {
    if (error instanceof AssistantTelegramError) return null
    throw error
  }
}

export type TelegramChatSelection =
  | { kind: "new" }
  | { kind: "resume"; conversationId: string; selectionGeneration: number }

export type TelegramChatSelectionResult =
  | { state: "duplicate" | "unavailable" | "stale" }
  | {
      state: "selected"
      kind: "new" | "resume"
      conversationId: string
      title: string | null
      updatedAt: Date
      storeName: string
      timeZone?: string
    }

/**
 * Switch the connected chat to a new or saved GENERAL chat. The update id is kept
 * as a completed inbox row, so a redelivered webhook never switches twice. Queued
 * work for the earlier chat is cancelled, as when a link is confirmed.
 */
export function selectAssistantTelegramChat(
  db: PrismaClient,
  input: TelegramSender & {
    updateId: string
    messageId: string
    occurredAt: Date
    selection: TelegramChatSelection
    /** Checks the caller's signed callback against the active binding before anything changes. */
    authorize?: (bindingId: string) => boolean
    allowed?: (scope: { userId: string; tenantId: string }) => boolean
  },
  now = new Date(),
): Promise<TelegramChatSelectionResult> {
  const { updateId, occurredAt, selection } = input
  if (
    !validSender(input) ||
    !isTelegramUpdateId(updateId) ||
    !isTelegramId(input.messageId) ||
    !Number.isFinite(occurredAt.getTime()) ||
    occurredAt.getTime() > now.getTime() + 30_000 ||
    occurredAt.getTime() <= now.getTime() - maxAge
  )
    return Promise.resolve({ state: "unavailable" })
  return runInOwnSerializableTransaction(db, async (tx) => {
    await lockTelegramSender(tx, input)
    if (
      await tx.assistantTelegramInbox.findUnique({
        where: { botId_updateId: { botId: input.botId, updateId } },
        select: { id: true },
      })
    )
      return { state: "duplicate" as const }
    await tx.$queryRaw`SELECT id FROM "AssistantTelegramIdentity" WHERE "botId"=${input.botId} AND "telegramUserId"=${input.userId} FOR UPDATE`
    const active = await activeBinding(tx, input)
    if (!active) return { state: "unavailable" as const }
    const { identity, binding } = active
    if (input.authorize && !input.authorize(binding.id))
      return { state: "stale" as const }
    // Provider dates are rounded to seconds; a message from the second of a newer
    // selection has ambiguous ordering and is treated as out of date.
    if (binding.createdAt >= occurredAt) return { state: "stale" as const }
    let resolved: Awaited<ReturnType<typeof lockAssistantTelegramConversation>>
    try {
      resolved = await lockAssistantTelegramConversation(
        tx,
        telegramPrincipal(binding),
        undefined,
        now,
      )
    } catch (error) {
      if (error instanceof AssistantTelegramError)
        return { state: "unavailable" as const }
      throw error
    }
    const { scope, tenantContext } = resolved
    if (input.allowed && !input.allowed(scope))
      return { state: "unavailable" as const }
    let target: { id: string; title: string | null; updatedAt: Date }
    if (selection.kind === "resume") {
      if (selection.selectionGeneration !== identity.selectionGeneration)
        return { state: "stale" as const }
      const saved = await tx.assistantConversation.findFirst({
        where: {
          ...generalConversationWhere(scope),
          id: selection.conversationId,
        },
        select: { id: true, updatedAt: true },
      })
      if (!saved) return { state: "stale" as const }
      const [listed] = (await listGeneralConversations(tx, scope)).filter(
        (chat) => chat.id === saved.id,
      )
      target = { ...saved, title: listed?.title ?? null }
    } else {
      const created = await startGeneralConversation(tx, scope)
      target = { id: created.id, title: null, updatedAt: now }
    }
    const next = await tx.assistantTelegramBinding.update({
      where: { id: binding.id },
      data: { inboundSequence: { increment: 1 } },
      select: { inboundSequence: true },
    })
    const key = `${input.botId}_${updateId}`
    await tx.assistantTelegramInbox.create({
      data: {
        bindingId: binding.id,
        botId: input.botId,
        updateId,
        messageId: input.messageId,
        sequence: next.inboundSequence,
        contentDigest: telegramDigest("chat-selection", key),
        requestId: `telegram-chat_${key}`,
        userMessageId: `telegram-chat-user_${key}`,
        providerOccurredAt: occurredAt,
        expiresAt: new Date(now.getTime() + maxAge),
        state: "COMPLETED",
        completedAt: now,
      },
    })
    if (target.id !== binding.conversationId) {
      const selectionGeneration = identity.selectionGeneration + 1
      const created = await tx.assistantTelegramBinding.create({
        data: {
          identityId: identity.id,
          grantId: binding.grantId,
          conversationId: target.id,
          identityGeneration: binding.identityGeneration,
          grantGeneration: binding.grantGeneration,
          selectionGeneration,
        },
        select: { id: true },
      })
      await tx.assistantTelegramIdentity.update({
        where: { id: identity.id },
        data: { activeBindingId: created.id, selectionGeneration },
      })
      await cancelTelegramWork(
        tx,
        { identityId: identity.id, id: { not: created.id } },
        now,
      )
    }
    return {
      state: "selected" as const,
      kind: selection.kind,
      conversationId: target.id,
      title: target.title,
      updatedAt: target.updatedAt,
      storeName: tenantContext.activeStore?.name ?? "Store",
      timeZone: tenantContext.tenant.timezone ?? undefined,
    }
  })
}
