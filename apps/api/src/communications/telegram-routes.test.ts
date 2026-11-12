import { expect, test } from "bun:test"
import type { AssistantTelegramConfig } from "@ewatrade/communications"
import { OpenAPIHono } from "@hono/zod-openapi"
import { registerAssistantTelegramRoutes } from "./telegram-routes"

const config: AssistantTelegramConfig = {
  enabled: true,
  botId: "123",
  username: "ewatrade_test_bot",
  token: "123:synthetic_test_token_123456789",
  webhookSecret: "synthetic_test_webhook_secret",
  allowedUserIds: new Set(["member"]),
  allowedTenantIds: new Set(["tenant"]),
}

function createRoutes(
  options: { enabled?: boolean; acceptError?: boolean } = {},
) {
  const app = new OpenAPIHono()
  const calls: string[] = []
  registerAssistantTelegramRoutes(app, {
    config: () => ({ ...config, enabled: options.enabled ?? true }),
    workerSecret: () => "worker-secret",
    accept: async (_, event) => {
      if (options.acceptError) throw Error("private database error")
      calls.push(`accept:${event.kind}:${event.updateId}`)
      if (event.kind === "message" && event.text === "/disconnect")
        return {
          notice: {
            text: "Disconnected",
            after: async (bot) => {
              await bot.unpinAllChatMessages(event.chatId)
            },
          },
        }
      if (event.kind === "message" && event.text === "/start claim")
        return {
          notice: {
            text: "Confirm <b>Shop</b>",
            html: true,
            buttons: [
              [
                {
                  text: "Open EwaTrade",
                  url: "https://dash.example/account/telegram",
                },
              ],
            ],
            onSent: async (messageId) => {
              calls.push(`recorded:${messageId}`)
            },
          },
        }
      if (event.kind === "callback" && event.data === "confirm:stale") return {}
      if (event.kind === "callback" && event.data.startsWith("tc:"))
        return {
          notice: {
            text: "<b>Your chats · Yaba</b>\nContinuing: <b>Today 9:12</b>",
            html: true,
            editMessageId: "17",
          },
        }
      if (
        (event.kind === "callback" && event.data.startsWith("tgx:")) ||
        event.kind === "member"
      )
        return {
          effects: async (bot) => {
            await bot.deleteMessage({ chatId: event.chatId, messageId: "17" })
          },
        }
      return { ingressId: "ingress-1" }
    },
    enqueueTurn: async (id) => {
      calls.push(`enqueue:${id}`)
    },
    processTurn: async (id) => {
      calls.push(`process:${id}`)
      return { status: "completed" }
    },
    processDelivery: async (id) => {
      calls.push(`deliver:${id}`)
      return { status: "sent" }
    },
    provider: () => ({
      answerCallbackQuery: async (id, toast) => {
        calls.push(`ack:${id}${toast ? `:${toast}` : ""}`)
        return true
      },
      sendMessage: async ({ text, html, buttons }) => {
        calls.push(
          `notice:${text}${html ? ":html" : ""}${buttons ? `:${buttons.length}` : ""}`,
        )
        return { status: "accepted", messageId: "5" }
      },
      editMessageText: async ({ messageId, text, html, buttons }) => {
        calls.push(
          `edit:${messageId}:${text}${html ? ":html" : ""}${buttons ? `:${buttons.length}` : ""}`,
        )
        return { status: "accepted", messageId }
      },
      deleteMessage: async ({ messageId }) => {
        calls.push(`delete:${messageId}`)
        return true
      },
      pinChatMessage: async () => true,
      unpinAllChatMessages: async (chatId) => {
        calls.push(`unpin:${chatId}`)
        return true
      },
      setChatCommands: async () => true,
    }),
  })
  return { app, calls }
}

const user = { id: 456, is_bot: false }
const message = {
  message_id: 17,
  date: 1_784_000_000,
  chat: { id: 456, type: "private" },
  from: user,
  text: "How many eggs?",
}
const callback = {
  update_id: 9,
  callback_query: { id: "10", from: user, message, data: "opaque" },
}
const postWebhook = (
  app: OpenAPIHono,
  update: unknown,
  secret = config.webhookSecret,
) =>
  app.request("/api/webhooks/telegram", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(update),
  })

test("authenticates Telegram and commits before scheduling or acknowledging the callback", async () => {
  const { app, calls } = createRoutes()
  expect((await postWebhook(app, callback, "wrong")).status).toBe(401)
  expect(calls).toEqual([])
  expect((await postWebhook(app, callback)).status).toBe(200)
  expect(calls).toEqual(["accept:callback:9", "enqueue:ingress-1", "ack:10"])
})

