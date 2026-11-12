import { expect, test } from "bun:test"
import type {
  AssistantTelegramConfig,
  NormalizedAssistantTelegramUpdate,
} from "@ewatrade/communications"
import { OpenAPIHono } from "@hono/zod-openapi"
import { acceptAssistantTelegramMedia } from "../assistant/telegram-media"
import { registerAssistantTelegramRoutes } from "./telegram-routes"

/** Phase 5: a media update reaches the webhook and gets one quoted text reply. */

const config: AssistantTelegramConfig = {
  enabled: true,
  botId: "123",
  username: "ewatrade_test_bot",
  token: "123:synthetic_test_token_123456789",
  webhookSecret: "synthetic_test_webhook_secret",
  allowedUserIds: new Set(["person-1"]),
  allowedTenantIds: new Set(["tenant-1"]),
}
const scope = {
  userId: "person-1",
  tenantId: "tenant-1",
  storeId: "store-1",
  membershipId: "membership-1",
  conversationId: "conversation-1",
}

function createRoutes(enabled = true) {
  const app = new OpenAPIHono()
  const sent: Record<string, unknown>[] = []
  const calls: string[] = []
  registerAssistantTelegramRoutes(app, {
    config: () => ({ ...config, enabled }),
    accept: async (
      current: AssistantTelegramConfig,
      event: NormalizedAssistantTelegramUpdate,
    ) => {
      calls.push(`accept:${event.kind}`)
      return event.kind === "media"
        ? acceptAssistantTelegramMedia(current, event, {
            readScope: (async () => scope) as never,
          })
        : {}
    },
    enqueueTurn: async (id: string) => {
      calls.push(`enqueue:${id}`)
    },
    processTurn: async () => ({ status: "completed" }),
    processDelivery: async () => ({ status: "sent" }),
    provider: () => ({
      answerCallbackQuery: async () => true,
      sendMessage: async (input: Record<string, unknown>) => {
        sent.push(input)
        return { status: "accepted", messageId: "60" }
      },
      editMessageText: async () => ({ status: "accepted", messageId: "60" }),
      pinChatMessage: async () => true,
      unpinAllChatMessages: async () => true,
      setChatCommands: async () => true,
    }),
  } as never)
  const post = (message: Record<string, unknown>, updateId = 9001) =>
    app.request("/api/webhooks/telegram", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": config.webhookSecret,
      },
      body: JSON.stringify({
        update_id: updateId,
        message: {
          message_id: 41,
          date: 1_784_000_000,
          from: { id: 4_501_234_567_890, is_bot: false },
          chat: { id: 4_501_234_567_890, type: "private" },
          ...message,
        },
      }),
    })
  return { post, sent, calls }
}

test("a voice note gets the v-today reply quoting it, and no assistant turn", async () => {
  const routes = createRoutes()
  const response = await routes.post({ voice: { file_id: "v", duration: 7 } })
  expect(response.status).toBe(200)
  expect(routes.calls).toEqual(["accept:media"])
  expect(routes.sent).toEqual([
    {
      chatId: "4501234567890",
      text: "I can only read text messages here for now. Please type it instead.",
      html: undefined,
      buttons: undefined,
      replyToMessageId: "41",
    },
  ])
})

test("an album sends one reply for its media_group_id", async () => {
  const routes = createRoutes()
  const photo = [{ file_id: "p", width: 90, height: 90 }]
  for (const [index, updateId] of [9101, 9102, 9103].entries())
    await routes.post(
      { photo, media_group_id: "route-album", message_id: 50 + index },
      updateId,
    )
  expect(routes.sent).toHaveLength(1)
  expect(routes.sent[0]).toMatchObject({
    replyToMessageId: "50",
    text: expect.stringContaining("attach your photos."),
  })
})

test("media is ignored while Telegram is switched off", async () => {
  const routes = createRoutes(false)
  await routes.post({ photo: [{ file_id: "p" }] })
  expect(routes.calls).toEqual([])
  expect(routes.sent).toEqual([])
})
