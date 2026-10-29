import { beforeEach, expect, mock, test } from "bun:test"
import { createHmac } from "node:crypto"

const secret = "inert-session-read-secret-at-least-thirty-two-characters"
const origin = "http://localhost:3095"
const now = new Date()
const day = 86_400_000
const user = {
  id: "inert-user",
  name: "Inert user",
  email: "inert@example.invalid",
  emailVerified: true,
  image: null,
  firstName: "Inert",
  lastName: null,
  displayName: "Inert display",
  avatarUrl: null,
  phone: null,
  isPlatformAdmin: false,
  createdAt: now,
  updatedAt: now,
}
const session = {
  id: "inert-session",
  token: "inert-token",
  userId: user.id,
  expiresAt: new Date(now.getTime() + 7 * day),
  createdAt: now,
  updatedAt: now,
  ipAddress: null,
  userAgent: null,
}
const account = {
  id: "inert-account",
  userId: user.id,
  accountId: user.id,
  providerId: "credential",
  password: "inert-password-hash",
  createdAt: now,
  updatedAt: now,
}
type ReadInput = {
  where?: Record<string, unknown>
  select?: Record<string, unknown>
}
let currentSession: typeof session | null
let currentUser: typeof user | null
let failure: Error | undefined
const reads: { model: string; input: ReadInput }[] = []
const writes: { operation: string; input: unknown }[] = []
const policyCalls: string[] = []
let privacyBlocked = false
let legalBlocked = false

const db = {
  session: {
    findFirst: async (input: ReadInput) => {
      reads.push({ model: "session", input })
      if (failure) throw failure
      if (!currentSession) return null
      return structuredClone({
        ...currentSession,
        ...(input.select?.user ? { user: currentUser } : {}),
      })
    },
    findMany: async (input: ReadInput) => {
      reads.push({ model: "sessions", input })
      return currentSession
        ? [structuredClone({ ...currentSession, user: currentUser })]
        : []
    },
    deleteMany: async (input: unknown) => {
      writes.push({ operation: "delete", input })
      return { count: 1 }
    },
    update: async (input: { data: Partial<typeof session> }) => {
      writes.push({ operation: "update", input })
      return { ...session, ...input.data }
    },
    create: async (input: { data: typeof session }) => {
      writes.push({ operation: "create", input })
      return input.data
    },
  },
  user: {
    findFirst: async (input: ReadInput) => {
      reads.push({ model: "user", input })
      if (!currentUser) return null
      return structuredClone({
        ...currentUser,
        ...(input.select?.accounts ? { accounts: [account] } : {}),
      })
    },
  },
  account: {
    findFirst: async (input: ReadInput) => {
      reads.push({ model: "account", input })
      return structuredClone({
        ...account,
        ...(input.select?.user ? { user: currentUser } : {}),
      })
    },
    findMany: async (input: ReadInput) => {
      reads.push({ model: "accounts", input })
      return [structuredClone(account)]
    },
  },
}

// Only the repository/policy boundaries are inert. SDK, adapter, cookie signature,
// session expiry/refresh and application auth configuration run unchanged.
mock.module("@ewatrade/db", () => ({ prisma: db }))
mock.module("@ewatrade/db/account-privacy-access", () => ({
  isAccountPrivacyAccessBlocked: async () => {
    policyCalls.push("privacy")
    return privacyBlocked
  },
}))
mock.module("@ewatrade/db/legal-session-access", () => ({
  isLegalSignupSessionBlocked: async () => {
    policyCalls.push("legal")
    return legalBlocked
  },
}))
const { initAuth } = await import("./index")

function auth() {
  return initAuth({ baseUrl: origin, productionUrl: origin, secret })
}

function headers(token = session.token, validSignature = true) {
  const signature = createHmac("sha256", secret).update(token).digest("base64")
  return new Headers({
    cookie: `better-auth.session_token=${encodeURIComponent(`${token}.${validSignature ? signature : "invalid"}`)}`,
  })
}

beforeEach(() => {
  currentSession = structuredClone(session)
  currentUser = structuredClone(user)
  failure = undefined
  reads.length = 0
  writes.length = 0
  policyCalls.length = 0
  privacyBlocked = false
  legalBlocked = false
})

test("real getSession admits the signed current session through one joined repository read", async () => {
  const result = await auth().api.getSession({ headers: headers() })
  expect(result).toEqual({ session, user })
  expect(reads).toHaveLength(1)
  expect(reads[0]?.input.where).toEqual({ token: { equals: session.token } })
  expect(reads[0]?.input.select?.user).toBe(true)
  expect(writes).toHaveLength(0)
})

