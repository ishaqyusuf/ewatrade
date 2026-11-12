type Environment = Record<string, string | undefined>

export type AssistantTelegramConfig = {
  enabled: boolean
  botId: string
  username: string
  token: string
  webhookSecret: string
  allowedUserIds: ReadonlySet<string>
  allowedTenantIds: ReadonlySet<string>
}

const positiveId = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : null

function enrolledIds(value: string | undefined) {
  return new Set(
    value
      ?.split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0 && id.length <= 128),
  )
}

/** Signed disconnect remains available when merchant work has been switched off. */
export function readAssistantTelegramWebhookConfig(
  env: Environment = process.env,
): AssistantTelegramConfig | null {
  const botId = env.ASSISTANT_TELEGRAM_BOT_ID?.trim() ?? ""
  const username = env.ASSISTANT_TELEGRAM_BOT_USERNAME?.trim() ?? ""
  const token = env.ASSISTANT_TELEGRAM_BOT_TOKEN?.trim() ?? ""
  const webhookSecret = env.ASSISTANT_TELEGRAM_WEBHOOK_SECRET?.trim() ?? ""
  const tokenParts = /^([1-9]\d{0,15}):[A-Za-z0-9_-]{20,128}$/.exec(token)
  if (
    !tokenParts ||
    tokenParts[1] !== botId ||
    positiveId(Number(botId)) !== botId ||
    !/^[A-Za-z][A-Za-z0-9_]{1,28}bot$/i.test(username) ||
    !/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret) ||
    token.endsWith(`:${webhookSecret}`)
  )
    return null

  return {
    enabled: env.ASSISTANT_TELEGRAM_ENABLED === "true",
    botId,
    username,
    token,
    webhookSecret,
    allowedUserIds: enrolledIds(env.ASSISTANT_TELEGRAM_PILOT_USER_IDS),
    allowedTenantIds: enrolledIds(env.ASSISTANT_TELEGRAM_PILOT_TENANT_IDS),
  }
}

export function readAssistantTelegramConfig(env: Environment = process.env) {
  const config = readAssistantTelegramWebhookConfig(env)
  return config?.enabled ? config : null
}

export function isAssistantTelegramEnrolled(
  config: AssistantTelegramConfig,
  scope: { userId: string; tenantId: string },
) {
  return (
    config.enabled &&
    config.allowedUserIds.has(scope.userId) &&
    config.allowedTenantIds.has(scope.tenantId)
  )
}

type TelegramUpdateIdentity = {
  updateId: string
  chatId: string
  userId: string
  messageId: string
  occurredAt: Date
}

export type NormalizedAssistantTelegramUpdate =
  | (TelegramUpdateIdentity &
      (
        | {
            kind: "message"
            text: string
            /** Profile text from Telegram, used only to label a pending link claim. */
            sender?: { name: string | null; username: string | null }
            /** Present when the message was forwarded; the original author when Telegram shares it. */
            forward?: { userId: string | null; isBot: boolean }
          }
        | { kind: "callback"; callbackId: string; data: string }
      ))
  | (Omit<TelegramUpdateIdentity, "messageId"> & {
      /** `my_chat_member`: the user stopped (blocked) or restarted the bot. */
      kind: "member"
      status: "stopped" | "restarted"
    })

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

const byteLength = (value: string) => Buffer.byteLength(value, "utf8")

