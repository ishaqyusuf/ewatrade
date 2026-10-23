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
  await h.send("New Owner")
  await h.send("New Business")
  await h.send("3")
  await h.send("NG NGN")
  const legal = await h.send("new@example.com")
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
  await h.send("New Owner")
  await h.send("New Business")
  await h.send("3")
  await h.send("NG NGN")
  await h.send("new@example.com")
  h.adapters.legal = {
    version: "v2",
    termsUrl: "https://ewatrade.com/terms",
    privacyUrl: "https://ewatrade.com/privacy",
  }
  expect((await h.send("YES")).state).toBeNull()
  expect(h.calls.request).toBe(0)
})

test("connected REGISTER and later signup stages guide the existing account without creating or sending proof", async () => {
  const h = harness()
  await h.send("REGISTER")
  h.adapters.connected = true
  const guarded = await h.send("New Owner")
  expect(guarded.reply).toContain("already connected")
  expect(guarded.state).toBeNull()
  const restart = await h.send("REGISTER")
  expect(restart.reply).toContain("same account")
  expect((await h.send("ADD BUSINESS")).reply).toContain("Nothing was created")
  expect(h.calls.request).toBe(0)
  expect(h.calls.verify).toBe(0)
  expect(h.calls.connect).toBe(0)
})

test("registration form reuses email proof and exact legal authority; connected identities cannot submit signup", async () => {
  const h = harness()
  const signupForm = {
    name: "New Owner",
    businessName: "New Business",
    ageBand: "ADULT" as const,
    countryCode: "NG",
    currencyCode: "NGN" as const,
    legalVersion: "v1",
    acceptedTerms: true as const,
    acknowledgedPrivacyNotice: true as const,
    email: "new@example.com",
  }
  const formMessage = {
    ...address,
    text: "",
    now,
    messageId: "form",
    signupForm,
  }
  const output = await advanceWhatsAppOnboarding(null, formMessage, h.adapters)
  expect(output.state?.stage).toBe("code")
  expect(h.calls.request).toBe(1)
  expect(h.calls.verify).toBe(0)
  const expiredLegal = await advanceWhatsAppOnboarding(
    null,
    { ...formMessage, signupForm: { ...signupForm, legalVersion: "old" } },
    h.adapters,
  )
  expect(expiredLegal.state).toBeNull()
  expect(h.calls.request).toBe(1)
  h.adapters.connected = true
  const linked = await advanceWhatsAppOnboarding(null, formMessage, h.adapters)
  expect(linked.state).toBeNull()
  expect(h.calls.request).toBe(1)
})

test("under-13 refusal and resume controls never treat control text as registration data", async () => {
  const h = harness()
  await h.send("REGISTER")
  const resume = await h.send("hello")
  expect(resume.state?.stage).toBe("name")
  await h.send("CONTINUE")
  expect(h.state?.signup?.name).toBeUndefined()
  await h.send("New Owner")
  await h.send("New Business")
  const refused = await h.send("under 13")
  expect(refused.state).toBeNull()
  expect(h.calls.request).toBe(0)
})

test("another verified account keeps the existing connection without enumerating businesses; same-account proof still reaches exact consent", async () => {
  const other = harness()
  other.adapters.connected = true
  other.adapters.connectedUserId = "existing-user"
  const beforeProof = await other.send("other@example.com")
  expect(beforeProof.reply).not.toContain("another account")
  const rejected = await other.send("372819")
  expect(rejected.state).toBeNull()
  expect(rejected.reply).toContain("existing connection stays")
  expect(rejected.reply).toContain("DISCONNECT first")
  expect(rejected.buttons?.map((button) => button.command)).toEqual([
    "KEEP",
    "HELP",
  ])
  expect(other.calls.choices).toBe(0)
  expect(other.calls.connect).toBe(0)
  const same = harness()
  same.adapters.connected = true
  same.adapters.connectedUserId = "user"
  await same.send("owner@example.com")
  expect((await same.send("372819")).state?.stage).toBe("consent")
  expect(same.calls.choices).toBe(1)
  expect(same.calls.connect).toBe(0)
})

test("batched registration collects all details in one message then separates review, legal consent and email proof", async () => {
  const h = harness()
  const start = await h.send("REGISTER")
  expect(start.reply).toContain("these details together")
  expect(start.reply).toContain("Business name")
  expect(start.reply).toContain("Age group")
  const expires = h.state?.expiresAt
  const review = await h.send(
    "Ishaq Stores, Ishaq Yusuf, owner@example.com, Nigeria, NGN, 18+",
  )
  expect(review.state?.stage).toBe("legal")
  expect(review.state?.expiresAt).toBe(expires)
  expect(review.state?.signup?.businessName).toBe("Ishaq Stores")
  expect(review.state?.signup?.countryCode).toBe("NG")
  expect(review.reply).toContain("Email: owner@example.com")
  expect(h.calls.request).toBe(0)
  expect(h.calls.verify).toBe(0)
  await h.send("YES")
  expect(h.calls.request).toBe(1)
  expect(h.state?.stage).toBe("code")
  expect(h.calls.verify).toBe(0)
})

