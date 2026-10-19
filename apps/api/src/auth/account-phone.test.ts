import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createCallerFactory } from "../trpc/init"
import { authRouter } from "../trpc/routers/auth"

type User = {
  id: string
  email: string
  emailVerified: boolean
  phone: string | null
  phoneVerifiedAt: Date | null
}
type Session = {
  id: string
  userId: string
  token: string
  createdAt: Date
  expiresAt: Date
  qaAuthorizationId: string | null
}
type Verification = {
  id: string
  identifier: string
  value: string
  createdAt: Date
  expiresAt: Date
}
type Bucket = { bucketDigest: string; sentCount: number; windowStartedAt: Date }

const envKeys = [
  "APP_ENV",
  "NODE_ENV",
  "DEV_PROFILE",
  "WHATSAPP_OTP_ENABLED",
  "WHATSAPP_OTP_ACCESS_TOKEN",
  "WHATSAPP_OTP_PHONE_NUMBER_ID",
  "WHATSAPP_OTP_TEMPLATE_NAME",
  "WHATSAPP_OTP_TEMPLATE_LANGUAGE",
  "BETTER_AUTH_SECRET",
  "AUTH_SECRET",
] as const
let previousEnv: Record<string, string | undefined>
let savedFetch: typeof globalThis.fetch

beforeEach(() => {
  previousEnv = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  )
  savedFetch = globalThis.fetch
  Object.assign(process.env, {
    BETTER_AUTH_SECRET: "synthetic-account-phone-api-secret-32-characters",
    DEV_PROFILE: "local",
    APP_ENV: "local",
    NODE_ENV: "test",
    WHATSAPP_OTP_ENABLED: "false",
  })
})

afterEach(() => {
  globalThis.fetch = savedFetch
  for (const key of envKeys) {
    if (previousEnv[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = previousEnv[key]
  }
})

function fixture(options: { sessionToken?: string; qa?: boolean } = {}) {
  const now = new Date()
  const user: User = {
    id: "owner",
    email: "owner@example.test",
    emailVerified: true,
    phone: "+2348000000000",
    phoneVerifiedAt: null,
  }
  const session: Session = {
    id: "owner-session",
    userId: "owner",
    token: options.sessionToken ?? "ordinary-session-token",
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60 * 60_000),
    qaAuthorizationId: null,
  }
  let verifications: Verification[] = []
  let buckets: Bucket[] = []
  let nextId = 0
  let queue = Promise.resolve()
  const tx = {
    session: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === session.id ? session : null,
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === user.id ? user : null,
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string
          phone: string
          emailVerified: true
          phoneVerifiedAt: null
        }
        data: { phoneVerifiedAt: Date }
      }) => {
        if (
          where.id !== user.id ||
          where.phone !== user.phone ||
          where.emailVerified !== user.emailVerified ||
          !user.emailVerified ||
          user.phoneVerifiedAt !== null
        )
          return { count: 0 }
        user.phoneVerifiedAt = data.phoneVerifiedAt
        return { count: 1 }
      },
    },
    accountPrivacyRequest: {
      findUnique: async () => null,
    },
    verification: {
      findFirst: async ({ where }: { where: { identifier: string } }) =>
        verifications.find((row) => row.identifier === where.identifier) ??
        null,
      create: async ({
        data,
      }: {
        data: Omit<Verification, "id" | "createdAt">
      }) => {
        const row = {
          ...data,
          id: `challenge-${++nextId}`,
          createdAt: new Date(),
        }
        verifications.push(row)
        return row
      },
      deleteMany: async ({
        where,
      }: {
        where: {
          identifier?: string
          id?: string
          value?: string
        }
      }) => {
        const before = verifications.length
        verifications = verifications.filter(
          (row) =>
            !(
              (!where.identifier || row.identifier === where.identifier) &&
              (!where.id || row.id === where.id) &&
              (!where.value || row.value === where.value)
            ),
        )
        return { count: before - verifications.length }
      },
      update: async ({
        where,
        data,
      }: { where: { id: string }; data: { value: string } }) => {
        const row = verifications.find((candidate) => candidate.id === where.id)
        if (!row) throw new Error("Challenge disappeared")
        row.value = data.value
        return row
      },
    },
    accountPrivacyRateBucket: {
      findUnique: async ({ where }: { where: { bucketDigest: string } }) =>
        buckets.find((bucket) => bucket.bucketDigest === where.bucketDigest) ??
        null,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { bucketDigest: string }
        create: Bucket
        update: {
          sentCount: number | { increment: number }
          windowStartedAt?: Date
        }
      }) => {
        let bucket = buckets.find(
          (candidate) => candidate.bucketDigest === where.bucketDigest,
        )
        if (!bucket) {
          bucket = { ...create }
          buckets.push(bucket)
        } else {
          bucket.sentCount =
            typeof update.sentCount === "number"
              ? update.sentCount
              : bucket.sentCount + update.sentCount.increment
          if (update.windowStartedAt)
            bucket.windowStartedAt = update.windowStartedAt
        }
        return bucket
      },
    },
  }
  const db = {
    ...tx,
    $transaction: async <T>(action: (client: typeof tx) => Promise<T>) => {
      const previous = queue
      let release = () => {}
      queue = new Promise<void>((resolve) => {
        release = resolve
      })
      await previous
      const snapshot = structuredClone({ verifications, buckets, user })
      try {
        return await action(tx)
      } catch (error) {
        verifications = snapshot.verifications
        buckets = snapshot.buckets
        Object.assign(user, snapshot.user)
        throw error
      } finally {
        release()
      }
    },
    verification: tx.verification,
  }
  const caller = (qa = options.qa ?? false) =>
    createCallerFactory(authRouter)({
      db,
      session: {
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          isPlatformAdmin: false,
        },
        session: {
          id: session.id,
          token: session.token,
          userId: session.userId,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          updatedAt: session.createdAt,
          ipAddress: null,
          userAgent: null,
        },
      },
      qaSessionScope: qa ? { membershipId: "qa" } : null,
      privacyClientIp: "192.0.2.40",
      clientIp: "192.0.2.40",
    } as never)
  return {
    caller,
    user,
    get verifications() {
      return verifications
    },
  }
}

