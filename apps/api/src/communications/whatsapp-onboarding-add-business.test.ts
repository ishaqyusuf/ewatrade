import { expect, test } from "bun:test"
import {
  type WhatsAppOnboardingAdapters,
  type WhatsAppOnboardingState,
  advanceWhatsAppOnboarding,
} from "./whatsapp-onboarding"
import {
  collectWhatsAppAddBusinessDetails,
  whatsAppAddBusinessEntry,
} from "./whatsapp-onboarding-add-business"

const address = { senderId: "2348000000001", phoneNumberId: "123456789" }
const now = Date.UTC(2026, 10, 3, 16, 20)
const created = {
  tenantId: "new-tenant",
  storeId: "new-store",
  membershipId: "new-membership",
  businessName: "Ada Kitchen",
  storeName: "Main store",
}

function harness(options: { flag?: boolean; linkedUser?: string } = {}) {
  const calls = {
    account: 0,
    request: [] as string[],
    verify: 0,
    create: [] as unknown[],
    connect: [] as unknown[],
  }
  const adapters: WhatsAppOnboardingAdapters = {
    legal: null,
    connected: true,
    connectedUserId: options.linkedUser ?? "user",
    requestEmail: async ({ email, mode }) => {
      expect(mode).toBe("login")
      calls.request.push(email)
      return { expiresAt: new Date(now + 10 * 60_000) }
    },
    verifyEmail: async ({ code }) => {
      calls.verify++
      return code === "372819" ? { userId: "user", sessionId: "fresh" } : null
    },
    choices: async () => [],
    connect: async (input) => {
      calls.connect.push(input)
    },
    ...(options.flag === false
      ? {}
      : {
          addBusiness: {
            account: async () => {
              calls.account++
              return {
                userId: "user",
                email: "Adaeze@Example.com",
                ownerName: "Adaeze Okafor",
                businessName: "Mama Ada Provisions",
                storeName: "Yaba Main",
              }
            },
            create: async (input) => {
              calls.create.push(input)
              return { kind: "created" as const, choice: created }
            },
          },
        }),
  }
  let state: WhatsAppOnboardingState | null = null
  let sequence = 0
  return {
    calls,
    adapters,
    get state() {
      return state
    },
    send: async (text: string, at = now) => {
      const output = await advanceWhatsAppOnboarding(
        state,
        { ...address, text, now: at, messageId: `message-${++sequence}` },
        adapters,
      )
      state = output.state
      return output
    },
  }
}

test("entry phrases are explicit and may carry the business name", () => {
  expect(whatsAppAddBusinessEntry("ADD BUSINESS")).toEqual({})
  expect(whatsAppAddBusinessEntry("I want to add another business")).toEqual({})
  expect(
    whatsAppAddBusinessEntry("add another business called Ada Kitchen"),
  ).toEqual({ businessName: "Ada Kitchen" })
  expect(whatsAppAddBusinessEntry("how is business today?")).toBeNull()
  expect(whatsAppAddBusinessEntry("show my sales")).toBeNull()
})

test("collector reads grouped, labeled and short-list answers without codes", () => {
  expect(
    collectWhatsAppAddBusinessDetails(
      "Ada Kitchen, Nigeria · NGN, 12 Allen Avenue, Ikeja",
    ).patch,
  ).toEqual({
    businessName: "Ada Kitchen",
    countryCode: "NG",
    currencyCode: "NGN",
    addressLine1: "12 Allen Avenue",
    city: "Ikeja",
  })
  expect(collectWhatsAppAddBusinessDetails("Other · USD").patch).toEqual({
    countryCode: null,
    currencyCode: "USD",
  })
  expect(collectWhatsAppAddBusinessDetails("Ghana").patch).toEqual({
    countryCode: "GH",
    currencyCode: "GHS",
  })
  expect(
    collectWhatsAppAddBusinessDetails("City: Lagos\nPhone: +234 801 000 0000")
      .patch,
  ).toEqual({ city: "Lagos", phone: "+234 801 000 0000" })
  expect(collectWhatsAppAddBusinessDetails("372819").sensitive).toBe(true)
  expect(
    collectWhatsAppAddBusinessDetails("my password is hunter2").sensitive,
  ).toBe(true)
})

test("flag off keeps today's app pointer and creates nothing", async () => {
  const h = harness({ flag: false })
  const output = await h.send("ADD BUSINESS")
  expect(output.reply).toContain("Open the EwaTrade app")
  expect(output.state).toBeNull()
  expect(h.calls.create).toHaveLength(0)
})

