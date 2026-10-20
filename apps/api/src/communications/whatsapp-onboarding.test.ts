import { expect, test } from "bun:test"
import {
  type WhatsAppOnboardingAdapters,
  type WhatsAppOnboardingState,
  advanceWhatsAppOnboarding,
} from "./whatsapp-onboarding"

const address = { senderId: "2348000000001", phoneNumberId: "123456789" }
const now = Date.UTC(2026, 9, 20)
const choice = {
  tenantId: "business",
  storeId: "store",
  membershipId: "owner",
  businessName: "Private Business",
  storeName: "Main Store",
}
function harness() {
  const calls = { request: 0, verify: 0, choices: 0, connect: 0 }
  const adapters: WhatsAppOnboardingAdapters = {
    legal: {
      version: "v1",
      termsUrl: "https://ewatrade.com/terms",
      privacyUrl: "https://ewatrade.com/privacy",
    },
    requestEmail: async () => {
      calls.request++
      return { expiresAt: new Date(now + 10 * 60_000) }
    },
    verifyEmail: async ({ code }) => {
      calls.verify++
      return code === "372819" ? { userId: "user", sessionId: "session" } : null
    },
    choices: async () => {
      calls.choices++
      return [choice]
    },
    connect: async () => {
      calls.connect++
    },
  }
  let state: WhatsAppOnboardingState | null = null
  let sequence = 0
  return {
    calls,
    adapters,
    get state() {
      return state
    },
    send: async (text: string, at = now, id = `message-${++sequence}`) => {
      const output = await advanceWhatsAppOnboarding(
        state,
        { ...address, text, now: at, messageId: id },
        adapters,
      )
      state = output.state
      return output
    },
  }
}

test("connection reveals no businesses until email proof, then requires explicit exact-scope consent", async () => {
  const h = harness()
  const requested = await h.send("owner@example.com")
  expect(requested.reply).not.toContain(choice.businessName)
  expect(h.calls.choices).toBe(0)
  expect(h.calls.connect).toBe(0)
  const verified = await h.send("372819")
  expect(verified.reply).toContain(choice.businessName)
  expect(h.calls.connect).toBe(0)
  const connected = await h.send("YES")
  expect(connected.connected).toBe(true)
  expect(h.calls.connect).toBe(1)
  expect(JSON.stringify(connected.state)).not.toContain("372819")
  expect(connected.state?.principal).toBeUndefined()
})

test("duplicate provider message never repeats email issuance or the grant adapter", async () => {
  const h = harness()
  await h.send("owner@example.com", now, "email-message")
  await h.send("owner@example.com", now, "email-message")
  expect(h.calls.request).toBe(1)
  await h.send("372819")
  const original = await h.send("YES", now, "consent-message")
  const replay = await h.send("YES", now, "consent-message")
  expect(replay.reply).toBe(original.reply)
  expect(h.calls.connect).toBe(1)
})

test("verification is bound to sender and expires before invoking auth", async () => {
  const h = harness()
  await h.send("owner@example.com")
  await expect(
    advanceWhatsAppOnboarding(
      h.state,
      {
        ...address,
        senderId: "2348000000002",
        text: "372819",
        now,
        messageId: "other",
      },
      h.adapters,
    ),
  ).rejects.toThrow("sender changed")
  const expired = await h.send("372819", now + 10 * 60_000)
  expect(expired.reply).toContain("expired")
  expect(h.calls.verify).toBe(0)
  expect(h.calls.choices).toBe(0)
})

test("five rejected codes block restart and resend, and cancellation clears state", async () => {
  const h = harness()
  await h.send("owner@example.com")
  for (let n = 0; n < 5; n++) await h.send("999999")
  await h.send("REGISTER")
  await h.send("RESEND", now + 61_000)
  expect(h.calls.request).toBe(1)
  expect(h.calls.verify).toBe(5)
  expect((await h.send("STOP")).state).toBeNull()
})

test("resend cooldown and six-digit handling do not accept ordinary non-code text", async () => {
  const h = harness()
  await h.send("owner@example.com")
  await h.send("RESEND", now + 59_999)
  expect(h.calls.request).toBe(1)
  await h.send("my password")
  expect(h.calls.verify).toBe(0)
  expect(JSON.stringify(h.state)).not.toContain("my password")
  await h.send("RESEND", now + 60_000)
  expect(h.calls.request).toBe(2)
})

test("chat signup issues no email or canonical signup until explicit legal consent", async () => {
  const h = harness()
  await h.send("REGISTER")
  await h.send("new@example.com")
  await h.send("New Owner")
  await h.send("New Business")
  await h.send("3")
  const legal = await h.send("NG NGN")
  expect(legal.reply).toContain("https://ewatrade.com/terms")
  expect(h.calls.request).toBe(0)
  await h.send("YES")
  expect(h.calls.request).toBe(1)
  expect(h.state?.signup?.acceptedTerms).toBe(true)
  expect(h.state?.signup?.acknowledgedPrivacyNotice).toBe(true)
  expect(h.state?.mode).toBe("sign_up")
  expect(h.calls.verify).toBe(0)
})

test("changed legal publication or declined consent cannot issue a signup challenge", async () => {
  const h = harness()
  await h.send("REGISTER")
  await h.send("new@example.com")
  await h.send("New Owner")
  await h.send("New Business")
  await h.send("3")
  await h.send("NG NGN")
  h.adapters.legal = {
    version: "v2",
    termsUrl: "https://ewatrade.com/terms",
    privacyUrl: "https://ewatrade.com/privacy",
  }
  expect((await h.send("YES")).state).toBeNull()
  expect(h.calls.request).toBe(0)
})
