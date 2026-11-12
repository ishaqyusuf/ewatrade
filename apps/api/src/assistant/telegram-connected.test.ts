import { afterEach, beforeEach, expect, test } from "bun:test"
import type { Capability } from "@ewatrade/assistant/capabilities/types"
import {
  showTelegramReconnected,
  telegramAccessEndedNotice,
  telegramConnectedControl,
  telegramHelpReply,
  telegramPhase2Copy,
  telegramRoleChangedRefusal,
  telegramScopeReply,
} from "./telegram-connected"
import type { TelegramChatEffects } from "./telegram-presentation"

const dashboardUrl = process.env.DASHBOARD_URL
beforeEach(() => {
  process.env.DASHBOARD_URL = "https://dash.example.test"
})
afterEach(() => {
  process.env.DASHBOARD_URL = dashboardUrl
})

const ctx = (role: string) =>
  ({
    session: {},
    tenantContext: {
      tenant: { name: "Mama Ada Provisions" },
      activeStore: { name: "Yaba Main" },
      membership: { role },
    },
  }) as never

const capability = (
  id: string,
  mode: "read" | "write",
  domain: Capability["domain"],
  roles: Capability["policy"]["roles"] = ["OWNER", "ADMIN", "MANAGER"],
) => ({ id, mode, domain, policy: { roles } }) as unknown as Capability
const manifest = [
  capability("sales.read", "read", "sales"),
  capability("inventory.read", "read", "inventory"),
  capability("customers.read", "read", "customers"),
  capability("sales.order.record_simple", "write", "sales"),
  capability("finance.expense.record_simple", "write", "finance"),
  capability("customers.create", "write", "customers"),
]

test("c-help: /help lists what an Owner can use, then the commands", () => {
  expect(
    telegramHelpReply(ctx("OWNER"), { manifest, canUse: () => true }).text,
  ).toBe(
    "What I can do here\nWith your Owner access you can ask about sales, stock and customers, and record sales, expenses and new customers. I send a review before anything is saved.\n\n/scope — your Business and Store\n/disconnect — remove Telegram access",
  )
})

test("a-cashier-menu: /help shows only what the Cashier can use", () => {
  const cashier = new Set([
    "customers.read",
    "sales.read",
    "sales.order.record_simple",
  ])
  expect(
    telegramHelpReply(ctx("CASHIER"), {
      manifest,
      canUse: (_, entry) => cashier.has(entry.id),
    }).text,
  ).toStartWith(
    "What I can do here\nWith your Cashier access you can ask about sales and customers, and record sales. I send a review",
  )
  expect(
    telegramHelpReply(ctx("OPERATOR"), { manifest, canUse: () => false }).text,
  ).toStartWith(
    "What I can do here\nThere is nothing I can do here with your Operator access yet.",
  )
})

test("c-switch: /scope and typed scope changes get a Change in EwaTrade button", () => {
  const reply = telegramScopeReply(ctx("OWNER"))
  expect(reply).toEqual({
    text: "Mama Ada Provisions · Yaba Main\nTo use another Business or Store here, change it in EwaTrade.",
    buttons: [
      [
        {
          text: "Change in EwaTrade",
          url: "https://dash.example.test/account/telegram",
        },
      ],
    ],
  })
  expect(telegramConnectedControl(ctx("OWNER"), "Change store.")).toEqual(reply)
  expect(telegramConnectedControl(ctx("OWNER"), "how much stock?")).toBe(
    undefined,
  )
  // Telegram refuses non-HTTPS URL buttons: local origins get text only.
  process.env.DASHBOARD_URL = "http://localhost:3000"
  expect(telegramScopeReply(ctx("OWNER"))).toEqual({
    text: "Mama Ada Provisions · Yaba Main\nTo use another Business or Store here, change it in EwaTrade account settings.",
  })
})

test("a-role: a refusal caused by a role change names the roles that can act", () => {
  const add = capability("customers.create", "write", "customers")
  const refuse = () => {
    throw new Error("FORBIDDEN")
  }
  expect(telegramRoleChangedRefusal(ctx("CASHIER"), add, refuse)).toBe(
    "Not saved. Your access changed since this draft, so this now needs a Manager, Admin or Owner of Mama Ada Provisions.\n\nNothing was changed.",
  )
  // Still within the role ceiling (e.g. Store access changed): no role names.
  expect(telegramRoleChangedRefusal(ctx("MANAGER"), add, refuse)).toBe(
    "Not saved. Your access changed since this draft, so you can't do this here now.\n\nNothing was changed.",
  )
  expect(telegramRoleChangedRefusal(ctx("OWNER"), add, () => true)).toBe(null)
})

