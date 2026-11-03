import { expect, spyOn, test } from "bun:test"
import { WHATSAPP_DELIVERY_REQUEST_MS } from "@ewatrade/assistant/channels/delivery"
import type { PrismaClient } from "@ewatrade/db"
import type { WhatsAppOnboardingAdapters } from "./whatsapp-onboarding"
import {
  cancelWhatsAppOnboarding,
  createWhatsAppOnboardingProvider,
  processWhatsAppOnboardingMessage,
} from "./whatsapp-onboarding-runtime"

const now = new Date("2026-10-20T14:00:00.000Z")
const env = { BETTER_AUTH_SECRET: "unit-test-only-secret" }
const address = { senderId: "2348000000001", phoneNumberId: "123456789" }
const config = {
  phoneNumberId: address.phoneNumberId,
  accessToken: "test-only",
}
type Row = {
  id: string
  token: string
  expiresAt: Date
  formData: unknown
  userId?: string | null
  completed?: boolean
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing expected test value")
  return value
}
function harness(unknownSend = false, linked = false) {
  const rows = new Map<string, Row>()
  let inTransaction = false
  let sent = 0
  let lastButtons: { id: string; title: string }[] = []
  let lastBody = ""
  let sequence = 0
  const db = {
    $transaction: async <T>(run: (tx: unknown) => Promise<T>) => {
      inTransaction = true
      try {
        return await run(db)
      } finally {
        inTransaction = false
      }
    },
    $executeRaw: async () => 1,
    onboardingSession: {
      findMany: async () =>
        [...rows.values()].filter((row) => row.expiresAt <= now).slice(0, 50),
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        for (const [key, row] of rows)
          if (where.id.in.includes(row.id)) rows.delete(key)
        return { count: 0 }
      },
      findUnique: async ({ where }: { where: { token: string } }) =>
        structuredClone(rows.get(where.token) ?? null),
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { token: string }
        create: Omit<Row, "id">
        update: Partial<Row>
      }) => {
        const prior = rows.get(where.token)
        const row = prior
          ? { ...prior, ...update }
          : { id: `row-${rows.size}`, ...create }
        rows.set(where.token, row)
        return row
      },
      create: async ({ data }: { data: Omit<Row, "id"> }) => {
        const row = { id: `row-${rows.size}`, ...data }
        rows.set(data.token, row)
        return row
      },
      update: async ({
        where,
        data,
      }: { where: { token: string }; data: Partial<Row> }) => {
        const prior = rows.get(where.token)
        if (!prior) throw new Error("missing")
        const row = { ...prior, ...data }
        rows.set(where.token, row)
        return row
      },
    },
    assistantWhatsAppGrant: {
      findFirst: async () => (linked ? { id: "grant" } : null),
    },
  }
  const adapters: WhatsAppOnboardingAdapters = {
    legal: null,
    requestEmail: async () => {
      expect(inTransaction).toBe(false)
      return { expiresAt: new Date(now.getTime() + 600_000) }
    },
    verifyEmail: async () => {
      expect(inTransaction).toBe(false)
      return { userId: "user", sessionId: "session" }
    },
    choices: async () => [
      {
        tenantId: "tenant",
        storeId: "store",
        membershipId: "membership",
        businessName: "Business",
        storeName: "Store",
      },
    ],
    connect: async () => {
      expect(inTransaction).toBe(false)
    },
  }
  const dependencies = {
    db: db as unknown as PrismaClient,
    env,
    now: () => now,
    adapters: () => adapters,
    provider: {
      sendButtons: async ({
        buttons,
        body,
      }: { buttons: { id: string; title: string }[]; body: string }) => {
        expect(inTransaction).toBe(false)
        lastButtons = buttons
        lastBody = body
        sent++
        if (unknownSend) throw new Error("transport lost")
        return { messageId: `outbound-${sent}` }
      },
      sendText: async ({ body }: { body: string }) => {
        expect(inTransaction).toBe(false)
        lastBody = body
        lastButtons = []
        sent++
        if (unknownSend) throw new Error("transport lost")
        return { messageId: `outbound-${sent}` }
      },
    },
  }
  const message = (text: string, messageId = `message-${++sequence}`) => ({
    kind: "message" as const,
    type: "text" as const,
    phoneNumberId: address.phoneNumberId,
    externalCustomerId: address.senderId,
    messageId,
    text,
    timestamp: String(now.getTime() / 1000),
  })
  return {
    rows,
    dependencies,
    message,
    get lastButtons() {
      return lastButtons
    },
    get lastBody() {
      return lastBody
    },
    get sent() {
      return sent
    },
    send: (text: string, id?: string) =>
      processWhatsAppOnboardingMessage(message(text, id), config, dependencies),
  }
}

