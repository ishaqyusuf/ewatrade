import { afterEach, beforeEach, expect, test } from "bun:test"
import { createCallerFactory } from "../init"
import { accountPrivacyRouter } from "./account-privacy"

const keys = [
  "ACCOUNT_PRIVACY_OTP_SECRET",
  "DEV_PROFILE",
  "APP_ENV",
  "NODE_ENV",
] as const
let previous: Record<string, string | undefined>
beforeEach(() => {
  previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  Object.assign(process.env, {
    ACCOUNT_PRIVACY_OTP_SECRET: "synthetic-phone-deletion-secret-32-characters",
    DEV_PROFILE: "local",
    APP_ENV: "local",
    NODE_ENV: "test",
  })
})
afterEach(() => {
  for (const key of keys) {
    if (previous[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = previous[key]
  }
})

type Challenge = {
  id: string
  emailDigest: string
  codeDigest: string
  contactEmail: string
  expiresAt: Date
  sentAt: Date
  windowStartedAt: Date
  sentCount: number
  attempts: number
}
type Bucket = { bucketDigest: string; windowStartedAt: Date; sentCount: number }
type Subject = {
  id: string
  email: string
  emailVerified: boolean
  phone: string | null
  phoneVerifiedAt: Date | null
}
type RequestInput = {
  requestKey: string
  userId: string
  verifiedSubjectUserId: string
  contactEmail: string
  verifiedAt: Date
}
type Request = RequestInput & {
  id: string
  status: string
  requestedAt: Date
  updatedAt: Date
  completedAt: null
}
type CounterUpdate = number | { increment: number }
function fixture() {
  const challenges = new Map<string, Challenge>()
  const buckets = new Map<string, Bucket>()
  const requests = new Map<string, Request>()
  const users = new Map<string, Subject>([
    [
      "phone-owner",
      {
        id: "phone-owner",
        email: "internal@phone.ewatrade.invalid",
        emailVerified: false,
        phone: "+99912345678900",
        phoneVerifiedAt: new Date(),
      },
    ],
    [
      "other-owner",
      {
        id: "other-owner",
        email: "contact@example.com",
        emailVerified: true,
        phone: null,
        phoneVerifiedAt: null,
      },
    ],
    [
      "another-phone",
      {
        id: "another-phone",
        email: "another@phone.ewatrade.invalid",
        emailVerified: false,
        phone: "+99912345678901",
        phoneVerifiedAt: new Date(),
      },
    ],
  ])
  const tx = {
    user: {
      findUnique: async ({
        where,
      }: { where: { id?: string; email?: string } }) =>
        where.id
          ? users.get(where.id)
          : ([...users.values()].find((u) => u.email === where.email) ?? null),
    },
    accountPrivacyRateBucket: {
      findUnique: async ({ where }: { where: { bucketDigest: string } }) =>
        buckets.get(where.bucketDigest) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { bucketDigest: string }
        create: Bucket
        update: { sentCount: CounterUpdate; windowStartedAt?: Date }
      }) => {
        const row = buckets.get(where.bucketDigest)
        if (row) {
          row.sentCount =
            typeof update.sentCount === "number"
              ? update.sentCount
              : row.sentCount + update.sentCount.increment
          if (update.windowStartedAt)
            row.windowStartedAt = update.windowStartedAt
        } else buckets.set(where.bucketDigest, { ...create })
      },
    },
    accountPrivacyChallenge: {
      findUnique: async ({ where }: { where: { emailDigest: string } }) =>
        challenges.get(where.emailDigest) ?? null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { emailDigest: string }
        create: Omit<Challenge, "id" | "attempts" | "sentCount">
        update: Partial<Omit<Challenge, "sentCount">> & {
          sentCount: CounterUpdate
        }
      }) => {
        const old = challenges.get(where.emailDigest)
        const row = old
          ? {
              ...old,
              ...update,
              sentCount:
                typeof update.sentCount === "number"
                  ? update.sentCount
                  : old.sentCount + update.sentCount.increment,
              windowStartedAt: update.windowStartedAt ?? old.windowStartedAt,
            }
          : { ...create, id: where.emailDigest, attempts: 0, sentCount: 1 }
        challenges.set(where.emailDigest, row)
        return row
      },
      updateMany: async ({
        where,
      }: { where: { id: string; attempts: { lt: number } } }) => {
        const row = [...challenges.values()].find((r) => r.id === where.id)
        if (row && row.attempts < where.attempts.lt) {
          row.attempts++
          return { count: 1 }
        }
        return { count: 0 }
      },
      deleteMany: async ({
        where,
      }: {
        where: {
          id?: string
          emailDigest?: string
          codeDigest: string
          expiresAt?: { gt: Date }
          attempts?: { lt: number }
          sentAt?: Date
        }
      }) => {
        const row = [...challenges.values()].find(
          (r) =>
            (where.id
              ? r.id === where.id
              : r.emailDigest === where.emailDigest) &&
            r.codeDigest === where.codeDigest &&
            (!where.sentAt || r.sentAt.getTime() === where.sentAt.getTime()) &&
            (!where.expiresAt || r.expiresAt > where.expiresAt.gt) &&
            (!where.attempts || r.attempts < where.attempts.lt),
        )
        if (!row) return { count: 0 }
        challenges.delete(row.emailDigest)
        return { count: 1 }
      },
    },
    accountPrivacyRequest: {
      upsert: async ({
        where,
        create,
      }: { where: { requestKey: string }; create: RequestInput }) => {
        const row = requests.get(where.requestKey) ?? {
          ...create,
          id: "deletion-request",
          status: "RECEIVED",
          requestedAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        }
        requests.set(where.requestKey, row)
        return row
      },
    },
  }
  const db = {
    ...tx,
    $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
  }
  const caller = (
    id = "phone-owner",
    options: { createdAt?: Date | string; token?: string; qa?: boolean } = {},
  ) =>
    createCallerFactory(accountPrivacyRouter)({
      db,
      privacyClientIp: "192.0.2.50",
      qaSessionScope: options.qa ? {} : null,
      session: {
        user: users.get(id),
        session: {
          id: "ordinary-session",
          token: options.token ?? "ordinary-token",
          createdAt: options.createdAt ?? new Date(),
        },
      },
    } as never)
  return { caller, db, challenges, users, requests }
}