export function parseAssistantTelegramUpdate(
  value: unknown,
): NormalizedAssistantTelegramUpdate | null {
  const update = record(value)
  const updateId = update?.update_id === 0 ? "0" : positiveId(update?.update_id)
  if (
    !update ||
    !updateId ||
    ("message" in update && "callback_query" in update)
  )
    return null
  if ("my_chat_member" in update)
    return "message" in update || "callback_query" in update
      ? null
      : parseMemberUpdate(updateId, record(update.my_chat_member))

  const callback = record(update.callback_query)
  const message = record(callback ? callback.message : update.message)
  const chat = record(message?.chat)
  const user = record(callback ? callback.from : message?.from)
  const chatId = positiveId(chat?.id)
  const userId = positiveId(user?.id)
  const messageId = positiveId(message?.message_id)
  const date = message?.date
  if (
    chat?.type !== "private" ||
    !chatId ||
    !userId ||
    user?.is_bot !== false ||
    !messageId ||
    typeof date !== "number" ||
    !Number.isSafeInteger(date) ||
    date <= 0 ||
    date > 253402300799
  )
    return null

  const identity = {
    updateId,
    chatId,
    userId,
    messageId,
    occurredAt: new Date(date * 1000),
  }
  if (callback) {
    if (
      typeof callback.id !== "string" ||
      callback.id.length < 1 ||
      callback.id.length > 128 ||
      typeof callback.data !== "string" ||
      !callback.data ||
      byteLength(callback.data) > 64
    )
      return null
    // CallbackQuery has no click timestamp. The message's date belongs to the review.
    return {
      ...identity,
      occurredAt: new Date(),
      kind: "callback",
      callbackId: callback.id,
      data: callback.data,
    }
  }
  const input = message?.text
  if (typeof input !== "string" || byteLength(input) > 16_384) return null
  const text = input.trim()
  if (!text) return null
  const part = (value: unknown) =>
    typeof value === "string" && value.length <= 256 ? value.trim() : ""
  const name = [part(user?.first_name), part(user?.last_name)]
    .filter(Boolean)
    .join(" ")
  const username = part(user?.username)
  return {
    ...identity,
    kind: "message",
    text,
    sender: { name: name || null, username: username || null },
    ...forwardOrigin(message),
  }
}

function forwardOrigin(message: Record<string, unknown> | null) {
  const origin = record(message?.forward_origin)
  const legacy = record(message?.forward_from)
  if (!origin && !legacy && message?.forward_date === undefined) return {}
  const author =
    origin?.type === "user"
      ? record(origin.sender_user)
      : origin
        ? null
        : legacy
  return {
    forward: {
      userId: positiveId(author?.id),
      isBot: author?.is_bot === true,
    },
  }
}

/** A private chat's own member change: Stop bot (kicked) or RESTART after it. */
function parseMemberUpdate(
  updateId: string,
  member: Record<string, unknown> | null,
): NormalizedAssistantTelegramUpdate | null {
  const chat = record(member?.chat)
  const user = record(member?.from)
  const chatId = positiveId(chat?.id)
  const userId = positiveId(user?.id)
  const date = member?.date
  const before = record(member?.old_chat_member)?.status
  const after = record(member?.new_chat_member)?.status
  if (
    chat?.type !== "private" ||
    !chatId ||
    chatId !== userId ||
    user?.is_bot !== false ||
    typeof date !== "number" ||
    !Number.isSafeInteger(date) ||
    date <= 0 ||
    date > 253402300799
  )
    return null
  const status =
    after === "kicked"
      ? "stopped"
      : before === "kicked" && after === "member"
        ? "restarted"
        : null
  return status
    ? {
        updateId,
        chatId,
        userId,
        occurredAt: new Date(date * 1000),
        kind: "member",
        status,
      }
    : null
}

/** Escape user or business text placed inside Telegram HTML messages. */
export function escapeTelegramHtml(value: string) {
  return value.replace(
    /[&<>]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char] ?? char,
  )
}

export type TelegramBotCommand = { command: string; description: string }

export function isAssistantTelegramDisconnect(text: string) {
  return /^(?:\/(?:disconnect|stop)|stop|disconnect)$/i.test(text)
}

export type TelegramButton = { text: string } & (
  | { callbackData: string; url?: never }
  | { callbackData?: never; url: string }
)

export type TelegramSendResult =
  | { status: "accepted"; messageId: string }
  | { status: "retry"; retryAfterMs: number }
  | { status: "failed" }
  | { status: "uncertain" }

type TelegramMethod =
  | "sendMessage"
  | "sendChatAction"
  | "answerCallbackQuery"
  | "editMessageReplyMarkup"
  | "editMessageText"
  | "deleteMessage"
  | "pinChatMessage"
  | "unpinAllChatMessages"
  | "setMyCommands"
  | "deleteMyCommands"
type TelegramFetch = (url: string, init: RequestInit) => Promise<Response>
type TelegramRequest = {
  status: number
  body: Record<string, unknown> | null
  retryAfter: number | null
}

