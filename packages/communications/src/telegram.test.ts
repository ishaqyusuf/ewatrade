import { expect, test } from "bun:test"
import {
  DirectTelegramBotProvider,
  escapeTelegramHtml,
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
    sender: { name: null, username: "ignored" },
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

test("sends a cancellable typing action only to a valid private chat", async () => {
  const requests: RequestInit[] = []
  const controller = new AbortController()
  const provider = new DirectTelegramBotProvider(config, async (url, init) => {
    expect(new URL(url).pathname.endsWith("/sendChatAction")).toBe(true)
    requests.push(init)
    return Response.json({ ok: true, result: true })
  })
  expect(await provider.sendTyping("-17")).toBe(false)
  expect(
    await provider.sendTyping(String(message.chat.id), controller.signal),
  ).toBe(true)
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({
    method: "POST",
    body: JSON.stringify({ chat_id: message.chat.id, action: "typing" }),
  })
  controller.abort()
  expect(requests[0]?.signal?.aborted).toBe(true)
  expect(
    await provider.sendTyping(String(message.chat.id), controller.signal),
  ).toBe(false)
  expect(requests).toHaveLength(1)
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

test("reads a bounded profile label from Start and escapes HTML text", () => {
  const start = {
    ...message,
    text: "/start",
    from: {
      id: 4_501_234_567_890,
      is_bot: false,
      first_name: " Ada ",
      last_name: "Okafor",
      username: "ada_provisions",
    },
  }
  const parsed = parseAssistantTelegramUpdate({ update_id: 11, message: start })
  expect(parsed?.kind === "message" && parsed.sender).toEqual({
    name: "Ada Okafor",
    username: "ada_provisions",
  })
  expect(escapeTelegramHtml("Ada & <Sons>")).toBe("Ada &amp; &lt;Sons&gt;")
})

test("edits, pins and scopes commands with exact Bot API payloads", async () => {
  const calls: { method: string; body: Record<string, unknown> }[] = []
  const provider = new DirectTelegramBotProvider(config, async (url, init) => {
    const method = String(url).split("/").pop() ?? ""
    calls.push({ method, body: JSON.parse(String(init.body)) })
    return Response.json(
      method === "editMessageText"
        ? { ok: true, result: { message_id: 41 } }
        : { ok: true, result: true },
    )
  })
  const target = { chatId: "4501234567890", messageId: "41" }
  expect(
    await provider.editMessageText({
      ...target,
      text: "<b>Connected ✓</b>",
      html: true,
    }),
  ).toEqual({ status: "accepted", messageId: "41" })
  expect(await provider.pinChatMessage(target)).toBe(true)
  expect(
    await provider.setChatCommands(target.chatId, [
      { command: "scope", description: "Your Business and Store" },
    ]),
  ).toBe(true)
  expect(await provider.setChatCommands(target.chatId, null)).toBe(true)
  expect(await provider.unpinAllChatMessages(target.chatId)).toBe(true)
  expect(calls.map(({ method }) => method)).toEqual([
    "editMessageText",
    "pinChatMessage",
    "setMyCommands",
    "deleteMyCommands",
    "unpinAllChatMessages",
  ])
  expect(calls[0]?.body).toMatchObject({
    chat_id: 4501234567890,
    message_id: 41,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [] },
  })
  expect(calls[1]?.body).toMatchObject({ disable_notification: true })
  expect(calls[2]?.body).toMatchObject({
    scope: { type: "chat", chat_id: 4501234567890 },
  })
  expect(
    await provider.setChatCommands(target.chatId, [
      { command: "Bad-Command", description: "x" },
    ]),
  ).toBe(false)
  expect(calls).toHaveLength(5)
})

test("reads forwarded origins and Stop bot or RESTART member updates", () => {
  const forwarded = (extra: Record<string, unknown>) => {
    const parsed = parseAssistantTelegramUpdate({
      update_id: 12,
      message: { ...message, ...extra },
    })
    return parsed?.kind === "message" ? parsed.forward : "not a message"
  }
  expect(forwarded({})).toBeUndefined()
  expect(
    forwarded({
      forward_origin: {
        type: "user",
        date: message.date,
        sender_user: { id: 123, is_bot: true },
      },
    }),
  ).toEqual({ userId: "123", isBot: true })
  expect(
    forwarded({
      forward_origin: {
        type: "hidden_user",
        date: message.date,
        sender_user_name: "Kemi",
      },
    }),
  ).toEqual({ userId: null, isBot: false })
  expect(
    forwarded({ forward_from: { id: 77, is_bot: false }, forward_date: 1 }),
  ).toEqual({ userId: "77", isBot: false })

  const member = (before: string, after: string, extra = {}) =>
    parseAssistantTelegramUpdate({
      update_id: 13,
      my_chat_member: {
        chat: message.chat,
        from: message.from,
        date: message.date,
        old_chat_member: { status: before, user: { id: 123, is_bot: true } },
        new_chat_member: { status: after, user: { id: 123, is_bot: true } },
        ...extra,
      },
    })
  expect(member("member", "kicked")).toEqual({
    updateId: "13",
    chatId: "4501234567890",
    userId: "4501234567890",
    occurredAt: new Date(message.date * 1000),
    kind: "member",
    status: "stopped",
  })
  expect(member("kicked", "member")).toMatchObject({ status: "restarted" })
  expect(member("member", "member")).toBeNull()
  expect(
    member("member", "kicked", { chat: { id: -5, type: "group" } }),
  ).toBeNull()
  expect(
    member("member", "kicked", { from: { id: 99, is_bot: false } }),
  ).toBeNull()
  expect(
    parseAssistantTelegramUpdate({
      update_id: 14,
      message,
      my_chat_member: { chat: message.chat },
    }),
  ).toBeNull()
})

test("deletes one message in a valid private chat", async () => {
  const calls: { method: string; body: Record<string, unknown> }[] = []
  const provider = new DirectTelegramBotProvider(config, async (url, init) => {
    calls.push({
      method: String(url).split("/").pop() ?? "",
      body: JSON.parse(String(init.body)),
    })
    return Response.json({ ok: true, result: true })
  })
  expect(
    await provider.deleteMessage({ chatId: "4501234567890", messageId: "18" }),
  ).toBe(true)
  expect(await provider.deleteMessage({ chatId: "-1", messageId: "18" })).toBe(
    false,
  )
  expect(calls).toEqual([
    {
      method: "deleteMessage",
      body: { chat_id: 4501234567890, message_id: 18 },
    },
  ])
})
