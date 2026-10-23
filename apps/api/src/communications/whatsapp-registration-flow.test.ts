import { expect, spyOn, test } from "bun:test"
import { WHATSAPP_DELIVERY_REQUEST_MS } from "@ewatrade/assistant/channels/delivery"
import type { PrismaClient } from "@ewatrade/db"
import type { WhatsAppOnboardingSignup } from "./whatsapp-onboarding"
import {
  cancelWhatsAppRegistrationFlow,
  createWhatsAppRegistrationFlowProvider,
  handleWhatsAppRegistrationFlowReturn,
  tryLaunchWhatsAppRegistrationFlow,
} from "./whatsapp-registration-flow"

const config = { phoneNumberId: "123456789", accessToken: "test-only" }
const senderId = "2348000000001"
const now = new Date("2026-10-21T12:00:00Z")
const form = {
  form_kind: "registration",
  form_version: "1",
  name: "Test Owner",
  businessName: "Test Business",
  ageBand: "ADULT",
  countryCode: "NG",
  currencyCode: "NGN",
  email: "new@example.com",
  acceptedTerms: true,
  acknowledgedPrivacyNotice: true,
}
function harness(ambiguous = false) {
  type Row = {
    token: string
    formData: unknown
    expiresAt: Date
    completed?: boolean
  }
  const rows = new Map<string, Row>()
  let sequence = 0
  let flowToken = ""
  let launches = 0
  let submitted = 0
  let linked = false
  let legalVersion = "v1"
  let refusal = ""
  const db = {
    $transaction: async <T>(run: (tx: unknown) => Promise<T>) => run(db),
    $executeRaw: async () => 1,
    assistantWhatsAppGrant: {
      findFirst: async () => (linked ? { id: "grant" } : null),
    },
    onboardingSession: {
      findUnique: async ({ where }: { where: { token: string } }) =>
        structuredClone(rows.get(where.token) ?? null),
      create: async ({ data }: { data: Row }) => {
        rows.set(data.token, data)
        return data
      },
      update: async ({
        where,
        data,
      }: { where: { token: string }; data: Partial<Row> }) => {
        const prior = rows.get(where.token)!
        const next = { ...prior, ...data }
        rows.set(where.token, next)
        return next
      },
      upsert: async ({
        where,
        create,
        update,
      }: { where: { token: string }; create: Row; update: Partial<Row> }) => {
        const prior = rows.get(where.token)
        const next = prior ? { ...prior, ...update } : create
        rows.set(where.token, next)
        return next
      },
    },
  }
  const dependencies = {
    db: db as unknown as PrismaClient,
    env: {
      BETTER_AUTH_SECRET: "test-only-secret",
      ASSISTANT_WHATSAPP_FLOW_REGISTRATION_ID: "123456789",
    },
    now: () => now,
    legal: () => ({
      version: legalVersion,
      termsUrl: "https://ewatrade.com/terms",
      privacyUrl: "https://ewatrade.com/privacy",
    }),
    provider: {
      sendText: async ({ body }: { body: string }) => {
        refusal = body
        return { messageId: "reply" }
      },
      sendFlow: async (input: { flowToken: string; screen: string }) => {
        expect(input.screen).toBe("ABOUT_YOU")
        launches++
        flowToken = input.flowToken
        if (ambiguous) throw new Error("transport lost")
        return { messageId: "launch" }
      },
    },
    submit: async (
      _event: unknown,
      _config: unknown,
      signup: WhatsAppOnboardingSignup & { email: string },
    ) => {
      expect(signup.legalVersion).toBe("v1")
      expect(signup).not.toHaveProperty("form_kind")
      submitted++
    },
  }
  const event = (text = "REGISTER", messageId = `message-${++sequence}`) => ({
    kind: "message" as const,
    type: "text" as const,
    phoneNumberId: config.phoneNumberId,
    externalCustomerId: senderId,
    messageId,
    text,
    timestamp: String(now.getTime() / 1000),
  })
  return {
    rows,
    dependencies,
    event,
    get flowToken() {
      return flowToken
    },
    get launches() {
      return launches
    },
    get submitted() {
      return submitted
    },
    get refusal() {
      return refusal
    },
    link: () => {
      linked = true
    },
    changeLegal: () => {
      legalVersion = "v2"
    },
    reply: (
      data: Record<string, unknown> = form,
      id?: string,
      sender = senderId,
    ) =>
      handleWhatsAppRegistrationFlowReturn(
        {
          ...event("", id),
          type: "interactive",
          externalCustomerId: sender,
          flowResponse: { status: "valid", flowToken, data },
        },
        config,
        dependencies,
      ),
  }
}

