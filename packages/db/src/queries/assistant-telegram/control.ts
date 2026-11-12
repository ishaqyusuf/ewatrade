import type { DbClient } from "../types"
import type { TelegramSender } from "./authority"
import {
  connectedTelegramMessage,
  readAssistantTelegramConnection,
} from "./link"

/**
 * Workshop 02 · Telegram-native, phase 6 (control and recovery). Read-only
 * helpers: they choose copy and chat effects, never access or decisions.
 */

/** A cancelled draft is mentioned for this long after a typed "confirm" (s-old). */
const recentlyCancelled = 15 * 60_000

export type AssistantTelegramDraftState = "open" | "cancelled" | "none"

/**
 * Whether this chat's binding has a draft review waiting for its buttons, or
 * one that was cancelled moments ago. Typed words never decide either.
 */
export async function readAssistantTelegramDraftState(
  db: DbClient,
  bindingId: string,
  now = new Date(),
): Promise<AssistantTelegramDraftState> {
  const open = await db.assistantTelegramActionReview.findFirst({
    where: {
      bindingId,
      decision: null,
      expiresAt: { gt: now },
      outbox: { state: "SENT" },
      proposal: { status: "PENDING", expiresAt: { gt: now } },
    },
    select: { id: true },
  })
  if (open) return "open"
  const latest = await db.assistantTelegramActionReview.findFirst({
    where: { bindingId, decision: { not: null } },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    select: { decision: true, completedAt: true },
  })
  return latest?.decision === "cancel" &&
    latest.completedAt &&
    latest.completedAt.getTime() > now.getTime() - recentlyCancelled
    ? "cancelled"
    : "none"
}

/**
 * After RESTART (k-stop): the old Connected message of a chat that is no longer
 * connected, so it can be marked Disconnected and unpinned. Null while connected.
 */
export async function readAssistantTelegramStoppedChatMessage(
  db: DbClient,
  sender: TelegramSender,
  now = new Date(),
) {
  if (await readAssistantTelegramConnection(db, sender, now)) return null
  return connectedTelegramMessage(db, {
    botId: sender.botId,
    telegramUserId: sender.userId,
    chatId: sender.chatId,
  })
}
