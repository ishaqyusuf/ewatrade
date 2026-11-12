import { expect, test } from "bun:test"
import {
  type AssistantTelegramConfig,
  type NormalizedAssistantTelegramUpdate,
  parseAssistantTelegramUpdate,
} from "@ewatrade/communications"
import {
  type TelegramControlDependencies,
  type TelegramControlEffects,
  acceptTelegramControl,
  signTelegramControl,
  telegramControlCopy,
  telegramTypedDecision,
  telegramTypedDecisionReply,
  verifyTelegramControl,
} from "./telegram-control"

process.env.DASHBOARD_URL = "https://dash.example"

const config: AssistantTelegramConfig = {
  enabled: true,
  botId: "123",
  username: "ewatrade_test_bot",
  token: "123:synthetic_test_token_123456789",
  webhookSecret: "synthetic_test_webhook_secret",
  allowedUserIds: new Set(["member"]),
  allowedTenantIds: new Set(["tenant"]),
}
const chat = { botId: "123", chatId: "456", userId: "456" }
const now = new Date("2026-11-12T10:00:00Z")
const business = { businessName: "Mama Ada & Sons", storeName: "Yaba Main" }
const pinned = { ...business, chatId: "456", messageId: "3" }

function harness(state: { connected?: boolean; revoked?: boolean } = {}) {
  const calls: string[] = []
  const deps: TelegramControlDependencies = {
    disconnect: async (input) => {
      calls.push(`disconnect:${input.updateId}:${input.messageId ?? "-"}`)
      return state.revoked === false
        ? { revoked: false }
        : { revoked: true, connectedMessage: pinned }
    },
    readConnection: async () => (state.connected === false ? null : business),
    readStoppedChatMessage: async () =>
      state.connected === false ? pinned : null,
    now: () => now,
  }
  const bot: TelegramControlEffects = {
    editMessageText: async (input) => {
      calls.push(
        `edit:${input.messageId}:${input.text}${input.buttons ? `:${input.buttons.flat().map((b) => b.text)}` : ""}`,
      )
      return { status: "accepted", messageId: input.messageId }
    },
    deleteMessage: async (input) => {
      calls.push(`delete:${input.messageId}`)
      return true
    },
    pinChatMessage: async () => true,
    unpinAllChatMessages: async () => {
      calls.push("unpin")
      return true
    },
    setChatCommands: async (_, commands) => {
      calls.push(`commands:${commands ? "linked" : "default"}`)
      return true
    },
  } as TelegramControlEffects
  return { calls, deps, bot }
}

const message = (
  text: string,
  extra: Record<string, unknown> = {},
): NormalizedAssistantTelegramUpdate => ({
  ...chat,
  updateId: "20",
  messageId: "21",
  occurredAt: now,
  kind: "message",
  text,
  ...extra,
})
const callback = (data: string): NormalizedAssistantTelegramUpdate => ({
  ...chat,
  updateId: "30",
  messageId: "31",
  occurredAt: now,
  kind: "callback",
  callbackId: "cb",
  data,
})

test("k-disc: /disconnect asks first with signed Disconnect and Keep connected", async () => {
  const { calls, deps } = harness()
  const receipt = await acceptTelegramControl(
    config,
    message("/disconnect"),
    deps,
  )
  expect(calls).toEqual([])
  expect(receipt?.notice?.text).toBe(
    "<b>Disconnect Telegram?</b>\nThis chat will stop working with <b>Mama Ada &amp; Sons · Yaba Main</b>.\n\nChats and drafts stay in EwaTrade.",
  )
  const [disconnect, keep] = receipt?.notice?.buttons ?? []
  expect(disconnect?.[0]?.text).toBe("Disconnect")
  expect(keep?.[0]?.text).toBe("Keep connected")
  const data = disconnect?.[0]?.callbackData ?? ""
  expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
  expect(verifyTelegramControl(config, chat, data, now)).toEqual({
    action: "d",
    expired: false,
  })
})

