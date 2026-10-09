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
  companyName: string
  metadata: Record<string, unknown>
}
const sessions = new Map<string, Session>()
let lead: Lead
let writes = 0
let refuseClaim = false
const db = {
  leadCapture: {
    create: async ({ data }: { data: Omit<Lead, "id"> }) => {
      writes++
      lead = { ...data, id: "synthetic-lead" }
      return lead
    },
    findUnique: async () => lead,
    update: async ({ data }: { data: Partial<Lead> }) => {
      Object.assign(lead, data)
      return lead
    },
  },
  $executeRaw: async () => 1,
  onboardingSession: {
    count: async () => 0,
    create: async ({ data }: { data: Omit<Session, "id" | "completed"> }) => {
      writes++
      const value = {
        ...data,
        id: `session-${sessions.size}`,
        completed: false,
      }
      sessions.set(value.token, value)
      return value
    },
    findUnique: async ({ where }: { where: { token: string } }) =>
      sessions.get(where.token) ?? null,
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: string; completed: boolean; expiresAt?: { gt: Date } }
      data: Partial<Session>
    }) => {
      const value = [...sessions.values()].find(
        (entry) =>
          entry.id === where.id &&
          entry.completed === where.completed &&
          (!where.expiresAt || entry.expiresAt > where.expiresAt.gt),
      )
      if (!value || refuseClaim) return { count: 0 }
      Object.assign(value, data)
      return { count: 1 }
    },
  },
}
mock.module("@ewatrade/db", () => ({
  LeadCaptureType: { EARLY_ACCESS: "EARLY_ACCESS" },
  prisma: {
    ...db,
    $transaction: async (run: (tx: typeof db) => Promise<unknown>) => run(db),
  },
}))
const { POST } = await import("./route")
const { GET: approve, HEAD: approvalHead } = await import("./approve/route")
const { POST: verification } = await import("./verification/route")
const { GET: verify } = await import("./verify/route")
const { GET: lookup } = await import("./session/route")
const keys = [
  "NODE_ENV",
  "APP_ENV",
  "VERCEL_ENV",
  "EMAIL_QA_DOMAIN_ROUTES",
  "NEXT_PUBLIC_MARKETING_URL",
  "NEXT_PUBLIC_DASHBOARD_URL",
  "MARKETING_INBOX_EMAILS",
  "EMAIL_REPLY_TO",
] as const
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
beforeEach(() => {
  sessions.clear()
  writes = 0
  refuseClaim = false
  mock.clearAllMocks()
  Reflect.set(process.env, "NODE_ENV", "production")
  process.env.APP_ENV = "production"
  process.env.VERCEL_ENV = "production"
  process.env.NEXT_PUBLIC_MARKETING_URL = "https://www.ewatrade.com"
  process.env.NEXT_PUBLIC_DASHBOARD_URL = "https://ewatrade.com/dashboard"
  process.env.MARKETING_INBOX_EMAILS = "review@example.com"
  process.env.EMAIL_QA_DOMAIN_ROUTES = '{"ishaq.qa.test":"tester@example.com"}'
  dispatch.mockImplementation(async (messages) =>
    messages.map((message) => ({
      message,
      status: "sent",
      provider: "fixture",
    })),
  )
})
afterEach(() => {
  for (const key of keys) {
    const value = previous[key]
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else Reflect.set(process.env, key, value)
  }
})
const input = {
  fullName: "QA Test Owner",
  email: "owner@example.com",
  companyName: "Test Business",
  businessSize: "2_to_10",
  recordSystem: "spreadsheets",
  launchTimeline: "within_30_days",
  setupNeeds: ["inventory", "sales"],
}
function request(path: string, body?: unknown) {
  return new NextRequest(
    `https://www.ewatrade.com${path}`,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  )
}
// New early-access intake is retired; seed a legacy request so previously
// sent approval and verification links stay covered.
async function submit(email = input.email) {
  lead = {
    id: "synthetic-lead",
    type: "EARLY_ACCESS",
    email,
    fullName: input.fullName,
    companyName: input.companyName,
    metadata: {},
  }
  const token = `ear_${crypto.randomUUID().replaceAll("-", "")}`
  sessions.set(token, {
    id: `session-${sessions.size}`,
    token,
    completed: false,
    expiresAt: new Date(Date.now() + 30 * 86400000),
    formData: {
      kind: "early_access_request",
      leadId: lead.id,
      requestedAt: new Date().toISOString(),
    },
  })
}
function sessionOfKind(kind: string) {
  const value = [...sessions.values()].find(
    (entry) => entry.formData.kind === kind,
  )
  if (!value) throw new Error(`Missing ${kind} session`)
  return value
}
function pending() {
  return sessionOfKind("early_access_request")
}
function approved() {
  return sessionOfKind("early_access")
}
async function approvePending() {
  return approve(request(`/api/early-access/approve?token=${pending().token}`))
}