function productionEnv(enabled: "true" | "false" = "true") {
  Object.assign(process.env, {
    APP_ENV: "production",
    DEV_PROFILE: "prod",
    NODE_ENV: "production",
    WHATSAPP_OTP_ENABLED: enabled,
    WHATSAPP_OTP_ACCESS_TOKEN: "synthetic-access-token",
    WHATSAPP_OTP_PHONE_NUMBER_ID: "123456789",
    WHATSAPP_OTP_TEMPLATE_NAME: "account_phone_verification",
    WHATSAPP_OTP_TEMPLATE_LANGUAGE: "en_US",
  })
}

describe("account phone verification API", () => {
  test("disabled Production gate refuses issue and verify before touching persistence", async () => {
    productionEnv("false")
    const db = new Proxy(
      {},
      {
        get() {
          throw new Error("Persistence must not run while the gate is disabled")
        },
      },
    )
    const caller = createCallerFactory(authRouter)({
      db,
      session: {
        user: { id: "owner", email: "owner@example.test", emailVerified: true },
        session: {
          id: "session",
          token: "ordinary-token",
          userId: "owner",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      },
      qaSessionScope: null,
    } as never)
    await expect(caller.requestAccountPhoneOtp({})).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    })
    await expect(
      caller.verifyAccountPhoneOtp({ code: "123456" }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" })
  })

  test("strict router inputs reject phone and account overrides before database reads", async () => {
    const f = fixture()
    const caller = f.caller()
    await expect(
      caller.requestAccountPhoneOtp({ phone: "+2348000000001" } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    await expect(
      caller.verifyAccountPhoneOtp({
        code: "123456",
        userId: "other",
      } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" })
    expect(f.verifications).toHaveLength(0)
    expect(f.user.phoneVerifiedAt).toBeNull()
  })

  test("local issue returns a test code and verification marks only the signed-in account", async () => {
    const f = fixture()
    const caller = f.caller()
    const issued = await caller.requestAccountPhoneOtp({})
    expect(issued).toMatchObject({
      phone: "+2348000000000",
      devCode: "123456",
    })
    await caller.verifyAccountPhoneOtp({ code: "123456" })
    expect(f.user.phoneVerifiedAt).toBeInstanceOf(Date)
    expect(f.verifications).toHaveLength(0)
  })

  test("QA sessions and qas tokens cannot issue or verify account-phone challenges", async () => {
    const qa = fixture({ qa: true })
    await expect(qa.caller().requestAccountPhoneOtp({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    })
    expect(qa.verifications).toHaveLength(0)

    const derived = fixture({ sessionToken: "qas_scoped-token" })
    await expect(
      derived.caller().requestAccountPhoneOtp({}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      derived.caller().verifyAccountPhoneOtp({ code: "123456" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(derived.verifications).toHaveLength(0)
    expect(derived.user.phoneVerifiedAt).toBeNull()
  })

  test("Production never returns the code and provider failure removes the exact challenge", async () => {
    productionEnv()
    let failSend = false
    let sentCode: string | null = null
    globalThis.fetch = Object.assign(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toContain("graph.facebook.com")
        const body = JSON.parse(String(init?.body)) as {
          template: {
            components: Array<{
              parameters?: Array<{ text?: string }>
            }>
          }
        }
        sentCode =
          body.template.components
            .flatMap((component) => component.parameters ?? [])
            .map((parameter) => parameter.text)
            .find((text) => text && /^\d{6}$/.test(text)) ?? null
        return Response.json(
          failSend
            ? { error: "synthetic" }
            : { messages: [{ id: "wamid.synthetic" }] },
          { status: failSend ? 503 : 200 },
        )
      },
      { preconnect: savedFetch.preconnect },
    )

    const successful = fixture()
    const result = await successful.caller().requestAccountPhoneOtp({})
    expect(result.devCode).toBeNull()
    expect(sentCode).toMatch(/^\d{6}$/)
    expect(successful.verifications).toHaveLength(1)
    expect(successful.verifications[0]?.value).not.toContain(sentCode ?? "")
    if (!sentCode)
      throw new Error("Mock WhatsApp request did not contain a code")
    await successful.caller().verifyAccountPhoneOtp({ code: sentCode })
    expect(successful.user.phoneVerifiedAt).toBeInstanceOf(Date)

    failSend = true
    sentCode = null
    const failed = fixture()
    await expect(
      failed.caller().requestAccountPhoneOtp({}),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" })
    expect(failed.verifications).toHaveLength(0)
    expect(failed.user.phoneVerifiedAt).toBeNull()
  })
})