test("grouped facts → review → Create → email proof → canonical create → switch", async () => {
  const h = harness()
  const asked = await h.send("add another business called Ada Kitchen")
  expect(asked.reply).toContain("Where does *Ada Kitchen* trade?")
  expect(asked.reply).toContain("Nigeria · NGN")
  expect(asked.reply).not.toContain("Business name")
  expect(h.state?.mode).toBe("add_business")

  const reviewed = await h.send(
    "Nigeria · NGN\nAddress: 12 Allen Avenue\nCity: Ikeja",
  )
  expect(reviewed.reply).toContain("🧾 Review new business")
  expect(reviewed.reply).toContain("*Ada Kitchen*")
  expect(reviewed.reply).toContain("Nigeria · NGN")
  expect(reviewed.reply).toContain("Owner: Adaeze Okafor (you)")
  expect(reviewed.reply).toContain("(this WhatsApp number)")
  expect(reviewed.reply).toContain("Same account and email as *Mama Ada")
  expect(reviewed.buttons?.map((button) => button.title)).toEqual([
    "Create business",
    "Edit",
    "Cancel",
  ])
  expect(h.calls.create).toHaveLength(0)

  const proof = await h.send("CREATE BUSINESS")
  expect(proof.reply).toContain("🔒 Code sent to *a•••@example.com*.")
  expect(proof.reply).toContain("Send it here to create *Ada Kitchen*.")
  expect(proof.reply).toContain(
    "_It works for 10 minutes. Nothing is created until then. Never send your password._",
  )
  expect(h.calls.request).toEqual(["adaeze@example.com"])
  expect(h.calls.create).toHaveLength(0)

  const wrong = await h.send("111111")
  expect(wrong.reply).toContain("Nothing was created")
  expect(h.calls.create).toHaveLength(0)

  const done = await h.send("372819")
  expect(done.reply).toContain("✅ *Ada Kitchen* created, with Main store")
  expect(done.reply).toContain("*Mama Ada Provisions* stays connected")
  expect(done.buttons?.map((button) => button.title)).toEqual([
    "Switch to it",
    "Stay here",
  ])
  expect(h.calls.create).toEqual([
    {
      userId: "user",
      sessionId: "fresh",
      operationId: "message-5",
      business: {
        businessName: "Ada Kitchen",
        countryCode: "NG",
        currencyCode: "NGN",
        addressLine1: "12 Allen Avenue",
        city: "Ikeja",
        phone: `+${address.senderId}`,
      },
    },
  ])

  const switched = await h.send("SWITCH")
  expect(switched.connected).toBe(true)
  expect(switched.reply).toContain("Now in *Ada Kitchen*")
  expect(switched.state).toBeNull()
  expect(h.calls.connect).toEqual([
    expect.objectContaining({
      userId: "user",
      sessionId: "fresh",
      choice: created,
    }),
  ])
})

test("Stay keeps the current scope and grants nothing", async () => {
  const h = harness()
  await h.send("ADD BUSINESS")
  await h.send("Ada Kitchen, Ghana · GHS, 4 Oxford St, Accra")
  await h.send("Create")
  await h.send("372819")
  const stayed = await h.send("STAY")
  expect(stayed.reply).toContain("still in *Mama Ada Provisions* · Yaba Main")
  expect(stayed.reply).toContain("send CONNECT")
  expect(stayed.state).toBeNull()
  expect(h.calls.connect).toHaveLength(0)
})

test("Cancel and Edit never create; corrections produce a fresh review", async () => {
  const h = harness()
  await h.send("ADD BUSINESS")
  await h.send("Ada Kitchen, Nigeria · NGN, 12 Allen Avenue, Ikeja")
  const edit = await h.send("EDIT")
  expect(edit.reply).toContain("What should change?")
  expect(h.state?.stage).toBe("add_details")
  const corrected = await h.send("City: Lagos")
  expect(corrected.reply).toContain("12 Allen Avenue, Lagos")
  expect(h.state?.stage).toBe("add_review")
  const cancelled = await h.send("CANCEL")
  expect(cancelled.reply).toBe(
    "❌ No business was created. You’re still in *Mama Ada Provisions* · Yaba Main.",
  )
  expect(cancelled.state).toBeNull()
  expect(h.calls.request).toHaveLength(0)
  expect(h.calls.create).toHaveLength(0)
})

test("Create before a complete review, or after expiry, does nothing", async () => {
  const h = harness()
  await h.send("ADD BUSINESS")
  const early = await h.send("CREATE")
  expect(early.reply).toContain("Send these together")
  expect(h.calls.request).toHaveLength(0)
  await h.send("Ada Kitchen, Nigeria · NGN, 12 Allen Avenue, Ikeja")
  const late = await h.send("CREATE BUSINESS", now + 31 * 60_000)
  expect(late.reply).toContain("expired. Nothing was created")
  expect(late.state).toBeNull()
  expect(h.calls.request).toHaveLength(0)
})

test("proof for another account cannot create under this link", async () => {
  const h = harness({ linkedUser: "someone-else" })
  const entry = await h.send("ADD BUSINESS")
  // The server-derived account does not match the linked identity: app pointer only.
  expect(entry.reply).toContain("Open the EwaTrade app")
  expect(h.calls.create).toHaveLength(0)
})

test("a rejected canonical create reports its reason and keeps nothing", async () => {
  const h = harness()
  const add = h.adapters.addBusiness
  if (!add) throw new Error("missing adapter")
  add.create = async () => ({
    kind: "rejected",
    message: "Your plan allows 1 business. Nothing was created.",
  })
  await h.send("ADD BUSINESS")
  await h.send("Ada Kitchen, Nigeria · NGN, 12 Allen Avenue, Ikeja")
  await h.send("CREATE BUSINESS")
  const rejected = await h.send("372819")
  expect(rejected.reply).toBe(
    "Your plan allows 1 business. Nothing was created.",
  )
  expect(rejected.state).toBeNull()
})