test("durable provider receipt suppresses a duplicate after process completion", async () => {
  const h = harness()
  expect((await h.send("Hi", "original")).outcome).toBe("sent")
  expect((await h.send("Hi", "original")).outcome).toBe("duplicate")
  expect(h.sent).toBe(1)
  expect(
    [...h.rows.values()].find((row) => row.token.startsWith("wa-receipt_"))
      ?.formData,
  ).toMatchObject({ status: "SENT" })
})

test("ambiguous send stays UNKNOWN and replay cannot send again", async () => {
  const h = harness(true)
  expect((await h.send("Hi", "uncertain")).outcome).toBe("unknown")
  expect((await h.send("Hi", "uncertain")).outcome).toBe("duplicate")
  expect(h.sent).toBe(1)
  expect(
    [...h.rows.values()].find((row) => row.token.startsWith("wa-receipt_"))
      ?.formData,
  ).toMatchObject({ status: "UNKNOWN" })
})

for (const nativeButtons of [true, false]) {
  test(`typed CONNECT bounds stalled ${nativeButtons ? "button" : "text"} transport and never resends an unknown result`, async () => {
    const h = harness()
    const controller = new AbortController()
    const durations: number[] = []
    let attempts = 0
    let requestInit: RequestInit | undefined
    const timeout = spyOn(AbortSignal, "timeout").mockImplementation(
      (duration) => {
        durations.push(duration)
        return controller.signal
      },
    )
    const requestFetch: typeof fetch = Object.assign(
      async (
        _url: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ): Promise<Response> => {
        attempts++
        requestInit = init
        // A bounded inert probe also fails promptly when the signal is absent.
        const signal = init?.signal
        if (!signal) throw new Error("Missing request deadline")
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Simulated timeout", "TimeoutError")),
          )
          queueMicrotask(() => controller.abort())
        })
      },
      { preconnect: fetch.preconnect },
    )
    const provider = createWhatsAppOnboardingProvider(requestFetch)
    const dependencies = {
      ...h.dependencies,
      provider: {
        sendText: provider.sendText.bind(provider),
        ...(nativeButtons
          ? { sendButtons: provider.sendButtons.bind(provider) }
          : {}),
      },
    }
    const incoming = h.message("CONNECT", "stalled-typed-connect")
    try {
      expect(
        await processWhatsAppOnboardingMessage(incoming, config, dependencies),
      ).toEqual({ handled: true, outcome: "unknown" })
      expect(durations).toEqual([WHATSAPP_DELIVERY_REQUEST_MS])
      expect(requestInit?.redirect).toBe("error")
      expect(requestInit?.signal).toBe(controller.signal)
      expect(JSON.parse(String(requestInit?.body))).toMatchObject({
        type: nativeButtons ? "interactive" : "text",
      })
      expect(
        [...h.rows.values()].find((row) => row.token.startsWith("wa-receipt_"))
          ?.formData,
      ).toMatchObject({ status: "UNKNOWN" })
      expect(
        [...h.rows.values()].find((row) => row.token.startsWith("wa-flow_"))
          ?.formData,
      ).toMatchObject({ lease: null, state: { stage: "email" } })
      expect(
        await processWhatsAppOnboardingMessage(incoming, config, dependencies),
      ).toEqual({ handled: true, outcome: "duplicate" })
      expect(attempts).toBe(1)
      expect(JSON.stringify([...h.rows.values()])).not.toContain(
        config.accessToken,
      )
    } finally {
      timeout.mockRestore()
    }
  })
}

