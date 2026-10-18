import { afterEach, beforeEach, expect, test } from "bun:test"
import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import type { TRPCContext } from "../init"
import { createTRPCRouter } from "../init"
import { accountPrivacyRouter } from "./account-privacy"

const router = createTRPCRouter({ accountPrivacy: accountPrivacyRouter })
const keys = [
  "ACCOUNT_PRIVACY_OTP_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "EMAIL_DELIVERY_MODE",
  "EMAIL_CAPTURE_FILE",
  "APP_ENV",
  "DEV_PROFILE",
  "TEST_EMAIL",
  "TEST_EMAILS",
  "EMAIL_QA_DOMAIN_ROUTES",
] as const
let previous: Record<string, string | undefined>
let originalFetch: typeof fetch
let deliveries: Array<{ to: string[]; text: string }>
let deliveryFails: boolean

beforeEach(() => {
  previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  originalFetch = globalThis.fetch
  deliveries = []
  deliveryFails = false
  for (const key of keys) Reflect.deleteProperty(process.env, key)
  Object.assign(process.env, {
    ACCOUNT_PRIVACY_OTP_SECRET: "synthetic-intake-secret-with-32-characters",
    RESEND_API_KEY: "synthetic-provider-key",
    EMAIL_FROM: "privacy@example.invalid",
    EMAIL_DELIVERY_MODE: "live",
    APP_ENV: "local",
    DEV_PROFILE: "local",
  })
  globalThis.fetch = Object.assign(
    async (url: string | URL | Request, init?: RequestInit) => {
      if (url !== "https://api.resend.com/emails")
        throw Error("Unexpected network call")
      deliveries.push(JSON.parse(String(init?.body)))
      return Response.json(
        deliveryFails ? { error: "fixture failure" } : { id: "fixture-send" },
        { status: deliveryFails ? 503 : 200 },
      )
    },
    { preconnect: originalFetch.preconnect },
  ) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
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
  sentAt: Date
  expiresAt: Date
  windowStartedAt: Date
  attempts: number
  sentCount: number
}
type Bucket = { bucketDigest: string; windowStartedAt: Date; sentCount: number }

function fixture(matched = true) {
  let challenge: Challenge | null = null
  let request: Record<string, unknown> | null = null
  let transactions = 0
  const buckets = new Map<string, Bucket>()
  const challenges = {
    findUnique: async () => challenge,
    upsert: async ({
      create,
    }: { create: Omit<Challenge, "id" | "attempts" | "sentCount"> }) => {
      challenge = {
        ...create,
        id: "challenge-fixture",
        attempts: 0,
        sentCount: 1,
      }
      return challenge
    },
    updateMany: async () => {
      if (challenge) challenge.attempts += 1
      return { count: challenge ? 1 : 0 }
    },
    deleteMany: async ({ where }: { where: { codeDigest: string } }) => {
      if (!challenge || challenge.codeDigest !== where.codeDigest)
        return { count: 0 }
      challenge = null
      return { count: 1 }
    },
  }
  const tx = {
    accountPrivacyChallenge: challenges,
    accountPrivacyRateBucket: {
      findUnique: async ({ where }: { where: { bucketDigest: string } }) =>
        buckets.get(where.bucketDigest) ?? null,
      upsert: async ({ create }: { create: Bucket }) => {
        buckets.set(create.bucketDigest, create)
        return create
      },
    },
    user: {
      findUnique: async () =>
        matched ? { id: "subject-fixture", emailVerified: true } : null,
    },
    accountPrivacyRequest: {
      findMany: async () => [],
      upsert: async ({ create }: { create: Record<string, unknown> }) => {
        request ??= {
          ...create,
          id: "request-fixture",
          status: "RECEIVED",
          requestedAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        }
        return request
      },
    },
  }
  const db = {
    ...tx,
    $transaction: async (fn: (client: typeof tx) => unknown) => {
      transactions += 1
      return fn(tx)
    },
  }
  return {
    db,
    buckets,
    challenge: () => challenge,
    request: () => request,
    transactions: () => transactions,
  }
}

async function http(
  state: ReturnType<typeof fixture>,
  name: string,
  input?: unknown,
  privacyClientIp: string | null = "192.0.2.10",
) {
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    router,
    req: new Request(
      `https://fixture.invalid/api/trpc/accountPrivacy.${name}`,
      input === undefined
        ? undefined
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ json: input }),
          },
    ),
    createContext: async () =>
      ({
        db: state.db,
        session: null,
        privacyClientIp,
        requestId: "intake-fixture",
      }) as unknown as TRPCContext,
  })
  return { status: response.status, body: await response.json() }
}

