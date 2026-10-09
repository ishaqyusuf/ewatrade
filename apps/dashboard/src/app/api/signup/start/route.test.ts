import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

const realEmail = await import("@ewatrade/email")
const dispatch = mock(
  async (
    messages: import("@ewatrade/email").EmailMessage[],
  ): Promise<import("@ewatrade/email").EmailDispatchResult[]> =>
    messages.map((message) => ({
      message,
      status: "sent" as const,
      provider: "fixture",
    })),
)
mock.module("@ewatrade/email", () => ({
  ...realEmail,
  dispatchEmailMessages: dispatch,
}))

type Session = {
  id: string
  token: string
  completed: boolean
  expiresAt: Date
  formData: Record<string, unknown>
}
type Lead = {
  id: string
  type: string
  email: string
  fullName: string
  companyName: string | null
  phone: string | null
  metadata: Record<string, unknown>
}
const sessions = new Map<string, Session>()
const leads: Lead[] = []
let existingUser = false
let legalEffective = true
const db = {
  user: {
    findUnique: async () => (existingUser ? { id: "user-1" } : null),
  },
  leadCapture: {
    count: async ({
      where,
    }: {
      where: { email?: string; metadata?: { equals: string } }
    }) =>
      leads.filter((lead) =>
        where.email
          ? lead.email === where.email
          : lead.metadata.clientHash === where.metadata?.equals,
      ).length,
    create: async ({ data }: { data: Omit<Lead, "id"> }) => {
      const lead = { ...data, id: `lead-${leads.length}` }
      leads.push(lead)
      return lead
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      leads.find((lead) => lead.id === where.id) ?? null,
    update: async ({
      where,
      data,
    }: {
      where: { id: string }
      data: Partial<Lead>
    }) => {
      const lead = leads.find((entry) => entry.id === where.id)
      if (lead) Object.assign(lead, data)
      return lead
    },
  },
  onboardingSession: {
    create: async ({ data }: { data: Omit<Session, "id" | "completed"> }) => {
      const value = {
        ...data,
        id: `session-${sessions.size}`,
        completed: false,
      }
      sessions.set(value.token, value)
      return value
    },
  },
}
mock.module("@ewatrade/db", () => ({
  prisma: {
    ...db,
    $transaction: async (run: (tx: typeof db) => Promise<unknown>) => run(db),
  },
}))
const realLegal = await import("@ewatrade/utils/legal-approval")
mock.module("@ewatrade/utils/legal-approval", () => ({
  ...realLegal,
  isApprovedLegalPublication: () => legalEffective,
  isSignupAvailableForLegalPublication: (effective: boolean) => effective,
}))
const { POST } = await import("./route")

const keys = [
  "NODE_ENV",
  "APP_ENV",
  "VERCEL_ENV",
  "NEXT_PUBLIC_SIGNUP_ENABLED",
  "NEXT_PUBLIC_DASHBOARD_URL",
  "EMAIL_QA_DOMAIN_ROUTES",
] as const
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
beforeEach(() => {
  sessions.clear()
  leads.length = 0
  existingUser = false
  legalEffective = true
  mock.clearAllMocks()
  Reflect.set(process.env, "NODE_ENV", "production")
  process.env.APP_ENV = "production"
  process.env.VERCEL_ENV = "production"
  process.env.NEXT_PUBLIC_SIGNUP_ENABLED = "true"
  process.env.NEXT_PUBLIC_DASHBOARD_URL = "https://dash.ewatrade.com"
  Reflect.deleteProperty(process.env, "EMAIL_QA_DOMAIN_ROUTES")
})
afterEach(() => {
  for (const key of keys) {
    const value = previous[key]
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else Reflect.set(process.env, key, value)
  }
})

const input = {
  fullName: "Ada Nwosu",
  email: "Ada@Example.com",
  businessName: "Ada Farm Fresh",
  businessProfileKey: "animal-feed-agricultural-supplies",
}
function start(body: unknown = input, address = "203.0.113.7") {
  return POST(
    new NextRequest("https://dash.ewatrade.com/api/signup/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": address,
      },
      body: JSON.stringify(body),
    }),
  )
}

test("starts a setup session and emails a verification link", async () => {
  const response = await start()
  const body = await response.json()
  expect(response.status).toBe(200)
  expect(body.accessToken).toMatch(/^ea_[A-Za-z0-9_-]{43}$/)
  const session = sessions.get(body.accessToken)
  expect(session?.formData).toMatchObject({
    kind: "early_access",
    email: "ada@example.com",
    companyName: "Ada Farm Fresh",
    draft: { businessProfileKey: "animal-feed-agricultural-supplies" },
  })
  expect(session?.formData.emailVerifiedAt).toBeUndefined()
  expect(leads[0]).toMatchObject({ type: "SIGNUP", email: "ada@example.com" })
  expect(leads[0]?.metadata.clientHash).toBeString()
  expect(JSON.stringify(leads[0]?.metadata)).not.toContain("203.0.113.7")
  const verification = [...sessions.values()].find(
    (entry) => entry.formData.kind === "early_access_verification",
  )
  expect(verification?.formData.accessToken).toBe(body.accessToken)
  expect(dispatch.mock.lastCall?.[0][0]?.to).toBe("ada@example.com")
  expect(dispatch.mock.lastCall?.[0][0]?.text).toContain(
    "https://dash.ewatrade.com/api/early-access/verify?token=ear_",
  )
})

test("is closed while the signup switch is off or the Terms gate is closed", async () => {
  process.env.NEXT_PUBLIC_SIGNUP_ENABLED = "false"
  expect((await start()).status).toBe(403)
  process.env.NEXT_PUBLIC_SIGNUP_ENABLED = "true"
  legalEffective = false
  expect((await start()).status).toBe(412)
  expect(sessions.size).toBe(0)
  expect(dispatch).not.toHaveBeenCalled()
})

test("rejects existing accounts and invalid input before writing", async () => {
  expect((await start({ email: "ada@example.com" })).status).toBe(400)
  expect(
    (await start({ ...input, businessProfileKey: "../Not Valid" })).status,
  ).toBe(400)
  existingUser = true
  expect((await start()).status).toBe(409)
  expect(sessions.size).toBe(0)
})

test("limits repeated starts per email and per client", async () => {
  for (let attempt = 0; attempt < 3; attempt++)
    expect((await start()).status).toBe(200)
  expect((await start()).status).toBe(429)
  for (let attempt = 0; attempt < 7; attempt++)
    expect(
      (await start({ ...input, email: `owner${attempt}@example.com` })).status,
    ).toBe(200)
  expect((await start({ ...input, email: "another@example.com" })).status).toBe(
    429,
  )
  expect(
    (await start({ ...input, email: "another@example.com" }, "198.51.100.2"))
      .status,
  ).toBe(200)
})

test("Preview rejects signup start before any writes", async () => {
  process.env.VERCEL_ENV = "preview"
  expect((await start()).status).toBe(503)
  expect(sessions.size).toBe(0)
})