test("verified state associates privacy owner, completed connection clears private dialogue fields", async () => {
  const h = harness()
  await h.send("owner@example.com")
  await h.send("372819")
  const verified = [...h.rows.values()].find((row) =>
    row.token.startsWith("wa-flow_"),
  )
  expect(verified?.userId).toBe("user")
  await h.send("YES")
  const complete = [...h.rows.values()].find((row) =>
    row.token.startsWith("wa-flow_"),
  )
  expect(complete?.formData).toMatchObject({ state: null, lease: null })
  expect(complete?.userId).toBe("user")
  expect(JSON.stringify([...h.rows.values()])).not.toContain("372819")
  expect(JSON.stringify([...h.rows.values()])).not.toContain(config.accessToken)
})

test("STOP clears private flow and stale events never open a messaging window", async () => {
  const h = harness()
  await h.send("owner@example.com")
  await cancelWhatsAppOnboarding(address, h.dependencies.db, env)
  expect(
    [...h.rows.values()].find((row) => row.token.startsWith("wa-flow_"))
      ?.formData,
  ).toMatchObject({ state: null, lease: null })
  expect(
    [...h.rows.values()].find((row) => row.token.startsWith("wa-flow_"))
      ?.formData,
  ).not.toHaveProperty("promptId")
  const stale = h.message("Hi")
  stale.timestamp = String(now.getTime() / 1000 - 24 * 60 * 60)
  expect(
    await processWhatsAppOnboardingMessage(stale, config, h.dependencies),
  ).toEqual({ handled: true })
  expect(h.sent).toBe(1)
})

test("linked ordinary six-digit amount bypasses onboarding without persistence or send", async () => {
  const h = harness(false, true)
  expect(await h.send("123456")).toEqual({ handled: false })
  expect(h.rows.size).toBe(0)
  expect(h.sent).toBe(0)
})

test("native onboarding actions bind sender and the current prompt; stale REGISTER cannot change email proof", async () => {
  const h = harness()
  await h.send("Hi")
  const oldRegister = required(
    h.lastButtons.find((button) => button.title === "Create account"),
  ).id
  await h.send("owner@example.com")
  const stale = {
    ...h.message("Create account"),
    type: "interactive" as const,
    quickActionId: oldRegister,
  }
  await processWhatsAppOnboardingMessage(stale, config, h.dependencies)
  const flow = required(
    [...h.rows.values()].find((row) => row.token.startsWith("wa-flow_")),
  )
  expect(flow.formData).toMatchObject({
    state: { stage: "code", mode: "login" },
  })
  const cancel = required(
    h.lastButtons.find((button) => button.title === "Cancel"),
  ).id
  const otherSender = {
    ...h.message("Cancel"),
    externalCustomerId: "2348000000002",
    type: "interactive" as const,
    quickActionId: cancel,
  }
  await processWhatsAppOnboardingMessage(otherSender, config, h.dependencies)
  expect(flow.formData).toMatchObject({ state: { stage: "code" } })
  const currentCancel = {
    ...h.message("Cancel"),
    type: "interactive" as const,
    quickActionId: cancel,
  }
  await processWhatsAppOnboardingMessage(currentCancel, config, h.dependencies)
  expect(
    [...h.rows.values()].find((row) => row.token === flow.token)?.formData,
  ).toMatchObject({ state: null })
})

test("connected REGISTER never opens signup even while re-verifying another business", async () => {
  const h = harness(false, true)
  await h.send("CONNECT")
  await h.send("owner@example.com")
  await h.send("REGISTER")
  const flow = required(
    [...h.rows.values()].find((row) => row.token.startsWith("wa-flow_")),
  )
  expect(flow.formData).toMatchObject({ state: null })
  expect(h.lastButtons.map((button) => button.title)).toContain(
    "Add a business",
  )
})

