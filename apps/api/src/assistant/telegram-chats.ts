import { createHmac, timingSafeEqual } from "node:crypto"
import {
  type AssistantTelegramConfig,
  type NormalizedAssistantTelegramUpdate,
  type TelegramButton,
  escapeTelegramHtml,
} from "@ewatrade/communications"
import {
  type TelegramChatSelection,
  listAssistantTelegramChats,
  selectAssistantTelegramChat,
} from "@ewatrade/db/assistant-telegram"

/**
 * Telegram `/new` and `/chats` (Workshop ewatrade/assistant/telegram-system,
 * 02 · Telegram-native, l-new and l-chats). Handled at the webhook like
 * `/disconnect`, because choosing a chat moves the active binding and a reply queued
 * on the earlier binding could not be delivered. Buttons carry a signed position,
 * never authority: the binding, grant and scope are checked again on every tap.
 */

const esc = escapeTelegramHtml
const commandPattern = /^\/(new|chats)$/i
const callbackPattern =
  /^tc:(\d{1,9}):([A-Za-z0-9_-]{1,32}):([A-Za-z0-9_-]{12})$/

/** What the edited list or reply says; HTML, with Store and chat names escaped. */
export const telegramChatsCopy = {
  list: (store: string) =>
    `<b>Your chats · ${esc(store)}</b>\nPick one to continue. Each keeps its own drafts.`,
  continuing: (store: string, label: string) =>
    `<b>Your chats · ${esc(store)}</b>\nContinuing: <b>${esc(label)}</b>`,
  started:
    "<b>New chat started ✓</b>\nEarlier chats keep their drafts. Use /chats to go back to one. What do you need?",
  stale:
    "<b>Your chats</b>\nThis list is out of date. Send /chats for a fresh one.",
} as const

function signature(
  secret: string,
  bindingId: string,
  generation: number,
  target: string,
) {
  return createHmac("sha256", secret)
    .update(
      `assistant-telegram-chats:v1\0${bindingId}\0${generation}\0${target}`,
    )
    .digest("base64url")
    .slice(0, 12)
}

/** `tc:<selection generation>:<chat id | new>:<signature>`, at most 64 bytes. */
export function telegramChatCallbackData(
  secret: string,
  bindingId: string,
  generation: number,
  target: string,
) {
  const data = `tc:${generation}:${target}:${signature(secret, bindingId, generation, target)}`
  return Buffer.byteLength(data) <= 64 && callbackPattern.test(data)
    ? data
    : undefined
}

export function parseTelegramChatCallback(data: string) {
  const match = callbackPattern.exec(data)
  if (!match?.[1] || !match[2] || !match[3]) return null
  return {
    generation: Number(match[1]),
    target: match[2],
    signature: match[3],
  }
}

export const isTelegramChatCallback = (data: string) =>
  callbackPattern.test(data)

