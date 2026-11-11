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

export type NormalizedAssistantTelegramUpdate = TelegramUpdateIdentity &
  (
    | { kind: "message"; text: string }
    | { kind: "callback"; callbackId: string; data: string }
  )

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
  return text ? { ...identity, kind: "message", text } : null
}

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

type TelegramMethod = "sendMessage" | "answerCallbackQuery"
type TelegramFetch = (url: string, init: RequestInit) => Promise<Response>
type TelegramRequest = {
  status: number
  body: Record<string, unknown> | null
  retryAfter: number | null
}

export class DirectTelegramBotProvider {
  constructor(
    private readonly config: Pick<AssistantTelegramConfig, "token">,
    private readonly send: TelegramFetch = fetch,
  ) {}

  async sendMessage(input: {
    chatId: string
    text: string
    buttons?: readonly (readonly TelegramButton[])[]
  }): Promise<TelegramSendResult> {
    const { chatId, text, buttons } = input
    const target = Number(chatId)
    if (
      positiveId(target) !== chatId ||
      !text ||
      text.length > 4096 ||
      buttons?.some(
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
      return { status: "failed" }

    const response = await this.request("sendMessage", {
      chat_id: target,
      text,
      link_preview_options: { is_disabled: true },
      ...(buttons?.length
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
        : {}),
    })
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
  ): Promise<TelegramRequest | null> {
    try {
      const response = await this.send(
        `https://api.telegram.org/bot${this.config.token}/${method}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "error",
          signal: AbortSignal.timeout(
            method === "sendMessage" ? 20_000 : 2_000,
          ),
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