test("a cancelled native form cannot start a new email-proof workflow after cancellation", async () => {
  const h = harness()
  const token = "wa-flow_native_cancelled"
  h.rows.set(token, {
    id: "native",
    token,
    expiresAt: new Date(now.getTime() + 60_000),
    formData: {
      kind: "native-registration-flow-v1",
      senderId: address.senderId,
      phoneNumberId: address.phoneNumberId,
      status: "CANCELLED",
      returnMessageId: "return",
    },
  })
  const result = await processWhatsAppOnboardingMessage(
    h.message("", "return"),
    config,
    h.dependencies,
    {
      registrationToken: token,
      signupForm: {
        name: "Owner",
        businessName: "Business",
        ageBand: "ADULT",
        countryCode: "NG",
        currencyCode: "NGN",
        email: "new@example.com",
        legalVersion: "v1",
        acceptedTerms: true,
        acknowledgedPrivacyNotice: true,
      },
    },
  )
  expect(result).toEqual({ handled: true, outcome: "duplicate" })
  expect(h.rows.size).toBe(1)
  expect(h.sent).toBe(0)
})

function addBusinessDependencies(
  h: ReturnType<typeof harness>,
  flag: boolean,
  created: unknown[],
) {
  const base = h.dependencies.adapters()
  return {
    ...h.dependencies,
    env: flag ? { ...env, ASSISTANT_WHATSAPP_ADD_BUSINESS_ENABLED: "1" } : env,
    adapters: (): WhatsAppOnboardingAdapters => ({
      ...base,
      addBusiness: {
        account: async () => ({
          userId: "user",
          email: "owner@example.com",
          ownerName: "Owner",
          businessName: "Mama Ada Provisions",
          storeName: "Yaba Main",
        }),
        create: async (input) => {
          created.push(input)
          throw new Error("must not be reached in these tests")
        },
      },
    }),
  }
}

test("Add business flag OFF: linked free text stays with the assistant and ADD BUSINESS keeps the app pointer", async () => {
  const h = harness(false, true)
  const created: unknown[] = []
  const dependencies = addBusinessDependencies(h, false, created)
  expect(
    await processWhatsAppOnboardingMessage(
      h.message("add another business called Ada Kitchen"),
      config,
      dependencies,
    ),
  ).toEqual({ handled: false })
  await processWhatsAppOnboardingMessage(
    h.message("ADD BUSINESS"),
    config,
    dependencies,
  )
  expect(h.lastBody).toContain("Open the EwaTrade app")
  expect(created).toHaveLength(0)
})

test("Add business flag ON: review buttons bind the exact review; a stale Create expires without effect", async () => {
  const h = harness(false, true)
  const created: unknown[] = []
  const dependencies = addBusinessDependencies(h, true, created)
  const send = (text: string) =>
    processWhatsAppOnboardingMessage(h.message(text), config, dependencies)
  expect((await send("add another business called Ada Kitchen")).outcome).toBe(
    "sent",
  )
  expect(h.lastBody).toContain("Ada Kitchen")
  await send("Nigeria · NGN\nAddress: 12 Allen Avenue\nCity: Ikeja")
  expect(h.lastBody).toContain("Review new business")
  const staleCreate = required(
    h.lastButtons.find((button) => button.title === "Create business"),
  ).id
  // A correction produces a new review; the earlier Create no longer verifies.
  await send("City: Lagos")
  expect(h.lastBody).toContain("12 Allen Avenue, Lagos")
  await processWhatsAppOnboardingMessage(
    {
      ...h.message("Create business"),
      type: "interactive" as const,
      quickActionId: staleCreate,
    },
    config,
    dependencies,
  )
  expect(h.lastBody).toContain("That choice expired. Nothing was changed.")
  const flow = required(
    [...h.rows.values()].find((row) => row.token.startsWith("wa-flow_")),
  )
  expect(flow.formData).toMatchObject({
    state: { mode: "add_business", stage: "add_review" },
  })
  expect(created).toHaveLength(0)
  const cancel = required(
    h.lastButtons.find((button) => button.title === "Cancel"),
  ).id
  await processWhatsAppOnboardingMessage(
    {
      ...h.message("Cancel"),
      type: "interactive" as const,
      quickActionId: cancel,
    },
    config,
    dependencies,
  )
  expect(h.lastBody).toContain("No business was created")
  expect(
    [...h.rows.values()].find((row) => row.token === flow.token)?.formData,
  ).toMatchObject({ state: null })
})
