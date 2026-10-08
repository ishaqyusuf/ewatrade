import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

// Exercise the real start service, verification issuer and continuation handlers
// with a transaction/lock fixture. No provider or database mutation is performed.
type Session = {
  id: string
  token: string
  expiresAt: Date
  completed: boolean
  formData: Record<string, unknown>
}
type Lead = {
  id: string
  email: string
  createdAt: Date
  metadata: Record<string, unknown>
}
const sessions = new Map<string, Session>()
const leads: Lead[] = []
const locks = new Map<string, Promise<void>>()
let existingUser = false
let legalAvailable = true
let deliveryFails = false
let releaseLocks: Array<() => void> = []
const dispatch = mock(async (messages: Array<{ to: string }>) =>
  messages.map((message) => ({
    message,
    status: deliveryFails ? "failed" : "sent",
    provider: "fixture",
  })),
)
const email = await import("@ewatrade/email")
mock.module("@ewatrade/email", () => ({
  ...email,
  dispatchEmailMessages: dispatch,
}))
const legal = await import("@ewatrade/utils/legal-approval")
mock.module("@ewatrade/utils/legal-approval", () => ({
  ...legal,
  isSignupAvailableForLegalPublication: () => legalAvailable,
}))
const db = {
  user: { findUnique: async () => (existingUser ? { id: "existing" } : null) },
  leadCapture: {
    count: async ({
      where,
    }: {
      where: {
        email?: string
        createdAt: { gt: Date }
        metadata?: { equals: string }
      }
    }) =>
      leads.filter(
        (lead) =>
          lead.createdAt > where.createdAt.gt &&
          (!where.email || lead.email === where.email) &&
          (!where.metadata ||
            lead.metadata.clientHash === where.metadata.equals),
      ).length,
    create: async ({ data }: { data: Omit<Lead, "id" | "createdAt"> }) => {
      const lead = {
        ...data,
        id: `lead-${leads.length}`,
        createdAt: new Date(),
      }
      leads.push(lead)
      return lead
    },
    findUnique: async ({ where }: { where: { id: string } }) =>
      leads.find((lead) => lead.id === where.id),
    update: async ({
      where,
      data,
    }: { where: { id: string }; data: Partial<Lead> }) => {
      const lead = leads.find((lead) => lead.id === where.id)
      if (!lead) throw new Error("Missing fixture lead")
      Object.assign(lead, data)
      return lead
    },
  },
  onboardingSession: {
    count: async ({
      where,
    }: {
      where: { AND: Array<{ formData: { path: string[]; equals: string } }> }
    }) =>
      [...sessions.values()].filter((session) =>
        where.AND.every(
          ({ formData }) =>
            session.formData[formData.path[0] ?? ""] === formData.equals,
        ),
      ).length,
    create: async ({ data }: { data: Omit<Session, "id" | "completed"> }) => {
      const session = {
        ...data,
        id: `session-${sessions.size}`,
        completed: false,
      }
      sessions.set(session.token, session)
      return session
    },
    findUnique: async ({ where }: { where: { token: string } }) =>
      sessions.get(where.token) ?? null,
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; completed: boolean }
      data: Partial<Session>
    }) => {
      const session = [...sessions.values()].find(
        (row) => row.id === where.id && row.completed === where.completed,
      )
      if (!session) return { count: 0 }
      Object.assign(session, data)
      return { count: 1 }
    },
  },
}
mock.module("@ewatrade/db", () => ({
  prisma: {
    ...db,
    $transaction: async (
      run: (
        tx: typeof db & {
          $executeRaw: (
            parts: TemplateStringsArray,
            identity: string,
          ) => Promise<number>
        },
      ) => Promise<unknown>,
    ) => {
      const releases: Array<() => void> = []
      try {
        return await run({
          ...db,
          $executeRaw: async (_parts, identity) => {
            const previous = locks.get(identity) ?? Promise.resolve()
            let release!: () => void
            const next = new Promise<void>((resolve) => {
              release = resolve
            })
            locks.set(
              identity,
              previous.then(() => next),
            )
            await previous
            releases.push(release)
            releaseLocks.push(release)
            return 1
          },
        })
      } finally {
        for (const release of releases.reverse()) release()
      }
    },
  },
}))