test("fresh phone-only account can request deletion after verifying its own contact, without claiming the contact's other account", async () => {
  const f = fixture()
  const caller = f.caller()
  const issued = await caller.requestDeletionContactCode({
    email: "contact@example.com",
  })
  expect(issued.devCode).toBe("123456")
  if (!issued.devCode) throw new Error("Missing local fixture code")
  await caller.requestDeletion({
    confirmation: "DELETE MY ACCOUNT",
    contactEmail: "contact@example.com",
    contactCode: issued.devCode,
  })
  const request = f.requests.get("account-deletion:phone-owner")
  if (!request) throw new Error("Missing fixture request")
  expect(request.verifiedSubjectUserId).toBe("phone-owner")
  expect(request.contactEmail).toBe("contact@example.com")
  expect(f.requests.has("account-deletion:other-owner")).toBe(false)
  expect(f.users.get("phone-owner")?.emailVerified).toBe(false)
  expect(f.challenges.size).toBe(0)
})

test("phone proof alone cannot bypass contact verification", async () => {
  const f = fixture()
  await expect(
    f.caller().requestDeletion({ confirmation: "DELETE MY ACCOUNT" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(f.requests.size).toBe(0)
})

test("stale, future, invalid and QA sessions cannot issue contact codes or deletion requests", async () => {
  const f = fixture()
  for (const options of [
    { createdAt: new Date(Date.now() - 16 * 60_000) },
    { createdAt: new Date(Date.now() + 60_000) },
    { createdAt: "invalid" },
    { token: "qas_synthetic" },
    { qa: true },
  ]) {
    await expect(
      f
        .caller("phone-owner", options)
        .requestDeletionContactCode({ email: "contact@example.com" }),
    ).rejects.toThrow()
    await expect(
      f.caller("phone-owner", options).requestDeletion({
        confirmation: "DELETE MY ACCOUNT",
        contactEmail: "contact@example.com",
        contactCode: "123456",
      }),
    ).rejects.toThrow()
  }
  const user = f.users.get("phone-owner")
  if (!user) throw new Error("Missing fixture user")
  user.phoneVerifiedAt = null
  await expect(
    f.caller().requestDeletionContactCode({ email: "contact@example.com" }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
  expect(f.challenges.size).toBe(0)
  expect(f.requests.size).toBe(0)
})

test("contact challenges are account scoped, single use, expiring and limited to five wrong attempts", async () => {
  const f = fixture()
  const caller = f.caller()
  await caller.requestDeletionContactCode({ email: "contact@example.com" })
  const input = {
    confirmation: "DELETE MY ACCOUNT" as const,
    contactEmail: "contact@example.com",
    contactCode: "123456",
  }
  await expect(
    f.caller("another-phone").requestDeletion(input),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(f.requests.size).toBe(0)
  for (let i = 0; i < 5; i++)
    await expect(
      caller.requestDeletion({ ...input, contactCode: "654321" }),
    ).rejects.toThrow()
  await expect(caller.requestDeletion(input)).rejects.toThrow()
  const challenge = [...f.challenges.values()][0]
  if (!challenge) throw new Error("Missing fixture challenge")
  expect(challenge.attempts).toBe(5)
  challenge.attempts = 0
  challenge.expiresAt = new Date(Date.now() - 1)
  await expect(caller.requestDeletion(input)).rejects.toThrow()
  challenge.expiresAt = new Date(Date.now() + 60_000)
  await caller.requestDeletion(input)
  await expect(caller.requestDeletion(input)).rejects.toThrow()
  expect(f.requests.size).toBe(1)
})

test("public email verification cannot be reused for another account's authenticated deletion", async () => {
  const { createExternalDeletionChallenge } = await import(
    "@ewatrade/db/queries"
  )
  const f = fixture()
  const issued = await createExternalDeletionChallenge(
    f.db as never,
    "contact@example.com",
    "192.0.2.50",
  )
  expect(issued).not.toBeNull()
  if (!issued) throw new Error("Missing fixture issue")
  await expect(
    f.caller().requestDeletion({
      confirmation: "DELETE MY ACCOUNT",
      contactEmail: "contact@example.com",
      contactCode: issued.code,
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  expect(f.requests.size).toBe(0)
})

test("verified email accounts retain their existing deletion path and ignore caller identity overrides", async () => {
  const f = fixture()
  await f
    .caller("other-owner")
    .requestDeletion({ confirmation: "DELETE MY ACCOUNT" })
  expect(f.requests.get("account-deletion:other-owner")?.contactEmail).toBe(
    "contact@example.com",
  )
  await expect(
    f.caller().requestDeletion({
      confirmation: "DELETE MY ACCOUNT",
      userId: "other-owner",
    } as never),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
  await expect(
    f
      .caller()
      .requestDeletionContactCode({ email: "internal@phone.ewatrade.invalid" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" })
})

test("resend cooldown and shared recipient budget apply across different phone accounts", async () => {
  const f = fixture()
  await f.caller().requestDeletionContactCode({ email: "contact@example.com" })
  await expect(
    f.caller().requestDeletionContactCode({ email: "contact@example.com" }),
  ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
  await f
    .caller("another-phone")
    .requestDeletionContactCode({ email: "contact@example.com" })
  for (const challenge of f.challenges.values())
    challenge.sentAt = new Date(Date.now() - 3 * 60_000)
  await f.caller().requestDeletionContactCode({ email: "contact@example.com" })
  for (const challenge of f.challenges.values())
    challenge.sentAt = new Date(Date.now() - 3 * 60_000)
  await f.caller().requestDeletionContactCode({ email: "contact@example.com" })
  for (const challenge of f.challenges.values())
    challenge.sentAt = new Date(Date.now() - 3 * 60_000)
  await f.caller().requestDeletionContactCode({ email: "contact@example.com" })
  for (const challenge of f.challenges.values())
    challenge.sentAt = new Date(Date.now() - 3 * 60_000)
  await expect(
    f
      .caller("another-phone")
      .requestDeletionContactCode({ email: "contact@example.com" }),
  ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
})

test("production contact verification never exposes a code and cleans failed delivery without accepting a request", async () => {
  const savedFetch = globalThis.fetch
  const mailKeys = [
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "EMAIL_DELIVERY_MODE",
    "EMAIL_CAPTURE_FILE",
  ] as const
  const savedMail = Object.fromEntries(
    mailKeys.map((key) => [key, process.env[key]]),
  )
  Object.assign(process.env, {
    APP_ENV: "production",
    DEV_PROFILE: "prod",
    NODE_ENV: "production",
    RESEND_API_KEY: "synthetic-key",
    EMAIL_FROM: "privacy@example.invalid",
    EMAIL_DELIVERY_MODE: "live",
  })
  Reflect.deleteProperty(process.env, "EMAIL_CAPTURE_FILE")
  let sentText = ""
  let shouldFail = false
  globalThis.fetch = Object.assign(
    async (url: unknown, init?: { body?: unknown }) => {
      if (String(url) !== "https://api.resend.com/emails")
        throw Error("Unexpected provider")
      const body = JSON.parse(String(init?.body)) as { text: string }
      sentText = body.text
      return Response.json(
        shouldFail ? { error: "synthetic" } : { id: "synthetic-send" },
        { status: shouldFail ? 503 : 200 },
      )
    },
    { preconnect: savedFetch.preconnect },
  )
  try {
    const f = fixture()
    const result = await f
      .caller()
      .requestDeletionContactCode({ email: "contact@example.com" })
    expect(result).toEqual({ sent: true, devCode: null })
    const deliveredCode = sentText.match(/\b\d{6}\b/)?.[0]
    if (!deliveredCode) throw Error("No code in synthetic delivery")
    expect([...f.challenges.values()][0]?.codeDigest).not.toContain(
      deliveredCode,
    )
    await f.caller().requestDeletion({
      confirmation: "DELETE MY ACCOUNT",
      contactEmail: "contact@example.com",
      contactCode: deliveredCode,
    })
    expect(f.requests.size).toBe(1)
    shouldFail = true
    const failed = fixture()
    await expect(
      failed
        .caller()
        .requestDeletionContactCode({ email: "contact@example.com" }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" })
    expect(failed.challenges.size).toBe(0)
    expect(failed.requests.size).toBe(0)
  } finally {
    globalThis.fetch = savedFetch
    for (const key of mailKeys) {
      if (savedMail[key] === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = savedMail[key]
    }
  }
})

test("missing verification configuration never creates a contact challenge", async () => {
  const f = fixture()
  Reflect.deleteProperty(process.env, "ACCOUNT_PRIVACY_OTP_SECRET")
  await expect(
    f.caller().requestDeletionContactCode({ email: "contact@example.com" }),
  ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  expect(f.challenges.size).toBe(0)
  expect(f.requests.size).toBe(0)
})
