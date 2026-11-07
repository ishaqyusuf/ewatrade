import { beforeEach, expect, mock, test } from "bun:test"
import { hashPassword, verifyPassword } from "better-auth/crypto"

// Real installed Better Auth + Prisma adapter; inert persistence/provider boundaries.
type Row = Record<string, unknown>
type Query = { where?: Row; data?: Row; select?: Row; take?: number }
let rows: Record<string, Row[]> = {}
let failRevoke = false
const scheduled: Array<() => Promise<void>> = []
const sent: Row[] = []
let lookups = 0
let failDelivery = false
const oldPassword = "previous-secret-password"
const newPassword = "replacement-secret-password"
const oldHash = await hashPassword(oldPassword)
const origin = "https://ewatrade-dashboard.localhost"
process.env.DASHBOARD_URL = origin
process.env.BETTER_AUTH_SECRET =
  "inert-recovery-test-secret-at-least-thirty-two-characters"

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND")
      return (value as Row[]).every((part) => matches(row, part))
    if (key === "OR") return (value as Row[]).some((part) => matches(row, part))
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const rule = value as Row
      if ("equals" in rule) return row[key] === rule.equals
      if ("lt" in rule) return Number(row[key]) < Number(rule.lt)
      if ("in" in rule) return (rule.in as unknown[]).includes(row[key])
    }
    return row[key] === value
  })
}
function model(name: string) {
  const list = () => rows[name] ?? []
  return {
    async findFirst(input: Query) {
      if (name === "user") lookups++
      const row = list().find((row) => matches(row, input.where))
      if (!row) return null
      return structuredClone({
        ...row,
        ...(input.select?.accounts
          ? {
              accounts: rows.account?.filter(
                (account) => account.userId === row.id,
              ),
            }
          : {}),
      })
    },
    async findMany(input: Query) {
      return structuredClone(
        list()
          .filter((row) => matches(row, input.where))
          .slice(0, input.take),
      )
    },
    async create(input: Query) {
      const row = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...input.data,
      }
      rows[name]?.push(row)
      return structuredClone(row)
    },
    async updateMany(input: Query) {
      let count = 0
      for (const row of list())
        if (matches(row, input.where)) {
          Object.assign(row, input.data)
          count++
        }
      return { count }
    },
    async update(input: Query) {
      const row = list().find((row) => matches(row, input.where))
      Object.assign(row ?? {}, input.data)
      return structuredClone(row)
    },
    async delete(input: Query) {
      const row = list().find((row) => matches(row, input.where))
      if (!row) throw Object.assign(new Error("missing"), { code: "P2025" })
      rows[name] = list().filter((item) => item !== row)
      return structuredClone(row)
    },
    async deleteMany(input: Query) {
      if (name === "session" && failRevoke)
        throw new Error("inert revocation failure")
      const before = list().length
      rows[name] = list().filter((row) => !matches(row, input.where))
      return { count: before - rows[name].length }
    },
  }
}
const db = {
  user: model("user"),
  account: model("account"),
  session: model("session"),
  verification: model("verification"),
  accountPrivacyRateBucket: {
    async upsert(input: { where: { bucketDigest: string }; create: Row }) {
      const existing = rows.budget?.find(
        (row) => row.bucketDigest === input.where.bucketDigest,
      )
      if (existing) existing.sentCount = Number(existing.sentCount) + 1
      else rows.budget?.push({ ...input.create })
      return existing ?? input.create
    },
  },
  async $transaction<T>(operation: (tx: typeof db) => Promise<T>): Promise<T> {
    const before = structuredClone(rows)
    try {
      return await operation(db)
    } catch (error) {
      rows = before
      throw error
    }
  },
}
mock.module("@ewatrade/db", () => ({ prisma: db }))
mock.module("@ewatrade/db/account-privacy-access", () => ({
  isAccountPrivacyAccessBlocked: async () => false,
}))
mock.module("@ewatrade/db/legal-session-access", () => ({
  isLegalSignupSessionBlocked: async () => false,
}))
mock.module("next/server", () => ({
  after: (operation: () => Promise<void>) => scheduled.push(operation),
}))
mock.module("@ewatrade/email", () => ({
  renderPasswordResetTemplate: (input: Row) => ({
    html: input.resetUrl,
    text: input.resetUrl,
  }),
  createManagedQaEmailMessages: async (input: Row) => [input],
  dispatchEmailMessages: async (messages: Row[]) => {
    sent.push(...messages)
    return [{ status: failDelivery ? "failed" : "sent" }]
  },
}))
const { handlePasswordRecovery, passwordRecoveryOrigin } = await import(
  "./password-recovery"
)
const { initAuth } = await import("@ewatrade/auth")

