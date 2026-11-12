import { expect, test } from "bun:test"
import {
  isTelegramChatCallback,
  parseTelegramChatCallback,
  telegramChatCallbackData,
  telegramChatLabel,
  telegramChatsCopy,
} from "./telegram-chats"
import { isTelegramChoiceCallback } from "./telegram-render"

test("chat callbacks are signed per binding and fit in 64 bytes", () => {
  const chat = "cm9x0abcdefghijklmnopqrs"
  const data = telegramChatCallbackData("secret", "binding-1", 123456789, chat)
  expect(data).toBeDefined()
  expect(Buffer.byteLength(data ?? "")).toBeLessThanOrEqual(64)
  expect(parseTelegramChatCallback(data ?? "")).toMatchObject({
    generation: 123456789,
    target: chat,
  })
  // Another binding, generation or secret gives another signature.
  expect(
    telegramChatCallbackData("secret", "binding-2", 123456789, chat),
  ).not.toBe(data)
  expect(telegramChatCallbackData("secret", "binding-1", 2, chat)).not.toBe(
    telegramChatCallbackData("secret", "binding-1", 3, chat),
  )
  expect(
    telegramChatCallbackData("other", "binding-1", 123456789, chat),
  ).not.toBe(data)
  expect(telegramChatCallbackData("secret", "b", 1, "new")).toMatch(
    /^tc:1:new:/,
  )
  // Over-long or unsafe chat ids never become callback data.
  expect(
    telegramChatCallbackData("secret", "b", 1, "x".repeat(40)),
  ).toBeUndefined()
  expect(telegramChatCallbackData("secret", "b", 1, "a:b")).toBeUndefined()
  expect(isTelegramChatCallback("confirm:abc")).toBe(false)
  expect(parseTelegramChatCallback("tc:1:new")).toBeNull()
})

test("chat labels read Today, Yesterday or a date in the Business time zone", () => {
  const now = new Date("2026-10-20T08:42:00Z")
  const zone = "Africa/Lagos"
  expect(
    telegramChatLabel(
      { title: "stock questions", updatedAt: new Date("2026-10-20T08:12:00Z") },
      now,
      zone,
    ),
  ).toBe("Today 9:12 · stock questions")
  expect(
    telegramChatLabel(
      {
        title: "sale draft for Chinedu",
        updatedAt: new Date("2026-10-19T15:00:00Z"),
      },
      now,
      zone,
    ),
  ).toBe("Yesterday · sale draft for Chinedu")
  expect(
    telegramChatLabel(
      { title: null, updatedAt: new Date("2026-10-14T10:00:00Z") },
      now,
      zone,
    ),
  ).toBe("14 Oct · New chat")
  const long = telegramChatLabel(
    { title: "q".repeat(200), updatedAt: now },
    now,
    zone,
  )
  expect(long.length).toBeLessThanOrEqual(60)
})

test("chat copy escapes Store and chat names", () => {
  expect(telegramChatsCopy.list("A&B <Shop>")).toBe(
    "<b>Your chats · A&amp;B &lt;Shop&gt;</b>\nPick one to continue. Each keeps its own drafts.",
  )
  expect(telegramChatsCopy.continuing("Yaba", "Today 9:12 · <x>")).toContain(
    "Continuing: <b>Today 9:12 · &lt;x&gt;</b>",
  )
})

test("only ch:1 to ch:3 are choice callbacks", () => {
  expect(isTelegramChoiceCallback("ch:1")).toBe(true)
  expect(isTelegramChoiceCallback("ch:3")).toBe(true)
  expect(isTelegramChoiceCallback("ch:4")).toBe(false)
  expect(isTelegramChoiceCallback("ch:1:x")).toBe(false)
})