function verified(
  secret: string,
  bindingId: string,
  callback: NonNullable<ReturnType<typeof parseTelegramChatCallback>>,
) {
  const expected = Buffer.from(
    signature(secret, bindingId, callback.generation, callback.target),
  )
  const actual = Buffer.from(callback.signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

const localDay = (date: Date, timeZone: string) =>
  date.toLocaleDateString("en-CA", { timeZone })

/** "Today 9:12 · stock questions", "Yesterday · …" or "14 Oct · …". */
export function telegramChatLabel(
  chat: { title: string | null; updatedAt: Date },
  now: Date,
  timeZone = "UTC",
) {
  let when: string
  try {
    const day = localDay(chat.updatedAt, timeZone)
    if (day === localDay(now, timeZone))
      when = `Today ${chat.updatedAt
        .toLocaleTimeString("en-GB", {
          timeZone,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
        .replace(/\s?[ap]m$/i, "")}`
    else if (day === localDay(new Date(now.getTime() - 86_400_000), timeZone))
      when = "Yesterday"
    else
      when = chat.updatedAt.toLocaleDateString("en-GB", {
        timeZone,
        day: "numeric",
        month: "short",
      })
  } catch {
    when = chat.updatedAt.toISOString().slice(0, 10)
  }
  const title = (chat.title ?? "New chat")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
  const label = `${when} · ${title || "New chat"}`
  return label.length <= 60 ? label : `${label.slice(0, 59)}…`
}

type ChatsNotice = {
  text: string
  html: true
  buttons?: TelegramButton[][]
  /** Edit the tapped list in place instead of sending a new message. */
  editMessageId?: string
}

const allowedBy =
  (config: AssistantTelegramConfig) =>
  (scope: { userId: string; tenantId: string }) =>
    config.allowedUserIds.has(scope.userId) &&
    config.allowedTenantIds.has(scope.tenantId)

/**
 * Returns null when the update is not a chats command or tap, or when the chat is
 * not connected, so the ordinary webhook path answers it. `{}` means handled quietly.
 */
export async function acceptTelegramChatsUpdate(
  db: Parameters<typeof selectAssistantTelegramChat>[0],
  config: AssistantTelegramConfig,
  event: NormalizedAssistantTelegramUpdate,
  now = new Date(),
): Promise<{ notice?: ChatsNotice } | null> {
  const sender = {
    botId: config.botId,
    userId: event.userId,
    chatId: event.chatId,
  }
  const allowed = allowedBy(config)
  if (event.kind === "message") {
    const command = commandPattern.exec(event.text.trim())?.[1]?.toLowerCase()
    if (!command) return null
    if (command === "chats") {
      const list = await listAssistantTelegramChats(db, sender, now)
      if (!list) return null
      if (!allowed(list)) return {}
      const button = (text: string, target: string) => {
        const data = telegramChatCallbackData(
          config.webhookSecret,
          list.bindingId,
          list.selectionGeneration,
          target,
        )
        return data ? [{ text, callbackData: data }] : []
      }
      const rows = list.chats
        .map((chat) =>
          button(
            `${chat.id === list.currentConversationId ? "✓ " : ""}${telegramChatLabel(chat, now, list.timeZone)}`,
            chat.id,
          ),
        )
        .filter((row) => row.length)
      rows.push(button("Start a new chat", "new"))
      return {
        notice: {
          text: telegramChatsCopy.list(list.storeName),
          html: true,
          buttons: rows,
        },
      }
    }
    const result = await selectAssistantTelegramChat(
      db,
      {
        ...sender,
        updateId: event.updateId,
        messageId: event.messageId,
        occurredAt: event.occurredAt,
        selection: { kind: "new" },
        allowed,
      },
      now,
    )
    if (result.state === "selected")
      return { notice: { text: telegramChatsCopy.started, html: true } }
    return result.state === "unavailable" ? null : {}
  }
  if (event.kind !== "callback") return null
  const callback = parseTelegramChatCallback(event.data)
  if (!callback) return null
  const selection: TelegramChatSelection =
    callback.target === "new"
      ? { kind: "new" }
      : {
          kind: "resume",
          conversationId: callback.target,
          selectionGeneration: callback.generation,
        }
  const result = await selectAssistantTelegramChat(
    db,
    {
      ...sender,
      updateId: event.updateId,
      messageId: event.messageId,
      occurredAt: event.occurredAt,
      selection,
      allowed,
      authorize: (bindingId) =>
        verified(config.webhookSecret, bindingId, callback),
    },
    now,
  )
  if (result.state === "duplicate") return {}
  // Spent, stale or foreign lists are edited so their buttons cannot be tapped again.
  const edit = (text: string) => ({
    notice: { text, html: true as const, editMessageId: event.messageId },
  })
  if (result.state !== "selected") return edit(telegramChatsCopy.stale)
  return edit(
    result.kind === "new"
      ? telegramChatsCopy.started
      : telegramChatsCopy.continuing(
          result.storeName,
          telegramChatLabel(result, now, result.timeZone),
        ),
  )
}