beforeEach(() => {
  rows = {
    user: [
      {
        id: "user-1",
        name: "Test",
        email: "owner@example.invalid",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    account: [
      {
        id: "account-1",
        userId: "user-1",
        accountId: "user-1",
        providerId: "credential",
        password: oldHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    session: [
      {
        id: "session-1",
        userId: "user-1",
        token: "old-session",
        expiresAt: new Date(Date.now() + 86400_000),
      },
    ],
    verification: [],
    budget: [],
  }
  scheduled.length = 0
  sent.length = 0
  lookups = 0
  failRevoke = false
  failDelivery = false
})
function call(action: "request" | "reset", body: Row, requestOrigin = origin) {
  return handlePasswordRecovery(
    new Request(`${origin}/api/auth/${action}`, {
      method: "POST",
      headers: {
        origin: requestOrigin,
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.1",
      },
      body: JSON.stringify(body),
    }),
    action,
  )
}
async function issue() {
  expect(
    (
      await call("request", {
        email: "OWNER@example.invalid",
        redirectTo: "https://evil.invalid",
      })
    ).status,
  ).toBe(200)
  await scheduled.shift()?.()
  const url = new URL(String(sent[0]?.text))
  expect(url.origin).toBe(origin)
  expect(url.pathname).toBe("/reset-password")
  expect(url.search).toBe("")
  return new URLSearchParams(url.hash.slice(1)).get("token") ?? ""
}

test("known and unknown addresses return identical responses before lookup or mail", async () => {
  const known = await call("request", { email: "owner@example.invalid" })
  const unknown = await call("request", { email: "missing@example.invalid" })
  expect(await known.json()).toEqual(await unknown.json())
  expect(lookups).toBe(0)
  expect(sent).toHaveLength(0)
  for (const task of scheduled) await task()
  expect(sent).toHaveLength(1)
  expect(known.headers.get("cache-control")).toBe("no-store")
})

test("hashed fifteen-minute token resets real credential, revokes sessions, and new password signs in", async () => {
  const token = await issue()
  expect(token.length).toBeGreaterThanOrEqual(24)
  const verification = rows.verification?.[0]
  expect(String(verification?.identifier)).not.toContain(token)
  expect(Number(verification?.expiresAt) - Date.now()).toBeGreaterThan(890_000)
  expect(Number(verification?.expiresAt) - Date.now()).toBeLessThanOrEqual(
    900_000,
  )
  expect((await call("reset", { token, newPassword })).status).toBe(200)
  expect(rows.session).toHaveLength(0)
  expect(rows.verification).toHaveLength(0)
  const hash = String(rows.account?.[0]?.password)
  expect(await verifyPassword({ hash, password: newPassword })).toBe(true)
  expect(await verifyPassword({ hash, password: oldPassword })).toBe(false)
  const auth = initAuth({ baseUrl: origin })
  await expect(
    auth.api.signInEmail({
      body: { email: "owner@example.invalid", password: oldPassword },
    }),
  ).rejects.toThrow()
  const signedIn = await auth.api.signInEmail({
    body: { email: "owner@example.invalid", password: newPassword },
  })
  expect(signedIn.user.id).toBe("user-1")
  const replay = await call("reset", { token, newPassword: "another-password" })
  expect(replay.status).toBe(400)
  expect(await replay.json()).toMatchObject({ code: "INVALID_TOKEN" })
})

test("expired and missing tokens refuse credential changes", async () => {
  const token = await issue()
  if (rows.verification?.[0]) rows.verification[0].expiresAt = new Date(0)
  for (const value of [token, "missing-token"]) {
    const response = await call("reset", { token: value, newPassword })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" })
  }
  expect(rows.account?.[0]?.password).toBe(oldHash)
  expect(rows.session).toHaveLength(1)
})

test("invalid password does not spend the link", async () => {
  const token = await issue()
  for (const password of ["short", "a".repeat(129)])
    expect((await call("reset", { token, newPassword: password })).status).toBe(
      400,
    )
  expect(rows.verification).toHaveLength(1)
  expect((await call("reset", { token, newPassword })).status).toBe(200)
})

test("revocation failure rolls back password and token together", async () => {
  const token = await issue()
  failRevoke = true
  expect((await call("reset", { token, newPassword })).status).toBe(503)
  expect(rows.account?.[0]?.password).toBe(oldHash)
  expect(rows.verification).toHaveLength(1)
  expect(rows.session).toHaveLength(1)
  failRevoke = false
  expect((await call("reset", { token, newPassword })).status).toBe(200)
})

test("origin, schema and persistent normalized-email limits precede account lookup", async () => {
  expect(passwordRecoveryOrigin()).toBe(origin)
  expect(
    (
      await call(
        "request",
        { email: "owner@example.invalid" },
        "https://evil.invalid",
      )
    ).status,
  ).toBe(403)
  expect((await call("request", { email: "bad" })).status).toBe(400)
  for (let index = 0; index < 3; index++)
    expect(
      (await call("request", { email: "OWNER@example.invalid" })).status,
    ).toBe(200)
  expect(
    (await call("request", { email: "owner@example.invalid" })).status,
  ).toBe(429)
  expect(lookups).toBe(0)
  expect(JSON.stringify(rows.budget)).not.toContain("example.invalid")
  expect(JSON.stringify(rows.budget)).not.toContain("192.0.2.1")
})

test("delivery failure never changes the public response or leaks a provider error", async () => {
  failDelivery = true
  const response = await call("request", { email: "owner@example.invalid" })
  expect(response.status).toBe(200)
  await scheduled.shift()?.()
  expect(await response.json()).toMatchObject({
    message: expect.stringContaining("If an account exists"),
  })
})

test("concurrent consumption of one token admits only one password reset", async () => {
  const token = await issue()
  const { initPasswordRecoveryAuth } = await import("@ewatrade/auth")
  const first = initPasswordRecoveryAuth({
    baseUrl: origin,
    sendResetPassword: async () => {},
  })
  const second = initPasswordRecoveryAuth({
    baseUrl: origin,
    sendResetPassword: async () => {},
  })
  // Separate SDK instances share the actual adapter's atomic consume operation.
  const outcomes = await Promise.allSettled([
    first.api.resetPassword({ body: { token, newPassword } }),
    second.api.resetPassword({
      body: { token, newPassword: "competing-password" },
    }),
  ])
  expect(
    outcomes.filter((outcome) => outcome.status === "fulfilled"),
  ).toHaveLength(1)
  expect(
    outcomes.filter((outcome) => outcome.status === "rejected"),
  ).toHaveLength(1)
  expect(rows.verification).toHaveLength(0)
})