test("a queued review tap gets a toast for the tap; an ignored tap gets none", async () => {
  const { app, calls } = createRoutes()
  const tap = (data: string, update_id: number) => ({
    update_id,
    callback_query: { id: `cb-${update_id}`, from: user, message, data },
  })
  await postWebhook(app, tap("confirm:abc", 20))
  await postWebhook(app, tap("edit:abc", 21))
  await postWebhook(app, tap("confirm:stale", 22))
  expect(calls).toEqual([
    "accept:callback:20",
    "enqueue:ingress-1",
    "ack:cb-20:Saving…",
    "accept:callback:21",
    "enqueue:ingress-1",
    "ack:cb-21:Send your change",
    "accept:callback:22",
    "ack:cb-22",
  ])
})

test("leaves callback unacknowledged when persistence fails", async () => {
  const { app, calls } = createRoutes({ acceptError: true })
  const reply = await postWebhook(app, callback)
  expect(reply.status).toBe(503)
  expect(await reply.json()).toEqual({ code: "CHANNEL_UNAVAILABLE" })
  expect(calls).toEqual([])
})

test("disabled Telegram admits only signed disconnect", async () => {
  const { app, calls } = createRoutes({ enabled: false })
  expect((await postWebhook(app, { update_id: 8, message })).status).toBe(200)
  expect((await postWebhook(app, callback)).status).toBe(200)
  expect(
    (
      await postWebhook(app, {
        update_id: 10,
        message: { ...message, text: "/disconnect" },
      })
    ).status,
  ).toBe(200)
  expect(calls).toEqual([
    "accept:message:10",
    "notice:Disconnected",
    "unpin:456",
  ])
})

test("disabled Telegram still admits a signed Disconnect tap and Stop bot, and runs their chat effects", async () => {
  const { app, calls } = createRoutes({ enabled: false })
  const tap = {
    update_id: 30,
    callback_query: { ...callback.callback_query, data: "tgx:d:abc:sig" },
  }
  const stopped = {
    update_id: 31,
    my_chat_member: {
      chat: message.chat,
      from: user,
      date: message.date,
      old_chat_member: { status: "member" },
      new_chat_member: { status: "kicked" },
    },
  }
  expect((await postWebhook(app, tap)).status).toBe(200)
  expect((await postWebhook(app, stopped)).status).toBe(200)
  expect(calls).toEqual([
    "accept:callback:30",
    "delete:17",
    "ack:10",
    "accept:member:31",
    "delete:17",
  ])
})

test("sends HTML claim replies with buttons and records the sent message", async () => {
  const { app, calls } = createRoutes()
  const update = {
    update_id: 12,
    message: { ...message, text: "/start claim" },
  }
  expect((await postWebhook(app, update)).status).toBe(200)
  expect(calls).toEqual([
    "accept:message:12",
    "notice:Confirm <b>Shop</b>:html:1",
    "recorded:5",
  ])
})

test("a /chats pick edits the tapped list in place instead of sending", async () => {
  const { app, calls } = createRoutes()
  const tap = {
    update_id: 40,
    callback_query: {
      ...callback.callback_query,
      id: "cb-40",
      data: "tc:3:cm9x0abcdefghijklmnopqrs:abcdefghijkl",
    },
  }
  expect((await postWebhook(app, tap)).status).toBe(200)
  expect(calls).toEqual([
    "accept:callback:40",
    "ack:cb-40",
    "edit:17:<b>Your chats · Yaba</b>\nContinuing: <b>Today 9:12</b>:html",
  ])
})

test("worker accepts only authenticated, bounded identifier payloads", async () => {
  const { app, calls } = createRoutes()
  const work = (route: string, data: unknown, secret = "worker-secret") =>
    app.request(`/api/internal/assistant/telegram-${route}`, {
      method: "POST",
      headers: { "x-internal-key": secret },
      body: JSON.stringify(data),
    })
  expect((await work("turn", { ingressId: "1" }, "wrong")).status).toBe(401)
  expect(
    (await work("turn", { ingressId: "1", tenantId: "injected" })).status,
  ).toBe(400)
  expect((await work("turn", { ingressId: "a".repeat(600) })).status).toBe(413)
  expect(await (await work("turn", { ingressId: "1" })).json()).toEqual({
    status: "completed",
  })
  expect(await (await work("delivery", { outboxId: "2" })).json()).toEqual({
    status: "sent",
  })
  expect(calls).toEqual(["process:1", "deliver:2"])
})