test("new early access requests are retired without writes or email", async () => {
  const response = await POST()
  expect(response.status).toBe(410)
  expect((await response.json()).signupUrl).toContain("/signup")
  expect(writes).toBe(0)
  expect(dispatch).not.toHaveBeenCalled()
})
test("approval issues a recipient-bound setup link; retry reuses it without renewing expiry", async () => {
  await submit()
  expect((await approvePending()).status).toBe(200)
  expect(sessions.size).toBe(2)
  expect(pending().completed).toBe(true)
  const token = approved().token
  const expiry = approved().expiresAt.getTime()
  expect(approved().formData).toMatchObject({
    email: input.email,
    companyName: input.companyName,
  })
  expect(dispatch.mock.lastCall?.[0].map((message) => message.to)).toEqual([
    input.email,
  ])
  expect(dispatch.mock.lastCall?.[0][0]?.text).toContain("approved")
  expect((await approvePending()).status).toBe(200)
  expect(sessions.size).toBe(2)
  expect(approved().token).toBe(token)
  expect(approved().expiresAt.getTime()).toBe(expiry)
  const body = await (
    await lookup(request(`/api/early-access/session?token=${token}`))
  ).json()
  expect(body.emailVerified).toBe(false)
})

test("verification links are bound to the approved session and unlock email verification", async () => {
  await submit()
  await approvePending()
  const response = await verification(
    request("/api/early-access/verification", {
      accessToken: approved().token,
    }),
  )
  expect(response.status).toBe(200)
  const verificationSession = sessionOfKind("early_access_verification")
  expect(
    verificationSession.expiresAt.getTime() - Date.now(),
  ).toBeLessThanOrEqual(86400000)
  expect(dispatch.mock.lastCall?.[0][0]?.to).toBe(input.email)
  const confirmed = await verify(
    request(`/api/early-access/verify?token=${verificationSession.token}`),
  )
  expect(confirmed.status).toBe(303)
  expect(confirmed.headers.get("location")).toBe(approved().formData.accessUrl)
  expect(confirmed.headers.get("cache-control")).toBe("no-store")
  expect(verificationSession.completed).toBe(true)
  const body = await (
    await lookup(request(`/api/early-access/session?token=${approved().token}`))
  ).json()
  expect(body.emailVerified).toBe(true)
})

test("production QA approval and verification deliver every handoff to the tester inbox", async () => {
  await submit("owner@ishaq.qa.test")
  expect((await approvePending()).status).toBe(200)
  const confirmation = await verification(
    request("/api/early-access/verification", {
      accessToken: approved().token,
    }),
  )
  const verificationBody = await confirmation.json()
  expect(verificationBody.qaPreview.stage).toBe("verification")
  expect(
    (await verify(new NextRequest(verificationBody.qaPreview.accessUrl)))
      .status,
  ).toBe(303)
  expect(dispatch).toHaveBeenCalledTimes(2)
  expect(
    dispatch.mock.calls.flatMap(([messages]) =>
      messages.map((message) => message.to),
    ),
  ).toEqual(["tester@example.com", "tester@example.com"])
})

