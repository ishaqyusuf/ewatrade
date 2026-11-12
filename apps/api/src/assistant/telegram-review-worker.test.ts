import { afterAll, beforeEach, expect, mock, test } from "bun:test"
import type { TelegramOutboxPayload } from "@ewatrade/db/assistant-telegram"

/**
 * Phase 4 delivery worker: a decided review is edited in place with
 * editMessageText, an uncertain edit is retried (edits are idempotent), and a
 * receipt goes out as a reply to its review.
 */
const environment = {
  ASSISTANT_TELEGRAM_ENABLED: "true",
  ASSISTANT_TELEGRAM_BOT_ID: "123",
  ASSISTANT_TELEGRAM_BOT_USERNAME: "ewatrade_test_bot",
  ASSISTANT_TELEGRAM_BOT_TOKEN: "123:synthetic_test_token_123456789",
  ASSISTANT_TELEGRAM_WEBHOOK_SECRET: "synthetic_test_webhook_secret",
  ASSISTANT_TELEGRAM_PILOT_USER_IDS: "user-1",
  ASSISTANT_TELEGRAM_PILOT_TENANT_IDS: "tenant-1",
}
const previous = new Map(
  Object.keys(environment).map((key) => [key, process.env[key]]),
)
Object.assign(process.env, environment)
afterAll(() => {
  for (const [key, value] of previous)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
})

let payload: TelegramOutboxPayload = { text: "unset" }
const settled: unknown[] = []
const real = await import("@ewatrade/db/assistant-telegram")
mock.module("@ewatrade/db/assistant-telegram", () => ({
  ...real,
  claimAssistantTelegramOutbox: async () => ({
    lease: { outboxId: "outbox-1", owner: "owner", generation: 1 },
    principal: { botId: "123", userId: "42", chatId: "42" },
    payload,
  }),
  assertAssistantTelegramDeliveryAuthority: async () => ({
    scope: { userId: "user-1", tenantId: "tenant-1" },
  }),
  settleAssistantTelegramOutbox: async (
    _db: unknown,
    _lease: unknown,
    result: unknown,
  ) => {
    settled.push(result)
    return true
  },
  nextAssistantTelegramOutbox: async () => null,
}))
const { processAssistantTelegramDelivery } = await import("./telegram-runtime")

const calls: Array<[string, unknown]> = []
const deps = (status: "accepted" | "uncertain") => {
  const result =
    status === "accepted"
      ? ({ status, messageId: "77" } as const)
      : ({ status } as const)
  return {
    send: async (input: unknown) => {
      calls.push(["sendMessage", input])
      return result
    },
    editMessageText: async (input: unknown) => {
      calls.push(["editMessageText", input])
      return result
    },
    clearInlineKeyboard: async (input: unknown) => {
      calls.push(["clearInlineKeyboard", input])
      return result
    },
  }
}

beforeEach(() => {
  calls.length = 0
  settled.length = 0
})

test("a decided review is edited in place and settles as sent", async () => {
  payload = { editMessageId: "77", text: "Record sale\n\n✓ Confirmed" }
  expect(
    await processAssistantTelegramDelivery("outbox-1", deps("accepted")),
  ).toEqual({ status: "sent" })
  expect(calls).toEqual([
    [
      "editMessageText",
      { chatId: "42", messageId: "77", text: "Record sale\n\n✓ Confirmed" },
    ],
  ])
  expect(settled).toEqual([{ status: "sent", providerMessageId: "77" }])
})

test("an uncertain review edit is retried, never settled as unknown", async () => {
  payload = { editMessageId: "77", text: "Record sale\n\n✓ Confirmed" }
  expect(
    await processAssistantTelegramDelivery("outbox-1", deps("uncertain")),
  ).toEqual({ status: "busy" })
  expect(settled).toEqual([
    expect.objectContaining({
      status: "retry",
      errorCode: "REVIEW_EDIT_UNCERTAIN",
    }),
  ])
})

test("an unproven review still only loses its keyboard", async () => {
  payload = { clearKeyboardMessageId: "77" }
  expect(
    await processAssistantTelegramDelivery("outbox-1", deps("uncertain")),
  ).toEqual({ status: "busy" })
  expect(calls).toEqual([
    ["clearInlineKeyboard", { chatId: "42", messageId: "77" }],
  ])
  expect(settled).toEqual([
    expect.objectContaining({ errorCode: "KEYBOARD_EDIT_UNCERTAIN" }),
  ])
})

test("a receipt replies to its review; an uncertain send is never repeated", async () => {
  payload = { text: "Saved in EwaTrade.", replyToMessageId: "77" }
  expect(
    await processAssistantTelegramDelivery("outbox-1", deps("uncertain")),
  ).toEqual({ status: "unknown" })
  expect(calls).toEqual([
    [
      "sendMessage",
      {
        chatId: "42",
        text: "Saved in EwaTrade.",
        replyToMessageId: "77",
        buttons: undefined,
      },
    ],
  ])
  expect(settled).toEqual([{ status: "unknown" }])
})
