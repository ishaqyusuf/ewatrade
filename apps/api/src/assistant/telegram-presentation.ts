import {
  type DirectTelegramBotProvider,
  type TelegramBotCommand,
  type TelegramButton,
  escapeTelegramHtml,
} from "@ewatrade/communications"

/**
 * Telegram-native linking presentation (Workshop ewatrade/assistant/telegram-system,
 * 02 · Telegram-native). Copy and chat effects only: authority stays in the link,
 * grant and binding queries, and every chat effect here is best-effort.
 */

export const telegramAppOrigin = () =>
  process.env.DASHBOARD_URL ??
  process.env.NEXT_PUBLIC_DASHBOARD_URL ??
  "https://dash.ewatrade.com"

/** Telegram rejects non-HTTPS URL buttons, so local origins get text only. */
export function openEwaTradeButtons(
  label = "Open EwaTrade",
): TelegramButton[][] | undefined {
  const url = new URL("/account/telegram", telegramAppOrigin())
  return url.protocol === "https:"
    ? [[{ text: label, url: url.href }]]
    : undefined
}

const scope = (business: { businessName: string; storeName: string }) =>
  `<b>${escapeTelegramHtml(`${business.businessName} · ${business.storeName}`)}</b>`

export const telegramCopy = {
  entry: "Connect EwaTrade to use me here.",
  staleLink: "This link no longer works. Nothing changed.",
  claim: (business: { businessName: string; storeName: string }) =>
    `Confirm this Telegram account in EwaTrade to connect ${scope(business)}.`,
  alreadyConnected: (business: { businessName: string; storeName: string }) =>
    `You're connected to ${scope(business)}. Ask me anything, or tap Menu.`,
  connected: (business: { businessName: string; storeName: string }) =>
    `<b>Connected ✓</b>\n${escapeTelegramHtml(`${business.businessName} · ${business.storeName}`)}\n\nAsk me anything, or tap Menu.`,
  closed: "This link was closed. Nothing was connected.",
  expired: "This link expired after 5 minutes. Nothing was connected.",
  disconnected: (business: { businessName: string; storeName: string }) =>
    `<b>Disconnected</b>\n${escapeTelegramHtml(`${business.businessName} · ${business.storeName}`)}`,
} as const

/** Commands shown in a connected chat; unconnected chats use the bot's defaults. */
export const telegramConnectedCommands: readonly TelegramBotCommand[] = [
  { command: "help", description: "What I can do" },
  { command: "new", description: "Start a new chat" },
  { command: "chats", description: "Continue a saved chat" },
  { command: "scope", description: "Your Business and Store" },
  { command: "disconnect", description: "Remove Telegram access" },
]

export type TelegramChatEffects = Pick<
  DirectTelegramBotProvider,
  | "editMessageText"
  | "pinChatMessage"
  | "unpinAllChatMessages"
  | "setChatCommands"
>

type ChatMessage = { chatId: string; messageId: string }

async function settle(effects: Promise<unknown>[]) {
  // Chat effects are presentation only. A failed edit or pin never changes access.
  await Promise.allSettled(effects)
}

/** Confirmed in EwaTrade: edit the claim message, pin it and switch the menu. */
export function showTelegramConnected(
  bot: TelegramChatEffects,
  message: ChatMessage,
  business: { businessName: string; storeName: string },
) {
  return settle([
    bot
      .editMessageText({
        ...message,
        text: telegramCopy.connected(business),
        html: true,
      })
      .then(() => bot.pinChatMessage(message)),
    bot.setChatCommands(message.chatId, telegramConnectedCommands),
  ])
}

/** Closed or expired without connecting: edit the claim message, remove its button. */
export function closeTelegramClaim(
  bot: TelegramChatEffects,
  message: ChatMessage,
  text: string,
) {
  return settle([bot.editMessageText({ ...message, text })])
}

/** Access ended: mark the pinned message, unpin it and restore the default menu. */
export function showTelegramDisconnected(
  bot: TelegramChatEffects,
  chatId: string,
  connected: (ChatMessage & { businessName: string; storeName: string }) | null,
) {
  return settle([
    ...(connected
      ? [
          bot.editMessageText({
            chatId: connected.chatId,
            messageId: connected.messageId,
            text: telegramCopy.disconnected(connected),
            html: true,
          }),
        ]
      : []),
    bot.unpinAllChatMessages(chatId),
    bot.setChatCommands(chatId, null),
  ])
}