function validText(
  text: string,
  buttons?: readonly (readonly TelegramButton[])[],
) {
  return (
    Boolean(text) &&
    text.length <= 4096 &&
    !buttons?.some(
      (row) =>
        row.length === 0 ||
        row.some(
          (button) =>
            !button.text ||
            ("callbackData" in button &&
              (!button.callbackData || byteLength(button.callbackData) > 64)),
        ),
    )
  )
}

function keyboard(buttons?: readonly (readonly TelegramButton[])[]) {
  return buttons?.length
    ? {
        reply_markup: {
          inline_keyboard: buttons.map((row) =>
            row.map((button) =>
              button.callbackData
                ? { text: button.text, callback_data: button.callbackData }
                : { text: button.text, url: button.url },
            ),
          ),
        },
      }
    : undefined
}

function notModified(response: TelegramRequest | null) {
  return (
    response?.status === 400 &&
    response.body?.ok === false &&
    typeof response.body.description === "string" &&
    /^Bad Request: message is not modified\b/i.test(response.body.description)
  )
}

export class DirectTelegramBotProvider {
  constructor(
    private readonly config: Pick<AssistantTelegramConfig, "token">,
    private readonly send: TelegramFetch = fetch,
  ) {}

  async sendTyping(chatId: string, signal?: AbortSignal): Promise<boolean> {
    const target = Number(chatId)
    if (positiveId(target) !== chatId || signal?.aborted) return false
    const response = await this.request(
      "sendChatAction",
      { chat_id: target, action: "typing" },
      signal,
    )
    return (
      response !== null &&
      response.status >= 200 &&
      response.status < 300 &&
      response.body?.ok === true &&
      response.body.result === true
    )
  }

  async sendMessage(input: {
    chatId: string
    text: string
    buttons?: readonly (readonly TelegramButton[])[]
    /** Text is Telegram HTML; callers escape any user or business text. */
    html?: boolean
  }): Promise<TelegramSendResult> {
    const { chatId, text, buttons, html } = input
    const target = Number(chatId)
    if (positiveId(target) !== chatId || !validText(text, buttons))
      return { status: "failed" }

    const response = await this.request("sendMessage", {
      chat_id: target,
      text,
      link_preview_options: { is_disabled: true },
      ...(html ? { parse_mode: "HTML" } : {}),
      ...keyboard(buttons),
    })
    return this.messageResult(response)
  }