test("native registration uses hash-only sender-bound form tokens and one canonical proof submission", async () => {
  const h = harness()
  await tryLaunchWhatsAppRegistrationFlow(h.event(), config, h.dependencies)
  expect(JSON.stringify([...h.rows.values()])).not.toContain(h.flowToken)
  await h.reply(form, "foreign", "2348000000002")
  expect(h.submitted).toBe(0)
  await h.reply(form, "completion")
  await h.reply(form, "completion")
  await h.reply(form, "another-completion")
  expect(h.submitted).toBe(1)
})

test("connected identity, cancelled form and changed legal publication cannot issue signup proof", async () => {
  for (const guard of ["linked", "cancelled", "legal", "expired"] as const) {
    const h = harness()
    await tryLaunchWhatsAppRegistrationFlow(h.event(), config, h.dependencies)
    if (guard === "linked") h.link()
    if (guard === "legal") h.changeLegal()
    if (guard === "expired")
      h.dependencies.now = () => new Date(now.getTime() + 31 * 60_000)
    if (guard === "cancelled")
      await cancelWhatsAppRegistrationFlow(
        { phoneNumberId: config.phoneNumberId, senderId },
        h.dependencies,
      )
    await h.reply()
    expect(h.submitted).toBe(0)
  }
})

test("ambiguous launch is never resent on provider replay; existing linked accounts use the account guidance", async () => {
  const h = harness(true)
  const incoming = h.event("REGISTER", "same-launch")
  await tryLaunchWhatsAppRegistrationFlow(incoming, config, h.dependencies)
  await tryLaunchWhatsAppRegistrationFlow(incoming, config, h.dependencies)
  expect(h.launches).toBe(1)
  h.link()
  expect(
    await tryLaunchWhatsAppRegistrationFlow(h.event(), config, h.dependencies),
  ).toBe(false)
  expect(h.launches).toBe(1)
})

test("registration bounds a stalled provider request and preserves unknown/no-resend", async () => {
  const h = harness()
  const controller = new AbortController()
  let attempts = 0
  let started!: () => void
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  const timeout = spyOn(AbortSignal, "timeout").mockImplementation(
    (duration) => {
      expect(duration).toBe(WHATSAPP_DELIVERY_REQUEST_MS)
      return controller.signal
    },
  )
  const requestFetch: typeof fetch = Object.assign(
    async (
      _url: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ): Promise<Response> => {
      attempts++
      expect(init?.redirect).toBe("error")
      expect(init?.signal).toBe(controller.signal)
      started()
      return new Promise((_resolve, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new DOMException("Simulated timeout", "TimeoutError")),
        )
      })
    },
    { preconnect: fetch.preconnect },
  )
  const provider = createWhatsAppRegistrationFlowProvider(requestFetch)
  const dependencies = {
    ...h.dependencies,
    provider: {
      ...h.dependencies.provider,
      sendFlow: provider.sendFlow.bind(provider),
    },
  }
  const incoming = h.event("REGISTER", "stalled-launch")
  try {
    const launch = tryLaunchWhatsAppRegistrationFlow(
      incoming,
      config,
      dependencies,
    )
    await requestStarted
    controller.abort()
    await launch
    await tryLaunchWhatsAppRegistrationFlow(incoming, config, dependencies)
    expect(attempts).toBe(1)
    expect(
      [...h.rows.values()].some(
        (row) =>
          row.formData &&
          typeof row.formData === "object" &&
          "status" in row.formData &&
          row.formData.status === "UNKNOWN",
      ),
    ).toBe(true)
    expect(h.submitted).toBe(0)
  } finally {
    timeout.mockRestore()
  }
})

test("UNDER_13 completion is refused once without email proof or retaining form answers", async () => {
  const h = harness()
  await tryLaunchWhatsAppRegistrationFlow(h.event(), config, h.dependencies)
  await h.reply({ ...form, ageBand: "UNDER_13" })
  expect(h.submitted).toBe(0)
  expect(h.refusal).toContain("13 or older")
  expect(JSON.stringify([...h.rows.values()])).not.toContain(form.email)
})