test("k-disc: Keep connected edits the question; Disconnect revokes and cleans up", async () => {
  const kept = harness()
  const keepReceipt = await acceptTelegramControl(
    config,
    callback(signTelegramControl(config, chat, "k", now)),
    kept.deps,
  )
  await keepReceipt?.effects?.(kept.bot)
  expect(kept.calls).toEqual([
    "edit:31:Still connected to <b>Mama Ada &amp; Sons · Yaba Main</b>.",
  ])

  const gone = harness()
  const receipt = await acceptTelegramControl(
    config,
    callback(signTelegramControl(config, chat, "d", now)),
    gone.deps,
  )
  await receipt?.effects?.(gone.bot)
  expect(gone.calls).toEqual([
    "disconnect:30:31",
    `edit:31:${telegramControlCopy.disconnected("Mama Ada & Sons")}:Open EwaTrade`,
    "edit:3:<b>Disconnected</b>\nMama Ada &amp; Sons · Yaba Main",
    "unpin",
    "commands:default",
  ])
})

test("k-disc: control callbacks are bound to the chat, user and a 15 minute window", async () => {
  const data = signTelegramControl(config, chat, "d", now)
  expect(
    verifyTelegramControl(config, { ...chat, chatId: "999" }, data, now),
  ).toBeNull()
  expect(
    verifyTelegramControl(config, { ...chat, userId: "999" }, data, now),
  ).toBeNull()
  expect(
    verifyTelegramControl(
      { token: "123:other_token_abcdefghijklmn" },
      chat,
      data,
      now,
    ),
  ).toBeNull()
  expect(
    verifyTelegramControl(config, chat, data.replace(":d:", ":k:"), now),
  ).toBeNull()
  expect(
    verifyTelegramControl(
      config,
      chat,
      data,
      new Date(now.getTime() + 15 * 60_000),
    ),
  ).toEqual({ action: "d", expired: true })

  const forged = harness()
  expect(
    await acceptTelegramControl(
      config,
      { ...callback(data), chatId: "999", userId: "999" },
      forged.deps,
    ),
  ).toEqual({})
  const late = harness()
  const receipt = await acceptTelegramControl(
    config,
    callback(
      signTelegramControl(
        config,
        chat,
        "d",
        new Date(now.getTime() - 16 * 60_000),
      ),
    ),
    late.deps,
  )
  await receipt?.effects?.(late.bot)
  expect(late.calls).toEqual([`edit:31:${telegramControlCopy.askExpired}`])
  expect(forged.calls).toEqual([])
})

test("k-disc: disabled Telegram or an unconnected chat keeps the immediate plain revoke", async () => {
  const off = harness()
  const receipt = await acceptTelegramControl(
    { ...config, enabled: false },
    message("/disconnect"),
    off.deps,
  )
  expect(receipt?.notice?.text).toBe("Telegram disconnected from EwaTrade.")
  expect(receipt?.notice?.buttons).toBeUndefined()
  await receipt?.notice?.after?.(off.bot)
  expect(off.calls).toEqual([
    "disconnect:20:21",
    "edit:3:<b>Disconnected</b>\nMama Ada &amp; Sons · Yaba Main",
    "unpin",
    "commands:default",
  ])

  const unlinked = harness({ connected: false, revoked: false })
  expect(
    await acceptTelegramControl(config, message("stop"), unlinked.deps),
  ).toEqual({})
  expect(unlinked.calls).toEqual(["disconnect:20:21"])

  // A Disconnect tapped while Telegram is switched off still revokes.
  const tapped = harness()
  const tappedReceipt = await acceptTelegramControl(
    { ...config, enabled: false },
    callback(signTelegramControl(config, chat, "d", now)),
    tapped.deps,
  )
  expect(tapped.calls).toEqual(["disconnect:30:31"])
  expect(tappedReceipt?.effects).toBeDefined()
})