  /** Edit the bot's own message in place; no buttons removes its keyboard. */
  async editMessageText(input: {
    chatId: string
    messageId: string
    text: string
    buttons?: readonly (readonly TelegramButton[])[]
    html?: boolean
  }): Promise<TelegramSendResult> {
    const chatId = Number(input.chatId)
    const messageId = Number(input.messageId)
    if (
      positiveId(chatId) !== input.chatId ||
      positiveId(messageId) !== input.messageId ||
      !validText(input.text, input.buttons)
    )
      return { status: "failed" }
    const response = await this.request("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: input.text,
      link_preview_options: { is_disabled: true },
      ...(input.html ? { parse_mode: "HTML" } : {}),
      // An explicit empty keyboard removes spent buttons from the edited message.
      ...(keyboard(input.buttons) ?? { reply_markup: { inline_keyboard: [] } }),
    })
    if (notModified(response))
      return { status: "accepted", messageId: input.messageId }
    const result = this.messageResult(response)
    return result.status === "accepted" && result.messageId !== input.messageId
      ? { status: "uncertain" }
      : result
  }

  /** Delete a message in the private chat, e.g. a password the user sent by mistake. */
  async deleteMessage(input: { chatId: string; messageId: string }) {
    const chatId = Number(input.chatId)
    const messageId = Number(input.messageId)
    if (
      positiveId(chatId) !== input.chatId ||
      positiveId(messageId) !== input.messageId
    )
      return false
    return this.ok(
      await this.request("deleteMessage", {
        chat_id: chatId,
        message_id: messageId,
      }),
    )
  }

  /** Pin quietly: the pinned bar shows the connected Business and Store. */
  async pinChatMessage(input: { chatId: string; messageId: string }) {
    const chatId = Number(input.chatId)
    const messageId = Number(input.messageId)
    if (
      positiveId(chatId) !== input.chatId ||
      positiveId(messageId) !== input.messageId
    )
      return false
    return this.ok(
      await this.request("pinChatMessage", {
        chat_id: chatId,
        message_id: messageId,
        disable_notification: true,
      }),
    )
  }

  async unpinAllChatMessages(chatId: string) {
    const target = Number(chatId)
    if (positiveId(target) !== chatId) return false
    return this.ok(
      await this.request("unpinAllChatMessages", { chat_id: target }),
    )
  }

  /** Per-chat command menu; null restores the bot's default commands. */
  async setChatCommands(
    chatId: string,
    commands: readonly TelegramBotCommand[] | null,
  ) {
    const target = Number(chatId)
    if (
      positiveId(target) !== chatId ||
      commands?.some(
        ({ command, description }) =>
          !/^[a-z0-9_]{1,32}$/.test(command) ||
          !description ||
          description.length > 256,
      )
    )
      return false
    const scope = { type: "chat", chat_id: target }
    return this.ok(
      commands
        ? await this.request("setMyCommands", { commands, scope })
        : await this.request("deleteMyCommands", { scope }),
    )
  }

  private ok(response: TelegramRequest | null) {
    return (
      response !== null &&
      response.status >= 200 &&
      response.status < 300 &&
      response.body?.ok === true &&
      response.body.result === true
    )
  }

  async clearInlineKeyboard(input: {
    chatId: string
    messageId: string
  }): Promise<TelegramSendResult> {
    const chatId = Number(input.chatId)
    const messageId = Number(input.messageId)
    if (
      positiveId(chatId) !== input.chatId ||
      positiveId(messageId) !== input.messageId
    )
      return { status: "failed" }

    const response = await this.request("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    })
    if (notModified(response))
      return { status: "accepted", messageId: input.messageId }
    const result = this.messageResult(response)
    return result.status === "accepted" && result.messageId !== input.messageId
      ? { status: "uncertain" }
      : result
  }

  private messageResult(response: TelegramRequest | null): TelegramSendResult {
    if (!response) return { status: "uncertain" }
    const { status, body, retryAfter } = response
    if (status === 429 || (body?.ok === false && body.error_code === 429)) {
      const parameter = record(body?.parameters)?.retry_after
      const seconds =
        typeof parameter === "number" &&
        Number.isSafeInteger(parameter) &&
        parameter > 0
          ? parameter
          : (retryAfter ?? 30)
      return {
        status: "retry",
        retryAfterMs: Math.min(seconds, 2_147_483) * 1000,
      }
    }
    if (status >= 500 || status === 408) return { status: "uncertain" }
    if (status >= 400 || body?.ok === false) return { status: "failed" }
    const messageId = positiveId(record(body?.result)?.message_id)
    return status >= 200 && status < 300 && body?.ok === true && messageId
      ? { status: "accepted", messageId }
      : { status: "uncertain" }
  }

  async answerCallbackQuery(callbackId: string): Promise<boolean> {
    const response = await this.request("answerCallbackQuery", {
      callback_query_id: callbackId,
    })
    return response?.body?.ok === true && response.body.result === true
  }

  private async request(
    method: TelegramMethod,
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<TelegramRequest | null> {
    try {
      const timeout = AbortSignal.timeout(
        method === "sendMessage" ? 20_000 : 2_000,
      )
      const response = await this.send(
        `https://api.telegram.org/bot${this.config.token}/${method}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "error",
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        },
      )
      const retryAfter = Number(response.headers.get("retry-after"))
      let body: Record<string, unknown> | null = null
      try {
        body = record(await response.json())
      } catch {
        // HTTP 429 and explicit client errors are usable even without a response body.
      }
      return {
        status: response.status,
        body,
        retryAfter:
          Number.isSafeInteger(retryAfter) && retryAfter > 0
            ? retryAfter
            : null,
      }
    } catch {
      // Fetch errors can contain the token-bearing URL. Keep the outcome only.
      return null
    }
  }
}