test("invalid, expired and consumed approvals cannot grant setup", async () => {
  expect(
    (await approve(request("/api/early-access/approve?token=invalid"))).status,
  ).toBe(404)
  await submit()
  pending().expiresAt = new Date(Date.now() - 1000)
  expect((await approvePending()).status).toBe(410)
  expect(sessions.size).toBe(1)
  pending().expiresAt = new Date(Date.now() + 60000)
  await approvePending()
  approved().completed = true
  expect((await approvePending()).status).toBe(410)
})

test("concurrent request claim failure does not create a second setup session", async () => {
  await submit()
  refuseClaim = true
  expect((await approvePending()).status).toBe(409)
  expect(sessions.size).toBe(1)
})

test("delivery failure is surfaced and approval delivery can retry the same setup link", async () => {
  await submit()
  dispatch.mockImplementation(async (messages) =>
    messages.map((message) => ({
      message,
      status: "failed",
      provider: "fixture",
    })),
  )
  expect((await approvePending()).status).toBe(502)
  const token = approved().token
  dispatch.mockImplementation(async (messages) =>
    messages.map((message) => ({
      message,
      status: "sent",
      provider: "fixture",
    })),
  )
  expect((await approvePending()).status).toBe(200)
  expect(approved().token).toBe(token)
})

test("Preview rejects request, approval, verification and verify before any writes", async () => {
  process.env.VERCEL_ENV = "preview"
  expect(
    (await approve(request("/api/early-access/approve?token=x"))).status,
  ).toBe(503)
  expect(
    (
      await verification(
        request("/api/early-access/verification", { accessToken: "x" }),
      )
    ).status,
  ).toBe(503)
  expect(
    (await verify(request("/api/early-access/verify?token=x"))).status,
  ).toBe(503)
  expect(writes).toBe(0)
  expect(dispatch).not.toHaveBeenCalled()
})

test("expired verification and mismatched contact do not verify the approved email", async () => {
  await submit()
  await approvePending()
  await verification(
    request("/api/early-access/verification", {
      accessToken: approved().token,
    }),
  )
  const session = sessionOfKind("early_access_verification")
  session.expiresAt = new Date(Date.now() - 1000)
  expect(
    (await verify(request(`/api/early-access/verify?token=${session.token}`)))
      .status,
  ).toBe(410)
  session.expiresAt = new Date(Date.now() + 60000)
  session.formData.email = "other@example.com"
  expect(
    (await verify(request(`/api/early-access/verify?token=${session.token}`)))
      .status,
  ).toBe(410)
  expect(approved().formData.emailVerifiedAt).toBeUndefined()
})

test("HEAD cannot approve a request", async () => {
  await submit()
  expect(approvalHead().status).toBe(405)
  expect(sessions.size).toBe(1)
})

test("old marketing invitations verify into dashboard and approval retries email dashboard links", async () => {
  await submit()
  await approvePending()
  approved().formData.accessUrl = `https://www.ewatrade.com/signup?access_token=${approved().token}`
  await approvePending()
  expect(dispatch.mock.lastCall?.[0][0]?.text).toContain(
    "https://ewatrade.com/dashboard/signup?access_token=",
  )
  await verification(
    request("/api/early-access/verification", {
      accessToken: approved().token,
    }),
  )
  expect(dispatch.mock.lastCall?.[0][0]?.text).toContain(
    "https://ewatrade.com/dashboard/api/early-access/verify?token=",
  )
  const confirmed = await verify(
    request(
      `/api/early-access/verify?token=${sessionOfKind("early_access_verification").token}`,
    ),
  )
  expect(confirmed.headers.get("location")).toBe(
    `https://ewatrade.com/dashboard/signup?access_token=${approved().token}`,
  )
})
