import { expect, test } from "bun:test"
import type { AssistantTelegramConfig } from "@ewatrade/communications"
import type { GeneralContext } from "./general-context"
import {
  showTelegramHandoffOutcome,
  telegramHandoffCopy,
  telegramHandoffOutcome,
} from "./telegram-handoff"

const config: AssistantTelegramConfig = {
  enabled: true,
  botId: "123",
  username: "ewatrade_test_bot",
  token: "123:synthetic_test_token_123456789",
  webhookSecret: "synthetic_test_webhook_secret",
  allowedUserIds: new Set(["person-1"]),
  allowedTenantIds: new Set(["tenant-1"]),
}
const message = {
  botId: "123",
  chatId: "4501234567890",
  messageId: "77",
  outboxId: "outbox-1",
  tenantId: "tenant-1",
  storeId: "store-1",
  conversationId: "conversation-1",
}
const ctx = {} as GeneralContext
const actor = () => ({ userId: "person-1", tenantId: "tenant-1" })
const completed = {
  id: "proposal-1",
  status: "COMPLETED" as const,
  payload: { action: "stock_receive" },
  receipt: {
    title: "Stock received",
    detail: "+20 Rice 50kg bag · now 23 at Yaba Main",
  },
} as never
const withDashboard = async (url: string, run: () => Promise<void>) => {
  const previous = process.env.DASHBOARD_URL
  process.env.DASHBOARD_URL = url
  try {
    await run()
  } finally {
    process.env.DASHBOARD_URL = previous
  }
}

test("x-review: approval in EwaTrade turns the link message into the receipt, without a button", () => {
  const outcome = telegramHandoffOutcome(completed, message)
  expect(outcome?.text).toStartWith("Saved in EwaTrade.")
  expect(outcome?.text).toContain("+20 Rice 50kg bag · now 23 at Yaba Main")
  expect(outcome?.buttons).toBeUndefined()
})

test("x-link-cancel: cancelling in EwaTrade says nothing was saved", () => {
  expect(
    telegramHandoffOutcome(
      { ...(completed as object), status: "CANCELLED", receipt: null } as never,
      message,
    ),
  ).toEqual({ text: telegramHandoffCopy.cancelled })
})

test("x-link-edited: an edit keeps one live button that opens the latest revision", async () => {
  await withDashboard("https://dash.example.test", async () => {
    expect(
      telegramHandoffOutcome(
        { ...(completed as object), status: "PENDING", receipt: null } as never,
        message,
      ),
    ).toEqual({
      text: telegramHandoffCopy.updated,
      buttons: [
        [
          {
            text: "Review in EwaTrade",
            url: "https://dash.example.test/assistant/c/conversation-1?proposalId=proposal-1",
          },
        ],
      ],
    })
  })
  await withDashboard("http://localhost:3000", async () => {
    expect(
      telegramHandoffOutcome(
        { ...(completed as object), status: "PENDING", receipt: null } as never,
        message,
      ),
    ).toBeNull()
  })
  for (const status of ["FAILED", "EXPIRED", "EXECUTING"])
    expect(
      telegramHandoffOutcome(
        { ...(completed as object), status } as never,
        message,
      ),
    ).toBeNull()
})

test("edits the newest link message for this bot, and never throws", async () => {
  const edits: unknown[] = []
  const bot = {
    editMessageText: async (input: unknown) => {
      edits.push(input)
      return { status: "accepted" as const, messageId: "77" }
    },
  }
  const reads: unknown[] = []
  expect(
    await showTelegramHandoffOutcome(ctx, completed, {
      config: () => config,
      actor,
      readMessages: async (input) => {
        reads.push(input)
        return [
          { ...message, botId: "999", messageId: "90" },
          message,
          { ...message, messageId: "60" },
        ]
      },
      bot,
    }),
  ).toBe(true)
  expect(reads).toEqual([
    { proposalId: "proposal-1", tenantId: "tenant-1", actorUserId: "person-1" },
  ])
  expect(edits).toEqual([
    {
      chatId: "4501234567890",
      messageId: "77",
      text: expect.stringContaining("Saved in EwaTrade."),
    },
  ])

  const failing = {
    editMessageText: async () => {
      throw Error("network")
    },
  }
  expect(
    await showTelegramHandoffOutcome(ctx, completed, {
      config: () => config,
      actor,
      readMessages: async () => [message],
      bot: failing as never,
    }),
  ).toBe(false)
  expect(
    await showTelegramHandoffOutcome(ctx, completed, {
      config: () => config,
      actor,
      readMessages: async () => {
        throw Error("database")
      },
      bot,
    }),
  ).toBe(false)
})

test("does nothing when Telegram is off, outside the pilot or without a link message", async () => {
  const bot = {
    editMessageText: async () => {
      throw Error("must not edit")
    },
  }
  const readMessages = async () => [message]
  expect(
    await showTelegramHandoffOutcome(ctx, completed, {
      config: () => null,
      actor,
      readMessages,
      bot,
    }),
  ).toBe(false)
  expect(
    await showTelegramHandoffOutcome(ctx, completed, {
      config: () => ({ ...config, allowedUserIds: new Set() }),
      actor,
      readMessages,
      bot,
    }),
  ).toBe(false)
  expect(
    await showTelegramHandoffOutcome(ctx, completed, {
      config: () => config,
      actor,
      readMessages: async () => [],
      bot,
    }),
  ).toBe(false)
})