test("partial labeled updates retain known details and ask all remaining fields together", async () => {
  const h = harness()
  await h.send("REGISTER")
  const first = await h.send(
    "Business name: Ishaq Stores\nYour name: Ishaq Yusuf\nEmail: invalid-email",
  )
  expect(first.state?.signup?.name).toBe("Ishaq Yusuf")
  expect(first.state?.signup?.businessName).toBe("Ishaq Stores")
  expect(first.state?.email).toBeUndefined()
  expect(first.reply).toContain("Email address")
  expect(first.reply).toContain("Age group")
  expect(first.reply).toContain("Country, for example")
  expect(first.reply).toContain("Currency:")
  expect(first.reply).not.toMatch(/\d\. Business name/)
  expect(first.reply).not.toMatch(/\d\. Your full name/)
  const continued = await h.send("REGISTER")
  expect(continued.state?.signup?.name).toBe("Ishaq Yusuf")
  const review = await h.send(
    "Email: owner@example.com; Age group: 16–17; Country: Nigeria; Currency: NGN",
  )
  expect(review.state?.stage).toBe("legal")
  expect(review.reply).toContain("Age group: 16–17")
  expect(h.calls.request).toBe(0)
})

test("review corrections update the same registration and invalidate earlier legal consent", async () => {
  const h = harness()
  await h.send("REGISTER")
  await h.send(
    "Ishaq Stores, Ishaq Yusuf, owner@example.com, Nigeria, NGN, 18+",
  )
  const expires = h.state?.expiresAt
  const corrected = await h.send("Business name: New Stores; Currency: USD")
  expect(corrected.state?.stage).toBe("legal")
  expect(corrected.state?.expiresAt).toBe(expires)
  expect(corrected.state?.email).toBe("owner@example.com")
  expect(corrected.reply).toContain("Business: New Stores")
  expect(corrected.reply).toContain("Country/currency: NG USD")
  expect(corrected.state?.signup?.acceptedTerms).toBeUndefined()
  expect(h.calls.request).toBe(0)
  await h.send("NO")
  expect(h.state).toBeNull()
  expect(h.calls.verify).toBe(0)
})

test("batched registration refuses under-age and sensitive messages without persisting them", async () => {
  const h = harness()
  await h.send("REGISTER")
  const ignored = await h.send(
    "Business name: Safe Stores; password: private-secret",
  )
  expect(ignored.state?.signup).toBeUndefined()
  expect(JSON.stringify(ignored)).not.toContain("private-secret")
  await h.send("372819")
  expect(JSON.stringify(h.state)).not.toContain("372819")
  expect(h.calls.verify).toBe(0)
  const underAge = await h.send(
    "Business name: Safe Stores; Age group: 12; Email: child@example.com",
  )
  expect(underAge.state).toBeNull()
  expect(h.calls.request).toBe(0)
})

test("ambiguous combined names and conflicting fields are not silently assigned", async () => {
  const h = harness()
  await h.send("REGISTER")
  await h.send("Ishaq Stores, Ishaq Yusuf")
  expect(h.state?.signup?.name).toBeUndefined()
  const conflict = await h.send(
    "Name: Ishaq Yusuf; Name: Another Owner; Business: Ishaq Stores",
  )
  expect(conflict.state?.signup?.name).toBeUndefined()
  expect(conflict.state?.signup?.businessName).toBe("Ishaq Stores")
  expect(conflict.reply).toContain("Your full name")
  expect(h.calls.request).toBe(0)
})

test("labeled connection email reaches the existing proof path without requesting unrelated fields", async () => {
  const h = harness()
  await h.send("CONNECT")
  const requested = await h.send("Email: owner@example.com")
  expect(requested.state?.stage).toBe("code")
  expect(requested.state?.email).toBe("owner@example.com")
  expect(requested.state?.signup).toBeUndefined()
  expect(h.calls.request).toBe(1)
})

test("exact natural registration intents collect attached details and retain connected-account protection", async () => {
  for (const intent of [
    "create my business account",
    "create business account",
    "create my account",
    "register my business",
  ]) {
    const h = harness()
    const initial = await h.send(intent)
    expect(initial.state?.mode).toBe("sign_up")
    expect(initial.reply).toContain("these details together")
    h.adapters.connected = true
    expect((await h.send(intent)).reply).toContain("already connected")
    expect(h.calls.request).toBe(0)
  }
  const attached = harness()
  const collected = await attached.send(
    "create my business account\nBusiness name: Ishaq Stores\nName: Ishaq Yusuf\nEmail: owner@example.com\nCountry: Nigeria\nCurrency: NGN\nAge group: 18+",
  )
  expect(collected.state?.stage).toBe("legal")
  expect(attached.calls.request).toBe(0)
})