test("k-stop: Stop bot revokes silently; RESTART marks and unpins the old Connected message", async () => {
  const update = (before: string, after: string) =>
    parseAssistantTelegramUpdate({
      update_id: 40,
      my_chat_member: {
        chat: { id: 456, type: "private" },
        from: { id: 456, is_bot: false },
        date: Math.floor(now.getTime() / 1000),
        old_chat_member: { status: before },
        new_chat_member: { status: after },
      },
    })
  const stopped = harness()
  const stop = update("member", "kicked")
  if (!stop) throw Error("Stop bot update was not parsed")
  expect(await acceptTelegramControl(config, stop, stopped.deps)).toEqual({})
  expect(stopped.calls).toEqual(["disconnect:40:-"])

  const restarted = harness({ connected: false })
  const restart = update("kicked", "member")
  if (!restart) throw Error("RESTART update was not parsed")
  const receipt = await acceptTelegramControl(config, restart, restarted.deps)
  await receipt?.effects?.(restarted.bot)
  expect(restarted.calls).toEqual([
    "edit:3:<b>Disconnected</b>\nMama Ada &amp; Sons · Yaba Main",
    "unpin",
    "commands:default",
  ])

  // Connected again before RESTART arrived: nothing to clean up.
  const relinked = harness()
  expect(await acceptTelegramControl(config, restart, relinked.deps)).toEqual(
    {},
  )
})

test("s-pw: a password is deleted from the chat and never reaches the inbox", async () => {
  const { calls, deps, bot } = harness()
  const receipt = await acceptTelegramControl(
    config,
    message("my password is mamaada2026"),
    deps,
  )
  expect(receipt?.notice).toEqual({
    text: telegramControlCopy.password,
    buttons: [
      [
        {
          text: "Change password",
          url: "https://dash.example/forgot-password",
        },
      ],
    ],
  })
  expect(JSON.stringify(receipt)).not.toContain("mamaada2026")
  await receipt?.effects?.(bot)
  expect(calls).toEqual(["delete:21"])
  // Switched off: no reply, as before.
  expect(
    await acceptTelegramControl(
      { ...config, enabled: false },
      message("my password is mamaada2026"),
      deps,
    ),
  ).toBeNull()
})

test("s-forward: a forwarded review is refused; ordinary forwards stay assistant input", async () => {
  const { deps } = harness()
  const review =
    "Record sale\n\nBusiness: Mama Ada Provisions\nStore: Yaba Main\nDraft revision: 1\n\nCustomer: Grace Bello\nReview expires: 2026-11-12T10:05:00.000Z (UTC)."
  const forwarded = await acceptTelegramControl(
    config,
    message(review, { forward: { userId: null, isBot: false } }),
    deps,
  )
  expect(forwarded).toEqual({
    notice: { text: telegramControlCopy.forwardedReview },
  })
  expect(
    await acceptTelegramControl(
      config,
      message("Please send 5 bags of rice", {
        forward: { userId: "77", isBot: false },
      }),
      deps,
    ),
  ).toBeNull()
  // The user's own (not forwarded) text is never treated as a forwarded review.
  expect(await acceptTelegramControl(config, message(review), deps)).toBeNull()
})

test("leaves ordinary messages and review callbacks to the assistant", async () => {
  const { calls, deps } = harness()
  expect(
    await acceptTelegramControl(config, message("today's sales"), deps),
  ).toBeNull()
  expect(
    await acceptTelegramControl(config, callback("confirm:abc"), deps),
  ).toBeNull()
  expect(calls).toEqual([])
})

test("k-cancel, k-cancel-draft and s-old: typed words explain, never decide", () => {
  expect(telegramTypedDecision("cancel")).toBe("cancel")
  expect(telegramTypedDecision("Confirm!")).toBe("confirm")
  expect(telegramTypedDecision("save it")).toBe("confirm")
  expect(telegramTypedDecision("cancel the order for Grace")).toBeNull()
  const scope = "Mama Ada Provisions · Yaba Main"
  expect(telegramTypedDecisionReply("cancel", "none", scope)).toBe(
    "There's nothing to cancel right now. This chat is still connected to Mama Ada Provisions · Yaba Main.\n\nTo remove Telegram access, send /disconnect.",
  )
  expect(telegramTypedDecisionReply("cancel", "open", scope)).toBe(
    "Tap Cancel on the draft review to cancel it. Typed words never confirm or cancel a review.",
  )
  expect(telegramTypedDecisionReply("confirm", "open", scope)).toBe(
    "Tap Confirm on the draft review to save it. Typed words never confirm or cancel a review.",
  )
  expect(telegramTypedDecisionReply("confirm", "cancelled", scope)).toBe(
    "That draft was cancelled, so there's nothing to confirm. Nothing was saved.\n\nSend your request again for a new review.",
  )
  expect(telegramTypedDecisionReply("cancel", "cancelled", scope)).toContain(
    "nothing to cancel",
  )
})
