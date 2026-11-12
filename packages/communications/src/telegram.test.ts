import { expect, test } from "bun:test"
import {
  DirectTelegramBotProvider,
  isAssistantTelegramEnrolled,
  parseAssistantTelegramUpdate,
  readAssistantTelegramConfig,
  readAssistantTelegramWebhookConfig,
} from "./telegram"

const environment = {
  ASSISTANT_TELEGRAM_ENABLED: "true",
  ASSISTANT_TELEGRAM_BOT_ID: "123",
  ASSISTANT_TELEGRAM_BOT_USERNAME: "ewatrade_test_bot",
  ASSISTANT_TELEGRAM_BOT_TOKEN: "123:synthetic_test_token_123456789",
  ASSISTANT_TELEGRAM_WEBHOOK_SECRET: "synthetic_test_webhook_secret",
  ASSISTANT_TELEGRAM_PILOT_USER_IDS: "person-1, person-2",
  ASSISTANT_TELEGRAM_PILOT_TENANT_IDS: "tenant-1",
}
const config = { token: environment.ASSISTANT_TELEGRAM_BOT_TOKEN }

const message = {
  message_id: 17,
  date: 1_784_000_000,
  from: { id: 4_501_234_567_890, is_bot: false, username: "ignored" },
  chat: { id: 4_501_234_567_890, type: "private" },
  text: "  How many eggs? ",
}

test("requires a matching bot token and explicit user and tenant enrollment", () => {
  const configured = readAssistantTelegramConfig(environment)
  expect(configured).not.toBeNull()
  if (!configured) throw Error("Expected Telegram configuration")
  expect(
    isAssistantTelegramEnrolled(configured, {
      userId: "person-2",
      tenantId: "tenant-1",
    }),
  ).toBe(true)
  expect(
    isAssistantTelegramEnrolled(configured, {
      userId: "person-2",
      tenantId: "elsewhere",
    }),
  ).toBe(false)
  expect(
    readAssistantTelegramConfig({
      ...environment,
      ASSISTANT_TELEGRAM_BOT_ID: "124",
    }),
  ).toBeNull()
  const disabled = { ...environment, ASSISTANT_TELEGRAM_ENABLED: "false" }
  expect(readAssistantTelegramConfig(disabled)).toBeNull()
  expect(readAssistantTelegramWebhookConfig(disabled)?.enabled).toBe(false)
})

test("extracts private sender, chat, message and callback provenance", () => {
  expect(parseAssistantTelegramUpdate({ update_id: 8, message })).toEqual({
    updateId: "8",
    chatId: "4501234567890",
    userId: "4501234567890",
    messageId: "17",
    occurredAt: new Date(message.date * 1000),
    kind: "message",
    text: "How many eggs?",
  })

  expect(
    parseAssistantTelegramUpdate({
      update_id: 9,
      callback_query: {
        id: "10",
        from: message.from,
        message: { ...message, from: { id: 123, is_bot: true } },
        data: "opaque",
      },
    }),
  ).toMatchObject({
    updateId: "9",
    userId: "4501234567890",
    messageId: "17",
    kind: "callback",
    callbackId: "10",
    data: "opaque",
  })
})

test("ignores public chats, inaccessible reviews, bot authors and overlong callback data", () => {
  for (const event of [
    { message: { ...message, chat: { type: "group", id: -1 } } },
    { message: { ...message, from: { id: 123, is_bot: true } } },
    {
      callback_query: {
        from: message.from,
        id: "10",
        message: { ...message, date: 0 },
        data: "opaque",
      },
    },
    {
      callback_query: {
        from: message.from,
        id: "10",
        message,
        data: "🎉".repeat(17),
      },
    },
  ]) {
    expect(parseAssistantTelegramUpdate({ update_id: 8, ...event })).toBeNull()
  }
})

test("sends plain text and opaque inline controls and classifies Telegram outcomes", async () => {
  const sendMessage = {
    chatId: "456",
    text: "<b>Review</b>",
    buttons: [[{ text: "Confirm", callbackData: "opaque" }]],
  }
  const send = async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(String(url)).toEndWith("/sendMessage")
    expect(init?.redirect).toBe("error")
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: 456,
      text: "<b>Review</b>",
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [[{ text: "Confirm", callback_data: "opaque" }]],
      },
    })
    return Response.json({ ok: true, result: { message_id: 55 } })
  }
  const provider = new DirectTelegramBotProvider(config, send)
  expect(await provider.sendMessage(sendMessage)).toEqual({
    status: "accepted",
    messageId: "55",
  })

  for (const [status, expected] of [
    [429, { status: "retry", retryAfterMs: 9000 }],
    [403, { status: "failed" }],
    [500, { status: "uncertain" }],
  ] as const) {
    const throttled = new DirectTelegramBotProvider(config, async () =>
      Response.json({ ok: false, parameters: { retry_after: 9 } }, { status }),
    )
    expect(await throttled.sendMessage(sendMessage)).toEqual(expected)
  }
  const timeout = new DirectTelegramBotProvider(config, async () => {
    throw Error("private provider error")
  })
  expect(await timeout.sendMessage(sendMessage)).toEqual({
    status: "uncertain",
  })
})

test("clears only the original message's inline keyboard and accepts a repeated edit", async () => {
  const target = { chatId: "456", messageId: "55" }
  const provider = new DirectTelegramBotProvider(config, async (url, init) => {
    expect(url).toEndWith("/editMessageReplyMarkup")
    expect(JSON.parse(String(init.body))).toEqual({
      chat_id: 456,
      message_id: 55,
      reply_markup: { inline_keyboard: [] },
    })
    return Response.json({ ok: true, result: { message_id: 55 } })
  })
  const repeated = new DirectTelegramBotProvider(config, async () =>
    Response.json(
      { ok: false, description: "Bad Request: message is not modified" },
      { status: 400 },
    ),
  )
  const accepted = { status: "accepted", messageId: target.messageId }
  expect(await provider.clearInlineKeyboard(target)).toEqual(accepted)
  expect(await repeated.clearInlineKeyboard(target)).toEqual(accepted)
  expect(
    await provider.clearInlineKeyboard({ ...target, messageId: "invalid" }),
  ).toEqual({ status: "failed" })
})