const { POST } = await import("./handler")
const { GET: lookup } = await import("../../early-access/session/handler")
const { POST: resend } = await import("../../early-access/verification/handler")
const { consumeApprovedOnboarding } = await import(
  "@ewatrade/db/onboarding-continuation"
)
const { GET: verify } = await import("../../early-access/verify/handler")
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
  locks.clear()
  releaseLocks = []
  existingUser = false
  legalAvailable = true
  deliveryFails = false
  dispatch.mockClear()
  Reflect.set(process.env, "NODE_ENV", "production")
  process.env.APP_ENV = "production"
  process.env.VERCEL_ENV = "production"
  process.env.NEXT_PUBLIC_SIGNUP_ENABLED = "true"
  process.env.NEXT_PUBLIC_DASHBOARD_URL = "https://dashboard.ewatrade.com"
  process.env.EMAIL_QA_DOMAIN_ROUTES = '{"ishaq.qa.test":"tester@example.com"}'
})
afterEach(() => {
  for (const release of releaseLocks) release()
  for (const key of keys) {
    const value = previous[key]
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else Reflect.set(process.env, key, value)
  }
})
const input = {
  fullName: "QA Signup Owner",
  email: "owner@ishaq.qa.test",
  businessName: "Fixture Business",
  businessProfileKey: "animal-feed-agricultural-supplies",
}
function request(body: unknown = input, ip = "192.0.2.1") {
  return new NextRequest("https://dashboard.ewatrade.com/api/signup/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  })
}

test("start issues an unverified recipient-bound setup, profile and tester email", async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  const body = await response.json()
  const session = sessions.get(body.accessToken)
  expect(session?.formData).toMatchObject({
    email: input.email,
    draft: { businessProfileKey: input.businessProfileKey },
  })
  expect(session?.formData.emailVerifiedAt).toBeUndefined()
  await expect(
    consumeApprovedOnboarding(db as never, {
      token: body.accessToken,
      email: input.email,
      businessName: input.businessName,
    }),
  ).rejects.toMatchObject({ code: "UNVERIFIED" })
  expect(leads[0]?.metadata.clientHash).toBeString()
  expect(JSON.stringify(leads)).not.toContain("192.0.2.1")
  expect(dispatch.mock.lastCall?.[0][0]?.to).toBe("tester@example.com")
  expect(body.qaPreview.accessUrl).toStartWith(
    "https://dashboard.ewatrade.com/api/early-access/verify?",
  )
  const lookupRequest = new NextRequest(
    `https://dashboard.ewatrade.com/api/early-access/session?token=${body.accessToken}`,
  )
  expect((await (await lookup(lookupRequest)).json()).emailVerified).toBe(false)
  expect((await verify(new NextRequest(body.qaPreview.accessUrl))).status).toBe(
    303,
  )
  expect((await (await lookup(lookupRequest)).json()).emailVerified).toBe(true)
  // Replaying confirmation resumes the same setup, never creates an account.
  expect((await verify(new NextRequest(body.qaPreview.accessUrl))).status).toBe(
    303,
  )
  expect(sessions.size).toBe(2)
})

test("switch, legal and Preview gates refuse before any persistence or delivery", async () => {
  process.env.NEXT_PUBLIC_SIGNUP_ENABLED = "false"
  expect((await POST(request())).status).toBe(403)
  process.env.NEXT_PUBLIC_SIGNUP_ENABLED = "true"
  legalAvailable = false
  expect((await POST(request())).status).toBe(412)
  legalAvailable = true
  process.env.VERCEL_ENV = "preview"
  expect((await POST(request())).status).toBe(503)
  expect(leads).toHaveLength(0)
  expect(dispatch).not.toHaveBeenCalled()
})

test("invalid profile and malformed payload cannot create sessions", async () => {
  expect(
    (
      await POST(
        request({ ...input, businessProfileKey: "not-a-real-business" }),
      )
    ).status,
  ).toBe(400)
  expect((await POST(request({ ...input, email: "invalid" }))).status).toBe(400)
  expect(
    (await POST(request({ ...input, accessToken: "injected" }))).status,
  ).toBe(400)
  expect(sessions.size).toBe(0)
  expect(leads).toHaveLength(0)
  expect(dispatch).not.toHaveBeenCalled()
})

test("profile deep links persist canonical operating models through session readback", async () => {
  for (const [businessProfileKey, operatingModel] of [
    ["laundry-dry-cleaning", "services"],
    ["animal-feed-agricultural-supplies", "products"],
    ["fabrics-tailoring", "products_and_services"],
  ]) {
    const response = await POST(request({ ...input, businessProfileKey }))
    expect(response.status).toBe(200)
    const { accessToken } = await response.json()
    const readback = await lookup(
      new NextRequest(
        `https://dashboard.ewatrade.com/api/early-access/session?token=${accessToken}`,
      ),
    )
    expect((await readback.json()).draft).toMatchObject({
      businessProfileKey,
      operatingModel,
    })
  }
})

test("existing account is refused and email budget serializes concurrent starts", async () => {
  existingUser = true
  expect((await POST(request())).status).toBe(409)
  existingUser = false
  const responses = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      POST(
        request(
          {
            ...input,
            email: index % 2 ? input.email.toUpperCase() : input.email,
          },
          `192.0.2.${index + 1}`,
        ),
      ),
    ),
  )
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 200, 200, 429, 429,
  ])
  expect(leads).toHaveLength(3)
})

test("client budget serializes starts for different emails", async () => {
  const responses = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      POST(request({ ...input, email: `owner${index}@ishaq.qa.test` })),
    ),
  )
  expect(responses.filter((response) => response.status === 200)).toHaveLength(
    10,
  )
  expect(responses.filter((response) => response.status === 429)).toHaveLength(
    2,
  )
  expect(leads).toHaveLength(10)
})

test("email failure is surfaced without marking the setup verified", async () => {
  deliveryFails = true
  expect((await POST(request())).status).toBe(502)
  const setup = [...sessions.values()].find(
    (session) => session.formData.kind === "early_access",
  )
  expect(setup?.formData.emailVerifiedAt).toBeUndefined()
})

test("verification resend is serialized and bounded per setup session", async () => {
  const body = await (await POST(request())).json()
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      resend(request({ accessToken: body.accessToken })),
    ),
  )
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 200, 429, 429,
  ])
  expect(dispatch).toHaveBeenCalledTimes(3)
})
