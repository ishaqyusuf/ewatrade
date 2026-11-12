import { expect, test } from "bun:test"
import type { WhatsAppActionReview } from "@ewatrade/assistant/channels/action-review"
import { renderWhatsAppActionReviewBody } from "@ewatrade/assistant/channels/action-review"
import type { TelegramSendResult } from "@ewatrade/communications"
import {
  type TelegramDeliveryBot,
  deliverTelegramOutboxPayload,
  renderTelegramActionReviewBody,
  telegramCallbackPattern,
  telegramCallbackToast,
  telegramDecidedReview,
  telegramReviewDigest,
  telegramReviewExpiry,
  telegramReviewStatus,
} from "./telegram-review"

const review: WhatsAppActionReview = {
  source: {
    proposalId: "proposal-1",
    revision: 1,
    payloadHash: "c".repeat(64),
  },
  title: "Record sale",
  businessName: "Mama Ada Provisions",
  storeName: "Yaba Main",
  reviewLines: ["Records the money for this sale. Stock isn't changed."],
  complete: true,
  requiresPresentation: true,
  // 09:50 in Lagos (UTC+1).
  expiresAt: "2026-11-12T08:50:00.000Z",
  presentation: {
    summary: {
      party: "Chinedu Eze",
      amount: "₦156,000",
      amountLabel: "Full price",
    },
    facts: [
      { label: "Received now", value: "₦150,000 cash" },
      { label: "Into", value: "Cash till (Yaba)" },
    ],
  },
}

test("Telegram reviews read Draft N, local expiry and one blank line between blocks", () => {
  expect(
    renderTelegramActionReviewBody(review, { timeZone: "Africa/Lagos" }),
  ).toEqual({
    source: review.source,
    body: [
      "Record sale",
      "",
      "Business: Mama Ada Provisions",
      "Store: Yaba Main",
      "Draft 1",
      "",
      "Chinedu Eze",
      "Full price: ₦156,000",
      "Received now: ₦150,000 cash",
      "Into: Cash till (Yaba)",
      "Records the money for this sale. Stock isn't changed.",
      "",
      "Review expires: 9:50 AM",
    ].join("\n"),
  })
})

test("WhatsApp keeps its own review layout", () => {
  const body = renderWhatsAppActionReviewBody(review, {
    now: Date.parse("2026-11-12T08:46:00.000Z"),
  })
  expect(body.kind).toBe("review")
  expect(body.body).toContain("Draft revision: 1\n\nChinedu Eze")
  expect(body.body).toContain("Review expires: 2026-11-12T08:50:00.000Z (UTC).")
})

test("Telegram reviews keep the canonical exactness rules", () => {
  const options = { timeZone: "Africa/Lagos" }
  expect(
    renderTelegramActionReviewBody({ ...review, complete: false }, options),
  ).toBeNull()
  expect(
    renderTelegramActionReviewBody(
      { ...review, presentation: undefined },
      options,
    ),
  ).toBeNull()
  expect(
    renderTelegramActionReviewBody(
      { ...review, reviewLines: ["See https://example.com"] },
      options,
    ),
  ).toBeNull()
  expect(
    renderTelegramActionReviewBody(
      { ...review, reviewLines: ["x".repeat(2000), "y".repeat(600)] },
      options,
    ),
  ).toBeNull()
  expect(renderTelegramActionReviewBody({ title: "x" }, options)).toBeNull()
})

test("expiry uses the Business time zone, or labelled UTC", () => {
  const at = new Date("2026-11-12T13:05:00.000Z")
  expect(telegramReviewExpiry(at, "Africa/Lagos")).toBe("2:05 PM")
  expect(telegramReviewExpiry(at, "Not/AZone")).toBe("1:05 PM UTC")
})

test("a decided review keeps its facts and adds one status line", () => {
  const body = renderTelegramActionReviewBody(review, {
    timeZone: "Africa/Lagos",
  })?.body as string
  expect(telegramDecidedReview(body, telegramReviewStatus.confirmed)).toBe(
    `${body}\n\n✓ Confirmed`,
  )
  expect(Object.values(telegramReviewStatus)).toEqual([
    "✓ Confirmed",
    "Cancelled · nothing was saved",
    "Expired · nothing was saved",
    "Not saved · this draft changed",
  ])
  expect(telegramReviewDigest(body)).toMatch(/^[a-f0-9]{64}$/)
})

test("callback toasts describe the tap, never an outcome", () => {
  expect(telegramCallbackToast("confirm:abc")).toBe("Saving…")
  expect(telegramCallbackToast("edit:abc")).toBe("Send your change")
  expect(telegramCallbackToast("cancel:abc")).toBe("Cancelling…")
  expect(telegramCallbackToast("again:abc")).toBe("Getting a fresh review…")
  expect(telegramCallbackToast("pay:abc")).toBeUndefined()
  expect(telegramCallbackToast("confirm:")).toBeUndefined()
  expect(telegramCallbackPattern.test("again:abc_DEF-123")).toBe(true)
  expect(telegramCallbackPattern.test("again:a b")).toBe(false)
})

function recordingBot(
  result: TelegramSendResult = {
    status: "accepted",
    messageId: "77",
  },
) {
  const calls: Array<[string, unknown]> = []
  const bot: TelegramDeliveryBot = {
    sendMessage: async (input) => {
      calls.push(["sendMessage", input])
      return result
    },
    editMessageText: async (input) => {
      calls.push(["editMessageText", input])
      return result
    },
    clearInlineKeyboard: async (input) => {
      calls.push(["clearInlineKeyboard", input])
      return result
    },
  }
  return { bot, calls }
}

test("delivery edits a decided review in place with editMessageText", async () => {
  const { bot, calls } = recordingBot({ status: "uncertain" })
  const delivered = await deliverTelegramOutboxPayload(bot, "42", {
    editMessageId: "77",
    text: "Record sale\n\n✓ Confirmed",
  })
  expect(delivered).toEqual({ edit: true, result: { status: "uncertain" } })
  expect(calls).toEqual([
    [
      "editMessageText",
      { chatId: "42", messageId: "77", text: "Record sale\n\n✓ Confirmed" },
    ],
  ])
})

test("delivery still clears a keyboard when the review body is unproven", async () => {
  const { bot, calls } = recordingBot()
  const delivered = await deliverTelegramOutboxPayload(bot, "42", {
    clearKeyboardMessageId: "77",
  })
  expect(delivered.edit).toBe(true)
  expect(calls).toEqual([
    ["clearInlineKeyboard", { chatId: "42", messageId: "77" }],
  ])
})

test("delivery sends receipts as a reply to the review", async () => {
  const { bot, calls } = recordingBot()
  const delivered = await deliverTelegramOutboxPayload(bot, "42", {
    text: "Saved in EwaTrade.",
    replyToMessageId: "77",
    buttons: [
      [
        { text: "Review it again", data: "again:abc" },
        { text: "Open", url: "https://dash.ewatrade.com/x" },
      ],
    ],
  })
  expect(delivered).toEqual({
    edit: false,
    result: { status: "accepted", messageId: "77" },
  })
  expect(calls).toEqual([
    [
      "sendMessage",
      {
        chatId: "42",
        text: "Saved in EwaTrade.",
        replyToMessageId: "77",
        buttons: [
          [
            { text: "Review it again", callbackData: "again:abc" },
            { text: "Open", url: "https://dash.ewatrade.com/x" },
          ],
        ],
      },
    ],
  ])
})