test("unsigned, malformed and missing cookies never reach the repository", async () => {
  const app = auth()
  for (const requestHeaders of [
    new Headers(),
    new Headers({ cookie: "better-auth.session_token=unsigned" }),
    headers("inert-token", false),
  ]) {
    expect(await app.api.getSession({ headers: requestHeaders })).toBeNull()
  }
  expect(reads).toHaveLength(0)
  expect(writes).toHaveLength(0)
})

test("QA-derived tokens remain intact for the API's separate current proof check", async () => {
  currentSession = { ...session, token: "qas_inert-token" }
  expect(
    (await auth().api.getSession({ headers: headers(currentSession.token) }))
      ?.session.token,
  ).toBe(currentSession.token)
  expect(reads).toHaveLength(1)
})

test("missing current session refuses admission", async () => {
  currentSession = null
  expect(await auth().api.getSession({ headers: headers() })).toBeNull()
  expect(reads).toHaveLength(1)
  expect(writes).toHaveLength(0)
})

test("missing joined user refuses admission", async () => {
  currentUser = null
  expect(await auth().api.getSession({ headers: headers() })).toBeNull()
  expect(writes).toHaveLength(0)
})

test("expired current session remains refused and deleted by the SDK", async () => {
  currentSession = { ...session, expiresAt: new Date(now.getTime() - day) }
  expect(await auth().api.getSession({ headers: headers() })).toBeNull()
  expect(writes).toEqual([
    {
      operation: "delete",
      input: { where: { token: { equals: session.token } } },
    },
  ])
})

test("repeated calls reread current session and user; revocation is never cached", async () => {
  const app = auth()
  expect(await app.api.getSession({ headers: headers() })).not.toBeNull()
  currentUser = { ...user, name: "Current name" }
  expect((await app.api.getSession({ headers: headers() }))?.user.name).toBe(
    "Current name",
  )
  currentSession = null
  expect(await app.api.getSession({ headers: headers() })).toBeNull()
  expect(reads).toHaveLength(3)
  expect(writes).toHaveLength(0)
})

test("due refresh retains the SDK update and expiry policy", async () => {
  currentSession = { ...session, expiresAt: new Date(now.getTime() + day) }
  const result = await auth().api.getSession({ headers: headers() })
  expect(result?.session.expiresAt.getTime()).toBeGreaterThan(
    now.getTime() + 6 * day,
  )
  expect(writes.map((item) => item.operation)).toEqual(["update"])
})

test("read failure is still an SDK rejection", async () => {
  failure = new Error("inert repository failure")
  await expect(
    auth().api.getSession({ headers: headers() }),
  ).rejects.toMatchObject({
    status: "INTERNAL_SERVER_ERROR",
  })
  expect(writes).toHaveLength(0)
})

test("batch session lookup keeps joined user data through the installed adapter", async () => {
  const context = await auth().$context
  expect(await context.internalAdapter.findSessions([session.token])).toEqual([
    { session, user },
  ])
  expect(reads).toHaveLength(1)
  expect(reads[0]?.input.select?.user).toBe(true)
})

test("account joins preserve the application's accounts and user relation names", async () => {
  const context = await auth().$context
  expect(
    await context.internalAdapter.findUserByEmail(user.email, {
      includeAccounts: true,
    }),
  ).toMatchObject({ user, accounts: [account] })
  expect(reads).toHaveLength(1)
  expect(reads[0]?.input.select?.accounts).toEqual({ take: 100 })
  reads.length = 0
  expect(
    await context.internalAdapter.findOAuthUser(
      user.email,
      account.accountId,
      account.providerId,
    ),
  ).toMatchObject({ user, linkedAccount: account, accounts: [account] })
  expect(reads).toHaveLength(1)
  expect(reads[0]?.input.select?.user).toBe(true)
})

test("session creation keeps privacy and legal hooks before writing", async () => {
  const context = await auth().$context
  privacyBlocked = true
  await expect(
    context.internalAdapter.createSession(user.id),
  ).rejects.toMatchObject({
    status: "FORBIDDEN",
  })
  expect(policyCalls).toEqual(["privacy"])
  expect(writes).toHaveLength(0)
  privacyBlocked = false
  legalBlocked = true
  policyCalls.length = 0
  await expect(
    context.internalAdapter.createSession(user.id),
  ).rejects.toMatchObject({
    status: "FORBIDDEN",
  })
  expect(policyCalls).toEqual(["privacy", "legal"])
  expect(writes).toHaveLength(0)
  legalBlocked = false
  policyCalls.length = 0
  expect(await context.internalAdapter.createSession(user.id)).toMatchObject({
    userId: user.id,
  })
  expect(policyCalls).toEqual(["privacy", "legal"])
  expect(writes.map((item) => item.operation)).toEqual(["create"])
})