test("a-lost and a-expired: explain without naming who changed access", () => {
  const ended = {
    businessName: "Mama Ada Provisions",
    storeName: "Yaba Main",
    connectedMessage: null,
  }
  const removed = telegramAccessEndedNotice("200", {
    ...ended,
    reason: "removed",
  })
  expect(removed.text).toBe(
    "Your access to <b>Mama Ada Provisions</b> has ended, so I can't use it here. If that's a mistake, ask the business Owner.\n\nNothing else changed.",
  )
  expect(removed.buttons?.[0]?.[0]?.text).toBe("Open EwaTrade")
  const idle = telegramAccessEndedNotice("200", { ...ended, reason: "idle" })
  expect(idle.text).toBe(
    "Welcome back. This chat's access to <b>Mama Ada Provisions · Yaba Main</b> ended after 7 days without use. Nothing changed.\n\nReconnect from EwaTrade to turn it back on.",
  )
  expect(idle.buttons?.[0]?.[0]?.text).toBe("Reconnect in EwaTrade")
  expect(
    telegramAccessEndedNotice("200", {
      reason: "removed",
      businessName: null,
      storeName: null,
      connectedMessage: null,
    }).text,
  ).toStartWith("Your access to this business has ended")
})

function recordingBot() {
  const calls: string[] = []
  const bot: TelegramChatEffects = {
    editMessageText: async (input) => {
      calls.push(`edit ${input.messageId}: ${input.text}`)
      return true as never
    },
    pinChatMessage: async (input) => {
      calls.push(`pin ${input.messageId}`)
      return true as never
    },
    unpinAllChatMessages: async () => {
      calls.push("unpin all")
      return true as never
    },
    setChatCommands: async (_, commands) => {
      calls.push(`menu ${commands ? "linked" : "default"}`)
      return true as never
    },
  }
  return { bot, calls }
}

test("c-switch: the old pin goes, the claim message shows both scopes and is pinned", async () => {
  const { bot, calls } = recordingBot()
  await showTelegramReconnected(
    bot,
    { chatId: "200", messageId: "52" },
    { businessName: "Mama Ada Provisions", storeName: "Surulere" },
    { businessName: "Mama Ada Provisions", storeName: "Yaba Main" },
  )
  expect(calls).toContain("menu linked")
  expect(calls.filter((call) => !call.startsWith("menu"))).toEqual([
    "unpin all",
    `edit 52: ${telegramPhase2Copy.switched(
      { businessName: "Mama Ada Provisions", storeName: "Surulere" },
      { businessName: "Mama Ada Provisions", storeName: "Yaba Main" },
    )}`,
    "pin 52",
  ])
  expect(
    telegramPhase2Copy.switched(
      { businessName: "Mama Ada Provisions", storeName: "Surulere" },
      { businessName: "Mama Ada Provisions", storeName: "Yaba Main" },
    ),
  ).toBe(
    "<b>Connected ✓</b>\nMama Ada Provisions · Surulere\n\nMama Ada Provisions · Yaba Main is no longer connected here.",
  )
})

test("an access-ended notice resets the pinned message, pin and menu afterwards", async () => {
  const { bot, calls } = recordingBot()
  await telegramAccessEndedNotice("200", {
    reason: "idle",
    businessName: "Mama Ada Provisions",
    storeName: "Yaba Main",
    connectedMessage: {
      chatId: "200",
      messageId: "41",
      businessName: "Mama Ada Provisions",
      storeName: "Yaba Main",
    },
  }).after(bot)
  expect(calls.sort()).toEqual(
    [
      "edit 41: <b>Disconnected</b>\nMama Ada Provisions · Yaba Main",
      "menu default",
      "unpin all",
    ].sort(),
  )
})

test("c-second: the busy reply names only the business being connected", () => {
  expect(
    telegramPhase2Copy.busy({
      businessName: "Ada Fabrics",
      storeName: "Balogun",
    }),
  ).toBe(
    "This Telegram account is already connected to another EwaTrade account. Nothing changed.\n\nTo use <b>Ada Fabrics</b> here, send /disconnect, then connect again from that account.",
  )
})
