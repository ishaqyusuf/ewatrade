import {
  type AssistantChannelDeliveryResult,
  assistantChannelDeliveryJobSchema,
  assistantChannelDeliveryResultSchema,
} from "@ewatrade/assistant/channels/delivery"
import {
  type AssistantChannelTurnResult,
  assistantChannelTurnJobSchema,
  assistantChannelTurnResultSchema,
} from "@ewatrade/assistant/channels/worker"
import {
  type AssistantTelegramConfig,
  DirectTelegramBotProvider,
  type NormalizedAssistantTelegramUpdate,
  isAssistantTelegramDisconnect,
  parseAssistantTelegramUpdate,
  readAssistantTelegramWebhookConfig,
} from "@ewatrade/communications"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { safeCompare } from "../utils/safe-compare"

const webhookMaxBytes = 64 * 1024
const workerMaxBytes = 512
const noStore = { "Cache-Control": "no-store" }

type JsonResult =
  | { data: unknown; error?: never }
  | { data?: never; error: 400 | 413 }

/** Bound streamed bytes before JSON parsing, even when Content-Length is absent. */
async function readBoundedJson(
  request: Request,
  maximum: number,
): Promise<JsonResult> {
  if (Number(request.headers.get("content-length")) > maximum)
    return { error: 413 }
  const reader = request.body?.getReader()
  if (!reader) return { error: 400 }
  let size = 0
  let text = ""
  const decoder = new TextDecoder("utf-8", { fatal: true })
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > maximum) {
        void reader.cancel().catch(() => undefined)
        return { error: 413 }
      }
      text += decoder.decode(part.value, { stream: true })
    }
    return { data: JSON.parse(text + decoder.decode()) }
  } catch {
    return { error: 400 }
  } finally {
    reader.releaseLock()
  }
}

type TelegramRouteDependencies = {
  config?: () => AssistantTelegramConfig | null
  workerSecret?: () => string | undefined
  provider?: (
    config: AssistantTelegramConfig,
  ) => Pick<DirectTelegramBotProvider, "answerCallbackQuery" | "sendMessage">
  accept: (
    config: AssistantTelegramConfig,
    event: NormalizedAssistantTelegramUpdate,
  ) => Promise<{ ingressId?: string; notice?: string }>
  enqueueTurn: (ingressId: string) => Promise<unknown>
  processTurn: (ingressId: string) => Promise<AssistantChannelTurnResult>
  processDelivery: (outboxId: string) => Promise<AssistantChannelDeliveryResult>
}

export function registerAssistantTelegramRoutes(
  app: OpenAPIHono,
  {
    config = readAssistantTelegramWebhookConfig,
    workerSecret = () => process.env.INTERNAL_API_KEY,
    provider = (current) => new DirectTelegramBotProvider(current),
    accept,
    enqueueTurn,
    processTurn,
    processDelivery,
  }: TelegramRouteDependencies,
) {
  app.post("/api/webhooks/telegram", async (c) => {
    c.header("Cache-Control", "no-store")
    const current = config()
    if (
      !current ||
      !safeCompare(
        c.req.header("x-telegram-bot-api-secret-token"),
        current.webhookSecret,
      )
    )
      return c.json({ code: "UNAUTHORIZED" }, 401)

    const body = await readBoundedJson(c.req.raw, webhookMaxBytes)
    if (body.error)
      return c.json(
        { code: body.error === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST" },
        body.error,
      )
    const event = parseAssistantTelegramUpdate(body.data)
    if (
      !event ||
      (!current.enabled &&
        (event.kind !== "message" ||
          !isAssistantTelegramDisconnect(event.text)))
    )
      return c.json({ ok: true })

    let accepted: Awaited<ReturnType<TelegramRouteDependencies["accept"]>>
    try {
      accepted = await accept(current, event)
    } catch {
      return c.json({ code: "CHANNEL_UNAVAILABLE" }, 503)
    }

    const effects: Promise<unknown>[] = []
    if (accepted.ingressId)
      effects.push(
        enqueueTurn(accepted.ingressId).catch(() => {
          console.error("[assistant] Telegram dispatch deferred to recovery")
        }),
      )
    if (event.kind === "callback" || accepted.notice) {
      const bot = provider(current)
      if (event.kind === "callback")
        effects.push(bot.answerCallbackQuery(event.callbackId))
      if (accepted.notice)
        effects.push(
          bot.sendMessage({ chatId: event.chatId, text: accepted.notice }),
        )
    }
    await Promise.allSettled(effects)
    return c.json({ ok: true })
  })

  const workerRoutes = {
    turn: async (body: unknown) => {
      const input = assistantChannelTurnJobSchema.safeParse(body)
      if (!input.success) return null
      return assistantChannelTurnResultSchema.parse(
        await processTurn(input.data.ingressId),
      )
    },
    delivery: async (body: unknown) => {
      const input = assistantChannelDeliveryJobSchema.safeParse(body)
      if (!input.success) return null
      return assistantChannelDeliveryResultSchema.parse(
        await processDelivery(input.data.outboxId),
      )
    },
  }
  for (const [kind, worker] of Object.entries(workerRoutes)) {
    app.post(`/api/internal/assistant/telegram-${kind}`, async (c) => {
      if (!safeCompare(c.req.header("x-internal-key"), workerSecret()))
        return c.json({ code: "UNAUTHORIZED" }, 401, noStore)
      const body = await readBoundedJson(c.req.raw, workerMaxBytes)
      if (body.error)
        return c.json(
          { code: body.error === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST" },
          body.error,
          noStore,
        )
      try {
        const result = await worker(body.data)
        return result
          ? c.json(result, 200, noStore)
          : c.json({ code: "BAD_REQUEST" }, 400, noStore)
      } catch {
        return c.json({ code: "CHANNEL_UNAVAILABLE" }, 503, noStore)
      }
    })
  }
}
