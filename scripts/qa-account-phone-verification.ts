import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
assert.equal(process.env.DATABASE_PROFILE_VERIFIED, "1")
assert.equal(process.env.APP_ENV, "local")
assert.equal(process.env.DEV_PROFILE, "local")
assert.equal(process.env.NODE_ENV, "production")
process.env.WHATSAPP_OTP_ENABLED = "true"
process.env.WHATSAPP_OTP_ACCESS_TOKEN = "synthetic-never-leaves-process"
process.env.WHATSAPP_OTP_PHONE_NUMBER_ID = "1392318457295932"
process.env.WHATSAPP_OTP_TEMPLATE_NAME = "ewatrade_login_otp"
process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE = "en_US"
process.env.ACCOUNT_PRIVACY_TRUSTED_CLIENT_IP_HEADER = "x-real-ip"
process.env.WHATSAPP_ASSISTANT_ENABLED = "false"
process.env.PERFORMANCE_TRACE = "false"
const { prisma } = await import("../packages/db/src/client")
const { default: app } = await import("../apps/api/src/index")
const phone = "+447700900351"
const marker = `account-phone-fixture-${randomUUID()}`
const startedAt = new Date()
let userId: string | undefined
let sessionId: string | undefined
let code = ""
let sends = 0
const originalFetch = globalThis.fetch
const existing = await prisma.user.findUnique({
  where: { phone },
  select: { id: true },
})
assert.equal(existing, null, "Owned synthetic fixture phone must be absent")
async function call(path: string, input?: object, token?: string) {
  const url = new URL(`/api/trpc/${path}`, "https://api.ewatrade.com")
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-real-ip": "192.0.2.232",
  }
  if (token) headers.authorization = `Bearer ${token}`
  if (input === undefined)
    url.searchParams.set("input", JSON.stringify({ json: null }))
  const response = await app.fetch(
    new Request(url, {
      method: input === undefined ? "GET" : "POST",
      headers,
      ...(input === undefined ? {} : { body: JSON.stringify({ json: input }) }),
    }),
  )
  const body = (await response.json()) as {
    error?: { json?: { data?: { code?: string } } }
    result?: {
      data?: {
        json?: {
          devCode?: string | null
          verified?: boolean
          profile?: { id: string }
          token?: string
        }
      }
    }
  }
  return {
    http: response.status,
    error: body.error?.json?.data?.code,
    data: body.result?.data?.json ?? {},
  }
}
try {
  globalThis.fetch = Object.assign(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.ok(
        String(url).startsWith("https://graph.facebook.com/"),
        "Only inert Meta transport is permitted",
      )
      const body = JSON.parse(String(init?.body))
      assert.equal(body.to, phone.slice(1))
      code = body.template.components[0].parameters[0].text
      assert.match(code, /^\d{6}$/)
      sends++
      return Response.json({
        messages: [
          { id: "wamid.synthetic-account-phone", message_status: "accepted" },
        ],
      })
    },
    { preconnect: originalFetch.preconnect },
  )
  const user = await prisma.user.create({
    data: {
      name: marker,
      email: `${marker}@example.invalid`,
      emailVerified: true,
      phone,
      ageBand: "ADULT",
      ageDeclaredAt: new Date(),
    },
    select: { id: true, email: true },
  })
  userId = user.id
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      token: randomUUID() + randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    },
    select: { id: true, token: true },
  })
  sessionId = session.id
  let result = await call("auth.requestAccountPhoneOtp", {}, session.token)
  assert.equal(result.http, 200)
  assert.equal(result.data.devCode, null)
  assert.equal(sends, 1)
  const initialCode = code
  const race = await Promise.all([
    call("auth.verifyAccountPhoneOtp", { code: initialCode }, session.token),
    call("auth.verifyAccountPhoneOtp", { code: initialCode }, session.token),
  ])
  assert.equal(race.filter((response) => response.http === 200).length, 1)
  assert.equal(race.filter((response) => response.http !== 200).length, 1)
  assert.equal(
    race.find((response) => response.http === 200)?.data.verified,
    true,
  )
  const verified = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      phoneVerifiedAt: true,
      phone: true,
      email: true,
      emailVerified: true,
    },
  })
  assert.ok(verified.phoneVerifiedAt)
  assert.equal(verified.phone, phone)
  assert.equal(verified.email, user.email)
  assert.equal(verified.emailVerified, true)
  result = await call(
    "auth.verifyAccountPhoneOtp",
    { code: initialCode },
    session.token,
  )
  assert.notEqual(result.http, 200)
  result = await call("auth.requestPhoneOtp", { phone, mode: "login" })
  assert.equal(result.http, 200)
  assert.equal(result.data.devCode, null)
  assert.equal(sends, 2)
  result = await call("auth.verifyPhoneOtp", { phone, mode: "login", code })
  assert.equal(result.http, 200)
  assert.equal(result.data.profile?.id, user.id)
  assert.ok(result.data.token)
  const sessions = await prisma.session.count({ where: { userId: user.id } })
  assert.equal(sessions, 2)
  result = await call("auth.verifyPhoneOtp", { phone, mode: "login", code })
  assert.notEqual(result.http, 200)
  console.log(
    JSON.stringify({
      passed: true,
      realHttp: true,
      realDevelopmentDatabase: true,
      metaStubbed: true,
      linkedExistingAccount: true,
      sameAccountPhoneLogin: true,
      replayRefused: true,
      concurrentVerificationSingleWinner: true,
      profilePreserved: true,
      productionChanged: false,
      sends,
    }),
  )
} finally {
  globalThis.fetch = originalFetch
  if (userId) {
    const owned = await prisma.user.findFirst({
      where: {
        id: userId,
        name: marker,
        phone,
        email: `${marker}@example.invalid`,
      },
      select: { id: true },
    })
    assert.ok(owned, "Cleanup requires exact owned fixture identity")
    const { phoneOtpIdentifiersForPhone, phoneAuthDigest } = await import(
      "../packages/db/src/queries/phone-otp-identifier"
    )
    const exactIdentifiers = phoneOtpIdentifiersForPhone(phone)
    if (sessionId)
      exactIdentifiers.push(
        `phone-auth:verify-account:${phoneAuthDigest(JSON.stringify([userId, sessionId, phone]))}`,
      )
    await prisma.verification.deleteMany({
      where: { identifier: { in: exactIdentifiers } },
    })
    await prisma.accountPrivacyRateBucket.deleteMany({
      where: {
        bucketDigest: {
          in: [`phone:${phone}`, `account-verification:${userId}`].map((key) =>
            phoneAuthDigest(`phone-otp-rate:${key}`),
          ),
        },
        windowStartedAt: { gte: startedAt },
      },
    })
    await prisma.session.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  }
  await prisma.$disconnect()
}

process.exit(0)