test("HTTP intake sends a private code, verifies it once and records pending requests for matched and unmatched emails", async () => {
  for (const matched of [true, false]) {
    const state = fixture(matched)
    const email = matched ? "account@example.com" : "unmatched@example.com"
    expect(
      (await http(state, "externalIntakeAvailability")).body.result.data.json
        .available,
    ).toBe(true)
    const send = await http(state, "requestExternalCode", { email })
    expect(send.status).toBe(200)
    expect(send.body.result.data.json).toEqual({ sent: true })
    expect(state.request()).toBeNull()
    const delivery = deliveries.at(-1)
    expect(delivery?.to).toEqual([email])
    const code = delivery?.text.match(/\b\d{6}\b/)?.[0]
    expect(code).toBeDefined()
    if (!code) throw new Error("Verification template did not contain a code")
    expect(JSON.stringify(send.body)).not.toContain(code)
    const invalid = code === "000000" ? "111111" : "000000"
    expect(
      (await http(state, "submitExternalRequest", { email, code: invalid }))
        .status,
    ).toBe(400)
    expect(state.request()).toBeNull()
    const receipt = await http(state, "submitExternalRequest", { email, code })
    expect(receipt.status).toBe(200)
    expect(receipt.body.result.data.json.status).toBe("RECEIVED")
    expect(state.request()?.verifiedSubjectUserId).toBe(
      matched ? "subject-fixture" : null,
    )
    expect(state.request()?.contactEmail).toBe(email)
    expect(state.challenge()).toBeNull()
    expect(
      (await http(state, "submitExternalRequest", { email, code })).status,
    ).toBe(400)
  }
})

test("HTTP intake refuses disabled/captured mail and missing trusted source before database or provider calls", async () => {
  for (const setting of ["disabled", "capture", "source"] as const) {
    const state = fixture()
    process.env.EMAIL_DELIVERY_MODE =
      setting === "disabled" ? "console" : "live"
    if (setting === "capture")
      process.env.EMAIL_CAPTURE_FILE = "/private/fixture-only.json"
    else Reflect.deleteProperty(process.env, "EMAIL_CAPTURE_FILE")
    const source = setting === "source" ? null : "192.0.2.10"
    expect(
      (await http(state, "externalIntakeAvailability", undefined, source)).body
        .result.data.json.available,
    ).toBe(false)
    expect(
      (
        await http(
          state,
          "requestExternalCode",
          { email: "account@example.com" },
          source,
        )
      ).status,
    ).toBe(412)
    expect(state.transactions()).toBe(0)
    expect(deliveries).toHaveLength(0)
  }
})

test("HTTP throttle stays neutral, and failed delivery removes only its code while preserving rate counters", async () => {
  const state = fixture()
  const email = "account@example.com"
  await http(state, "requestExternalCode", { email })
  expect(
    (await http(state, "requestExternalCode", { email })).body.result.data.json,
  ).toEqual({ sent: true })
  expect(deliveries).toHaveLength(1)
  const failed = fixture()
  deliveryFails = true
  expect((await http(failed, "requestExternalCode", { email })).status).toBe(
    503,
  )
  expect(failed.challenge()).toBeNull()
  expect(failed.request()).toBeNull()
  expect(failed.buckets.size).toBe(3)
})
